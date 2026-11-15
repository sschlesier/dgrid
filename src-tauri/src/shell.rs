//! Runs an instrumented script through `mongosh` and collects what it reported.
//!
//! The script calls `__dgrid.result(index, value)` (defined by `shell_prelude.js`), which
//! appends one canonical Extended JSON line per value to a result file. After the child
//! exits, each line is mapped to documents in the tagged format of `bson_ser`.

use std::collections::VecDeque;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Instant;

use mongodb::bson::Bson;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::Command;
use tokio_util::sync::CancellationToken;

use crate::bson_ser::{serialize_bson_value, serialize_document};
use crate::error::DgridError;
use crate::pool::ConnectionPool;

const PRELUDE: &str = include_str!("shell_prelude.js");
const PRELUDE_FILE: &str = "prelude.js";
const SCRIPT_FILE: &str = "script.js";
const RESULT_FILE: &str = "results.jsonl";

const MONGOSH_PATH_ENV: &str = "DGRID_MONGOSH_PATH";
const MONGOSH_NOT_FOUND: &str =
    "mongosh was not found on PATH. Install the MongoDB Shell to use Shell mode.";

const UNREADABLE_PLACEHOLDER: &str = "[not displayable: object]";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const OUTPUT_CAP_BYTES: usize = 1_048_576;
const OUTPUT_TRUNCATED_LINE: &str = "… output truncated";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteShellRequest {
    /// Already instrumented by the frontend; never parsed here.
    pub script: String,
    pub database: String,
    pub tab_id: Option<String>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShellResult {
    pub index: i64,
    pub kind: String,
    pub documents: Vec<Map<String, Value>>,
    pub truncated: bool,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShellError {
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteShellResponse {
    pub results: Vec<ShellResult>,
    pub output: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ShellError>,
    pub execution_time_ms: u64,
}

/// Run `request.script` through mongosh against the pooled connection `id`.
///
/// A script that fails is not an `Err`: the response carries `error` next to whatever
/// results and output were collected before the failure.
pub async fn execute_shell(
    pool: &ConnectionPool,
    id: &str,
    request: ExecuteShellRequest,
    token: CancellationToken,
) -> Result<ExecuteShellResponse, DgridError> {
    let uri = pool.get_uri(id).await.ok_or_else(|| DgridError::NotFound {
        entity: "Connection".into(),
        id: id.into(),
    })?;

    let program = mongosh_program(std::env::var_os(MONGOSH_PATH_ENV));
    run_script(&program, &uri, &request, token, |_, _, _| {}).await
}

/// `DGRID_MONGOSH_PATH` when set and not empty, else the bare name for the OS to resolve
/// through `PATH`.
fn mongosh_program(override_path: Option<OsString>) -> OsString {
    override_path
        .filter(|path| !path.is_empty())
        .unwrap_or_else(|| OsString::from("mongosh"))
}

/// The connection URI is deliberately not an argument: it reaches the child through the
/// environment so it never shows up in the process list.
fn mongosh_args(dir: &Path) -> Vec<OsString> {
    vec![
        "--nodb".into(),
        "--quiet".into(),
        "--norc".into(),
        dir.join(PRELUDE_FILE).into_os_string(),
        dir.join(SCRIPT_FILE).into_os_string(),
    ]
}

/// The per-run temp directory, removed on drop so every exit path cleans up.
struct RunDir {
    path: PathBuf,
}

impl RunDir {
    fn create() -> std::io::Result<Self> {
        let path = std::env::temp_dir().join(format!("dgrid-shell-{}", uuid::Uuid::new_v4()));
        let mut builder = std::fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&path)?;
        Ok(Self { path })
    }
}

impl Drop for RunDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

/// Spawn `program` on the script and collect its results and output.
///
/// `on_spawn` receives the child's pid, its arguments and the run's temp directory right
/// after the spawn; tests use it to inspect a run in progress.
async fn run_script(
    program: &OsStr,
    uri: &str,
    request: &ExecuteShellRequest,
    token: CancellationToken,
    on_spawn: impl FnOnce(Option<u32>, &[OsString], &Path),
) -> Result<ExecuteShellResponse, DgridError> {
    let start = Instant::now();

    let dir = RunDir::create().map_err(io_error)?;
    let result_path = dir.path.join(RESULT_FILE);
    tokio::fs::write(dir.path.join(PRELUDE_FILE), PRELUDE)
        .await
        .map_err(io_error)?;
    tokio::fs::write(dir.path.join(SCRIPT_FILE), &request.script)
        .await
        .map_err(io_error)?;

    let args = mongosh_args(&dir.path);
    let mut command = Command::new(program);
    command
        .args(&args)
        .env("DGRID_SHELL_URI", uri)
        .env("DGRID_SHELL_DB", &request.database)
        .env("DGRID_SHELL_OUT", &result_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    // mongosh is a console program; without this, Windows opens a console window per run.
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let mut child = command.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            DgridError::QueryExecution(MONGOSH_NOT_FOUND.into())
        } else {
            io_error(e)
        }
    })?;

    on_spawn(child.id(), &args, &dir.path);

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let collected = Mutex::new(CollectedOutput::default());

    let finished = {
        let run = async {
            let (_, _, status) = tokio::join!(
                drain(stdout, &collected, Stream::Stdout),
                drain(stderr, &collected, Stream::Stderr),
                child.wait(),
            );
            status
        };
        tokio::select! {
            status = run => Some(status),
            _ = token.cancelled() => None,
        }
    };

    let Some(status) = finished else {
        // Wait for the kill so the child is gone before its temp directory is.
        let _ = child.kill().await;
        return Err(DgridError::QueryCancelled);
    };
    let status = status.map_err(io_error)?;

    let collected = collected
        .into_inner()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    let error = if status.success() {
        None
    } else {
        let stderr_text = collected.stderr.to_text();
        let stderr_text = stderr_text.trim();
        let message = if !stderr_text.is_empty() {
            stderr_text.to_string()
        } else {
            match status.code() {
                Some(code) => format!("mongosh exited with code {code}"),
                None => "mongosh exited without an exit code".to_string(),
            }
        };
        Some(ShellError { message })
    };

    let results = match tokio::fs::read_to_string(&result_path).await {
        Ok(text) => parse_results(&text).map_err(DgridError::QueryExecution)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(e) => return Err(io_error(e)),
    };

    Ok(ExecuteShellResponse {
        results,
        output: collected.merged.to_text(),
        error,
        execution_time_ms: start.elapsed().as_millis() as u64,
    })
}

fn io_error(e: std::io::Error) -> DgridError {
    DgridError::QueryExecution(e.to_string())
}

#[derive(Clone, Copy, PartialEq)]
enum Stream {
    Stdout,
    Stderr,
}

/// Bytes kept up to `OUTPUT_CAP_BYTES`; anything past the cap is counted as truncated.
#[derive(Default)]
struct CappedBuffer {
    bytes: Vec<u8>,
    truncated: bool,
}

impl CappedBuffer {
    fn push(&mut self, chunk: &[u8]) {
        let room = OUTPUT_CAP_BYTES - self.bytes.len();
        if chunk.len() > room {
            self.truncated = true;
        }
        self.bytes
            .extend_from_slice(&chunk[..chunk.len().min(room)]);
    }

    fn to_text(&self) -> String {
        if !self.truncated {
            return String::from_utf8_lossy(&self.bytes).into_owned();
        }

        // The cap may have split a multi-byte character; drop the partial tail.
        let kept = match std::str::from_utf8(&self.bytes) {
            Err(e) if e.error_len().is_none() => &self.bytes[..e.valid_up_to()],
            _ => &self.bytes[..],
        };
        let mut text = String::from_utf8_lossy(kept).into_owned();
        if !text.is_empty() && !text.ends_with('\n') {
            text.push('\n');
        }
        text.push_str(OUTPUT_TRUNCATED_LINE);
        text
    }
}

/// The last `OUTPUT_CAP_BYTES` bytes pushed. A thrown error is the last thing mongosh
/// writes to stderr, so the error message keeps the end of the stream.
#[derive(Default)]
struct TailBuffer {
    bytes: VecDeque<u8>,
}

impl TailBuffer {
    fn push(&mut self, chunk: &[u8]) {
        self.bytes.extend(chunk);
        let excess = self.bytes.len().saturating_sub(OUTPUT_CAP_BYTES);
        self.bytes.drain(..excess);
    }

    fn to_text(&self) -> String {
        // Dropping the front may have split a multi-byte character; skip its remainder.
        let bytes: Vec<u8> = self
            .bytes
            .iter()
            .copied()
            .skip_while(|b| b & 0b1100_0000 == 0b1000_0000)
            .collect();
        String::from_utf8_lossy(&bytes).into_owned()
    }
}

#[derive(Default)]
struct CollectedOutput {
    /// stdout and stderr in arrival order.
    merged: CappedBuffer,
    stderr: TailBuffer,
}

/// Read a pipe to its end. Reading continues past the output cap so the child never
/// blocks on a full pipe.
async fn drain(
    pipe: Option<impl AsyncRead + Unpin>,
    collected: &Mutex<CollectedOutput>,
    stream: Stream,
) {
    let Some(mut pipe) = pipe else { return };
    let mut chunk = [0u8; 8192];
    loop {
        match pipe.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                let mut collected = collected
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                collected.merged.push(&chunk[..n]);
                if stream == Stream::Stderr {
                    collected.stderr.push(&chunk[..n]);
                }
            }
        }
    }
}

/// Parse the result file: one canonical Extended JSON envelope per line, returned sorted
/// by `index`.
fn parse_results(text: &str) -> Result<Vec<ShellResult>, String> {
    let mut results = text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(parse_result_line)
        .collect::<Result<Vec<_>, _>>()?;
    results.sort_by_key(|result| result.index);
    Ok(results)
}

fn parse_result_line(line: &str) -> Result<ShellResult, String> {
    let invalid = |reason: String| format!("Could not read a shell result: {reason}");

    let json: Value = serde_json::from_str(line).map_err(|e| invalid(e.to_string()))?;
    let Value::Object(mut envelope) = json else {
        return Err(invalid("expected an object".into()));
    };

    // The envelope is Extended JSON too: `index` arrives as `{"$numberInt": "0"}`.
    let index = match envelope.remove("index").map(Bson::try_from) {
        Some(Ok(Bson::Int32(i))) => i64::from(i),
        Some(Ok(Bson::Int64(i))) => i,
        Some(Ok(Bson::Double(f))) => f as i64,
        _ => return Err(invalid("missing index".into())),
    };
    let kind = match envelope.remove("kind") {
        Some(Value::String(kind)) => kind,
        _ => return Err(invalid("missing kind".into())),
    };
    let truncated = envelope.get("truncated").and_then(Value::as_bool) == Some(true);
    let documents = to_documents(envelope.remove("value").unwrap_or(Value::Null));

    Ok(ShellResult {
        index,
        kind,
        documents,
        truncated,
    })
}

/// A document is one document, an array is one document per element, and anything that
/// is not a document is wrapped as `{ "value": <it> }`.
fn to_documents(value: Value) -> Vec<Map<String, Value>> {
    match value {
        Value::Array(items) => items.into_iter().map(to_document).collect(),
        other => vec![to_document(other)],
    }
}

/// `value` is canonical Extended JSON. mongosh can emit some that is not valid, such as
/// an invalid Date or a user object with `$`-keys that only look like Extended JSON; that
/// value becomes a placeholder so the rest of the run is still returned.
fn to_document(value: Value) -> Map<String, Value> {
    match Bson::try_from(value) {
        Ok(Bson::Document(doc)) => serialize_document(&doc),
        Ok(other) => wrap_value(serialize_bson_value(&other)),
        Err(_) => wrap_value(Value::String(UNREADABLE_PLACEHOLDER.into())),
    }
}

fn wrap_value(value: Value) -> Map<String, Value> {
    let mut wrapped = Map::new();
    wrapped.insert("value".into(), value);
    wrapped
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn parse_one(line: &str) -> ShellResult {
        parse_result_line(line).unwrap()
    }

    fn request(script: &str, database: &str) -> ExecuteShellRequest {
        ExecuteShellRequest {
            script: script.into(),
            database: database.into(),
            tab_id: None,
        }
    }

    // --- mapping ---

    #[test]
    fn cursor_line_maps_to_tagged_documents() {
        let result = parse_one(
            r#"{"index":{"$numberInt":"0"},"kind":"cursor","truncated":false,"value":[{"_id":{"$oid":"507f1f77bcf86cd799439011"},"at":{"$date":{"$numberLong":"0"}},"n":{"$numberLong":"5"},"name":"Alice"}]}"#,
        );

        assert_eq!(result.index, 0);
        assert_eq!(result.kind, "cursor");
        assert!(!result.truncated);
        assert_eq!(
            Value::Array(result.documents.into_iter().map(Value::Object).collect()),
            json!([{
                "_id": { "_type": "ObjectId", "_value": "507f1f77bcf86cd799439011" },
                "at": { "_type": "Date", "_value": "1970-01-01T00:00:00.000Z" },
                "n": { "_type": "Long", "_value": "5" },
                "name": "Alice"
            }])
        );
    }

    #[test]
    fn other_tagged_types_map_like_query_results() {
        let result = parse_one(
            r#"{"index":{"$numberInt":"0"},"kind":"value","truncated":false,"value":{"dec":{"$numberDecimal":"1.5"},"u":{"$binary":{"base64":"5ccZwC/qQTyuouGpAa8ErA==","subType":"04"}},"bin":{"$binary":{"base64":"AQID","subType":"00"}},"dbl":{"$numberDouble":"6.5"},"big":{"$numberLong":"5000000000"}}}"#,
        );

        assert_eq!(
            Value::Object(result.documents[0].clone()),
            json!({
                "dec": { "_type": "Decimal128", "_value": "1.5" },
                "u": { "_type": "UUID", "_value": "e5c719c0-2fea-413c-aea2-e1a901af04ac" },
                "bin": { "_type": "Binary", "_value": "AQID" },
                "dbl": 6.5,
                "big": { "_type": "Long", "_value": "5000000000" }
            })
        );
    }

    #[test]
    fn less_common_types_are_readable() {
        let cases = [
            (r#"{"$numberDouble":"NaN"}"#, json!([{ "value": null }])),
            (
                r#"{"$numberDouble":"Infinity"}"#,
                json!([{ "value": null }]),
            ),
            (
                r#"{"$timestamp":{"t":1,"i":2}}"#,
                json!([{ "value": { "t": 1, "i": 2 } }]),
            ),
            (
                r#"{"$regularExpression":{"pattern":"a","options":"i"}}"#,
                json!([{ "value": { "$regex": "a", "$options": "i" } }]),
            ),
            (r#"{"$minKey":1}"#, json!([{ "value": "MinKey" }])),
            (r#"{"$maxKey":1}"#, json!([{ "value": "MaxKey" }])),
            (r#"{"$code":"x"}"#, json!([{ "value": "x" }])),
            (r#"{"$symbol":"s"}"#, json!([{ "value": "s" }])),
            (
                r#"{"$binary":{"base64":"AQID","subType":"05"}}"#,
                json!([{ "value": { "_type": "Binary", "_value": "AQID" } }]),
            ),
            (
                r#"{"a":null,"b":[null]}"#,
                json!([{ "a": null, "b": [null] }]),
            ),
        ];

        for (value, expected) in cases {
            let result = parse_one(&format!(
                r#"{{"index":{{"$numberInt":"0"}},"kind":"value","truncated":false,"value":{value}}}"#
            ));

            assert_eq!(
                Value::Array(result.documents.into_iter().map(Value::Object).collect()),
                expected,
                "{value}"
            );
        }
    }

    #[test]
    fn unreadable_values_become_placeholders() {
        for value in [
            r#"{"$date":{"$numberLong":"NaN"}}"#,
            r#"{"$oid":{"$numberInt":"5"}}"#,
            r#"{"when":{"$date":{"$numberLong":"NaN"}}}"#,
        ] {
            let result = parse_one(&format!(
                r#"{{"index":{{"$numberInt":"3"}},"kind":"value","truncated":false,"value":{value}}}"#
            ));

            assert_eq!(result.index, 3, "{value}");
            assert_eq!(
                Value::Array(result.documents.into_iter().map(Value::Object).collect()),
                json!([{ "value": "[not displayable: object]" }]),
                "{value}"
            );
        }
    }

    #[test]
    fn unreadable_element_does_not_hide_the_readable_ones() {
        let result = parse_one(
            r#"{"index":{"$numberInt":"0"},"kind":"cursor","truncated":true,"value":[{"a":{"$numberInt":"1"}},{"at":{"$date":{"$numberLong":"NaN"}}},{"a":{"$numberInt":"3"}}]}"#,
        );

        assert_eq!(result.kind, "cursor");
        assert!(result.truncated);
        assert_eq!(
            Value::Array(result.documents.into_iter().map(Value::Object).collect()),
            json!([
                { "a": 1 },
                { "value": "[not displayable: object]" },
                { "a": 3 }
            ])
        );
    }

    #[test]
    fn scalar_is_wrapped_as_one_value_document() {
        let result = parse_one(
            r#"{"index":{"$numberInt":"1"},"kind":"value","truncated":false,"value":{"$numberInt":"6"}}"#,
        );

        assert_eq!(result.kind, "value");
        assert_eq!(
            Value::Object(result.documents[0].clone()),
            json!({ "value": 6 })
        );
        assert_eq!(result.documents.len(), 1);
    }

    #[test]
    fn plain_object_is_one_document() {
        let result = parse_one(
            r#"{"index":{"$numberInt":"0"},"kind":"value","truncated":false,"value":{"a":{"$numberInt":"1"},"b":"x"}}"#,
        );

        assert_eq!(result.documents.len(), 1);
        assert_eq!(
            Value::Object(result.documents[0].clone()),
            json!({ "a": 1, "b": "x" })
        );
    }

    #[test]
    fn array_of_scalars_is_one_value_document_per_element() {
        let result = parse_one(
            r#"{"index":{"$numberInt":"0"},"kind":"value","truncated":false,"value":[{"$numberInt":"1"},"two",{"k":true}]}"#,
        );

        assert_eq!(
            Value::Array(result.documents.into_iter().map(Value::Object).collect()),
            json!([{ "value": 1 }, { "value": "two" }, { "k": true }])
        );
    }

    #[test]
    fn null_is_one_value_document() {
        let result = parse_one(
            r#"{"index":{"$numberInt":"0"},"kind":"value","truncated":false,"value":null}"#,
        );

        assert_eq!(
            Value::Object(result.documents[0].clone()),
            json!({ "value": null })
        );
        assert_eq!(result.documents.len(), 1);
    }

    #[test]
    fn empty_array_is_a_result_with_no_documents() {
        let result = parse_one(
            r#"{"index":{"$numberInt":"0"},"kind":"value","truncated":false,"value":[]}"#,
        );

        assert!(result.documents.is_empty());
    }

    #[test]
    fn missing_value_is_one_null_value_document() {
        let result = parse_one(r#"{"index":{"$numberInt":"0"},"kind":"value","truncated":false}"#);

        assert_eq!(
            Value::Array(result.documents.into_iter().map(Value::Object).collect()),
            json!([{ "value": null }])
        );
    }

    #[test]
    fn truncated_flag_is_carried_over() {
        let result = parse_one(
            r#"{"index":{"$numberInt":"0"},"kind":"cursor","truncated":true,"value":[]}"#,
        );

        assert!(result.truncated);
    }

    #[test]
    fn results_are_sorted_by_index() {
        let text = [
            r#"{"index":{"$numberInt":"2"},"kind":"value","truncated":false,"value":"c"}"#,
            r#"{"index":{"$numberInt":"0"},"kind":"value","truncated":false,"value":"a"}"#,
            "",
            r#"{"index":{"$numberInt":"1"},"kind":"value","truncated":false,"value":"b"}"#,
        ]
        .join("\n");

        let results = parse_results(&text).unwrap();

        assert_eq!(
            results.iter().map(|r| r.index).collect::<Vec<_>>(),
            vec![0, 1, 2]
        );
    }

    #[test]
    fn unreadable_line_is_an_error() {
        let err = parse_results("{not json").unwrap_err();

        assert!(err.starts_with("Could not read a shell result"));
    }

    #[test]
    fn response_omits_error_when_none_and_uses_camel_case() {
        let response = ExecuteShellResponse {
            results: vec![],
            output: String::new(),
            error: None,
            execution_time_ms: 3,
        };

        assert_eq!(
            serde_json::to_value(&response).unwrap(),
            json!({ "results": [], "output": "", "executionTimeMs": 3 })
        );
    }

    // --- output cap ---

    #[test]
    fn output_under_the_cap_is_unchanged() {
        let mut buffer = CappedBuffer::default();
        buffer.push(b"hello\n");

        assert_eq!(buffer.to_text(), "hello\n");
    }

    #[test]
    fn output_exactly_at_the_cap_is_not_marked_truncated() {
        let mut buffer = CappedBuffer::default();
        buffer.push(&vec![b'a'; OUTPUT_CAP_BYTES]);

        assert_eq!(buffer.to_text().len(), OUTPUT_CAP_BYTES);
    }

    #[test]
    fn output_over_the_cap_is_cut_with_a_final_line() {
        let mut buffer = CappedBuffer::default();
        buffer.push(&vec![b'a'; OUTPUT_CAP_BYTES - 10]);
        buffer.push(&[b'b'; 100]);
        buffer.push(b"dropped");

        let text = buffer.to_text();

        let (kept, last_line) = text.rsplit_once('\n').unwrap();
        assert_eq!(kept.len(), OUTPUT_CAP_BYTES);
        assert!(kept.ends_with("bbbbbbbbbb"));
        assert_eq!(last_line, OUTPUT_TRUNCATED_LINE);
    }

    #[test]
    fn output_over_the_cap_ending_in_a_newline_gets_no_blank_line() {
        let mut buffer = CappedBuffer::default();
        buffer.push(&vec![b'a'; OUTPUT_CAP_BYTES - 1]);
        buffer.push(b"\nmore");

        let text = buffer.to_text();

        assert!(
            text.ends_with(&format!("a\n{OUTPUT_TRUNCATED_LINE}")),
            "{}",
            &text[text.len() - 40..]
        );
    }

    #[test]
    fn stderr_tail_starts_on_a_character_boundary() {
        let mut buffer = TailBuffer::default();
        buffer.push("é".as_bytes());
        buffer.push(&vec![b'a'; OUTPUT_CAP_BYTES - 1]);

        let text = buffer.to_text();

        assert_eq!(text.len(), OUTPUT_CAP_BYTES - 1);
        assert!(text.bytes().all(|b| b == b'a'));
    }

    #[test]
    fn stderr_tail_keeps_the_end_of_the_stream() {
        let mut buffer = TailBuffer::default();
        buffer.push(&vec![b'a'; OUTPUT_CAP_BYTES]);
        buffer.push(b"Error: boom");

        let text = buffer.to_text();

        assert_eq!(text.len(), OUTPUT_CAP_BYTES);
        assert!(text.ends_with("aaaError: boom"));
    }

    #[test]
    fn output_cap_cuts_on_a_utf8_boundary() {
        let mut buffer = CappedBuffer::default();
        buffer.push(&vec![b'a'; OUTPUT_CAP_BYTES - 1]);
        buffer.push("é".as_bytes());

        let text = buffer.to_text();

        let (kept, last_line) = text.rsplit_once('\n').unwrap();
        assert_eq!(kept.len(), OUTPUT_CAP_BYTES - 1);
        assert!(kept.bytes().all(|b| b == b'a'));
        assert_eq!(last_line, OUTPUT_TRUNCATED_LINE);
    }

    // --- finding and invoking mongosh ---

    #[test]
    fn mongosh_program_defaults_to_path_lookup() {
        assert_eq!(mongosh_program(None), OsString::from("mongosh"));
        assert_eq!(
            mongosh_program(Some(OsString::new())),
            OsString::from("mongosh")
        );
    }

    #[test]
    fn mongosh_program_uses_the_override() {
        assert_eq!(
            mongosh_program(Some(OsString::from("/opt/tools/mongosh"))),
            OsString::from("/opt/tools/mongosh")
        );
    }

    #[test]
    fn args_are_the_fixed_flags_and_the_two_files() {
        let dir = Path::new("/tmp/dgrid-shell-x");

        let args = mongosh_args(dir);

        assert_eq!(
            args,
            vec![
                OsString::from("--nodb"),
                OsString::from("--quiet"),
                OsString::from("--norc"),
                dir.join("prelude.js").into_os_string(),
                dir.join("script.js").into_os_string(),
            ]
        );
        assert!(!args
            .iter()
            .any(|arg| arg.to_string_lossy().contains("mongodb")));
    }

    #[tokio::test]
    async fn missing_mongosh_reports_path_message() {
        let mut seen_dir = None;

        let err = run_script(
            OsStr::new("/nonexistent/dgrid-test/mongosh"),
            "mongodb://localhost:27017",
            &request("1", "test"),
            CancellationToken::new(),
            |_, _, dir| seen_dir = Some(dir.to_path_buf()),
        )
        .await
        .unwrap_err();

        assert!(matches!(err, DgridError::QueryExecution(_)));
        assert!(err.to_string().contains("mongosh"));
        assert!(err.to_string().contains("PATH"));
        assert!(seen_dir.is_none(), "nothing was spawned");
    }

    #[tokio::test]
    async fn unknown_connection_is_not_found() {
        let pool = ConnectionPool::new();

        let err = execute_shell(
            &pool,
            "missing",
            request("1", "test"),
            CancellationToken::new(),
        )
        .await
        .unwrap_err();

        assert!(matches!(err, DgridError::NotFound { .. }));
    }

    // --- integration ---
    //
    // These need a real MongoDB and `mongosh` on PATH (or DGRID_MONGOSH_PATH).
    // Run with: MONGODB_TEST_URI=mongodb://localhost:27017 cargo test -- --ignored shell

    use crate::pool::MongoConnectionOptions;
    use mongodb::bson::{doc, oid::ObjectId, DateTime, Document};
    use mongodb::Database;

    const CONNECTION_ID: &str = "shell-test";

    /// A pooled connection and a database that belongs to one test.
    struct TestDb {
        pool: ConnectionPool,
        uri: String,
        name: String,
    }

    impl TestDb {
        async fn create(name: &str) -> Self {
            let uri = std::env::var("MONGODB_TEST_URI").unwrap();
            let pool = ConnectionPool::new();
            pool.connect(
                CONNECTION_ID,
                MongoConnectionOptions {
                    uri: uri.clone(),
                    database: None,
                },
            )
            .await
            .unwrap();
            let test_db = Self {
                pool,
                uri,
                name: name.into(),
            };
            test_db.db().await.drop().await.unwrap();
            test_db
        }

        async fn db(&self) -> Database {
            self.pool
                .get_db(CONNECTION_ID, Some(&self.name))
                .await
                .unwrap()
        }

        async fn seed(&self, docs: Vec<Document>) {
            self.db()
                .await
                .collection::<Document>("items")
                .insert_many(docs)
                .await
                .unwrap();
        }

        /// Run through the pool, as the Tauri command does.
        async fn run(&self, script: &str) -> ExecuteShellResponse {
            execute_shell(
                &self.pool,
                CONNECTION_ID,
                request(script, &self.name),
                CancellationToken::new(),
            )
            .await
            .unwrap()
        }

        async fn cleanup(self) {
            self.db().await.drop().await.unwrap();
            self.pool.force_disconnect(CONNECTION_ID).await;
        }
    }

    fn documents_json(result: &ShellResult) -> Value {
        Value::Array(
            result
                .documents
                .iter()
                .cloned()
                .map(Value::Object)
                .collect(),
        )
    }

    fn process_is_running(pid: u32) -> bool {
        std::process::Command::new("ps")
            .args(["-p", &pid.to_string()])
            .output()
            .unwrap()
            .status
            .success()
    }

    #[tokio::test]
    #[ignore]
    async fn shell_cursor_returns_tagged_documents() {
        let test_db = TestDb::create("dgrid_shell_cursor_test").await;
        let seeded = doc! {
            "_id": ObjectId::new(),
            "at": DateTime::from_millis(1_700_000_000_000),
            "n": 5_i64,
            "name": "Alice",
        };
        test_db.seed(vec![seeded.clone()]).await;

        let response = test_db.run("__dgrid.result(0, db.items.find({}))").await;

        assert!(response.error.is_none(), "{:?}", response.error);
        assert_eq!(response.results.len(), 1);
        let result = &response.results[0];
        assert_eq!(result.index, 0);
        assert_eq!(result.kind, "cursor");
        assert!(!result.truncated);
        // serialize_document is what execute_query returns documents through.
        assert_eq!(result.documents, vec![serialize_document(&seeded)]);
        assert_eq!(result.documents[0]["_id"]["_type"], "ObjectId");
        assert_eq!(result.documents[0]["at"]["_type"], "Date");
        assert_eq!(
            result.documents[0]["n"],
            json!({ "_type": "Long", "_value": "5" })
        );

        test_db.cleanup().await;
    }

    #[tokio::test]
    #[ignore]
    async fn shell_three_results_come_back_in_index_order() {
        let test_db = TestDb::create("dgrid_shell_order_test").await;

        let response = test_db
            .run("__dgrid.result(2, 'c'); __dgrid.result(0, 'a'); __dgrid.result(1, 'b');")
            .await;

        assert_eq!(
            response
                .results
                .iter()
                .map(|r| (r.index, documents_json(r)))
                .collect::<Vec<_>>(),
            vec![
                (0, json!([{ "value": "a" }])),
                (1, json!([{ "value": "b" }])),
                (2, json!([{ "value": "c" }])),
            ]
        );

        test_db.cleanup().await;
    }

    #[tokio::test]
    #[ignore]
    async fn shell_values_are_wrapped_by_shape() {
        let test_db = TestDb::create("dgrid_shell_values_test").await;

        let response = test_db
            .run(
                "__dgrid.result(0, 6);\n\
                 __dgrid.result(1, { a: 1, b: 'x' });\n\
                 __dgrid.result(2, [1, 'two']);\n\
                 __dgrid.result(3, undefined);\n\
                 __dgrid.result(4, null);\n\
                 __dgrid.result(5, []);",
            )
            .await;

        assert!(response.error.is_none(), "{:?}", response.error);
        assert_eq!(
            response
                .results
                .iter()
                .map(|r| (r.index, r.kind.as_str(), documents_json(r)))
                .collect::<Vec<_>>(),
            vec![
                (0, "value", json!([{ "value": 6 }])),
                (1, "value", json!([{ "a": 1, "b": "x" }])),
                (2, "value", json!([{ "value": 1 }, { "value": "two" }])),
                (4, "value", json!([{ "value": null }])),
                (5, "value", json!([])),
            ]
        );

        test_db.cleanup().await;
    }

    #[tokio::test]
    #[ignore]
    async fn shell_unserializable_values_report_a_placeholder() {
        let test_db = TestDb::create("dgrid_shell_placeholder_test").await;

        let response = test_db
            .run(
                "__dgrid.result(0, db.items);\n\
                 __dgrid.result(1, function () {});\n\
                 const bare = Object.create(null); bare.self = bare;\n\
                 __dgrid.result(2, bare);\n\
                 __dgrid.result(3, 'after');",
            )
            .await;

        assert!(response.error.is_none(), "{:?}", response.error);
        assert_eq!(
            response
                .results
                .iter()
                .map(|r| (r.index, r.kind.as_str(), documents_json(r)))
                .collect::<Vec<_>>(),
            vec![
                (
                    0,
                    "value",
                    json!([{ "value": "[not displayable: Collection]" }])
                ),
                (
                    1,
                    "value",
                    json!([{ "value": "[not displayable: function]" }])
                ),
                (
                    2,
                    "value",
                    json!([{ "value": "[not displayable: object]" }])
                ),
                (3, "value", json!([{ "value": "after" }])),
            ]
        );

        test_db.cleanup().await;
    }

    #[tokio::test]
    #[ignore]
    async fn shell_unreadable_values_and_cursor_items_report_a_placeholder() {
        let test_db = TestDb::create("dgrid_shell_unreadable_test").await;
        test_db.seed(vec![doc! { "n": 1 }]).await;

        let response = test_db
            .run(
                "__dgrid.result(0, new Date('garbage'));\n\
                 __dgrid.result(1, { $oid: 5 });\n\
                 __dgrid.result(2, db.items.find({}).map(() => db.items));\n\
                 __dgrid.result(3, Symbol('s'));\n\
                 __dgrid.result(4, 'after');",
            )
            .await;

        assert!(response.error.is_none(), "{:?}", response.error);
        assert_eq!(
            response
                .results
                .iter()
                .map(|r| (r.index, r.kind.as_str(), documents_json(r)))
                .collect::<Vec<_>>(),
            vec![
                (
                    0,
                    "value",
                    json!([{ "value": "[not displayable: object]" }])
                ),
                (
                    1,
                    "value",
                    json!([{ "value": "[not displayable: object]" }])
                ),
                (
                    2,
                    "value",
                    json!([{ "value": "[not displayable: Cursor]" }])
                ),
                (
                    3,
                    "value",
                    json!([{ "value": "[not displayable: symbol]" }])
                ),
                (4, "value", json!([{ "value": "after" }])),
            ]
        );

        test_db.cleanup().await;
    }

    #[tokio::test]
    #[ignore]
    async fn shell_truncates_cursors_and_arrays_at_1000() {
        let test_db = TestDb::create("dgrid_shell_truncate_test").await;
        test_db
            .seed((0..1001).map(|i| doc! { "i": i }).collect())
            .await;

        let response = test_db
            .run(
                "__dgrid.result(0, db.items.find({}));\n\
                 __dgrid.result(1, Array.from({ length: 1001 }, (_, i) => i));\n\
                 __dgrid.result(2, db.items.find({}).limit(1000));\n\
                 __dgrid.result(3, Array.from({ length: 1000 }, (_, i) => i));",
            )
            .await;

        assert!(response.error.is_none(), "{:?}", response.error);
        assert_eq!(
            response
                .results
                .iter()
                .map(|r| (r.index, r.documents.len(), r.truncated))
                .collect::<Vec<_>>(),
            vec![
                (0, 1000, true),
                (1, 1000, true),
                (2, 1000, false),
                (3, 1000, false),
            ]
        );

        test_db.cleanup().await;
    }

    #[tokio::test]
    #[ignore]
    async fn shell_print_goes_to_output_and_db_is_the_request_database() {
        let test_db = TestDb::create("dgrid_shell_output_test").await;

        let response = test_db
            .run("print('hello'); __dgrid.result(0, db.getName());")
            .await;

        assert!(response.error.is_none(), "{:?}", response.error);
        assert!(response.output.contains("hello"), "{}", response.output);
        assert_eq!(
            documents_json(&response.results[0]),
            json!([{ "value": "dgrid_shell_output_test" }])
        );

        test_db.cleanup().await;
    }

    #[tokio::test]
    #[ignore]
    async fn shell_script_that_reports_nothing_has_no_results() {
        let test_db = TestDb::create("dgrid_shell_empty_test").await;

        let response = test_db.run("print('nothing to report')").await;

        assert!(response.error.is_none(), "{:?}", response.error);
        assert!(response.results.is_empty());
        assert!(response.output.contains("nothing to report"));

        test_db.cleanup().await;
    }

    #[tokio::test]
    #[ignore]
    async fn shell_script_error_is_data_and_temp_dir_is_removed() {
        let test_db = TestDb::create("dgrid_shell_error_test").await;
        let mut run_dir = None;

        let response = run_script(
            &mongosh_program(std::env::var_os(MONGOSH_PATH_ENV)),
            &test_db.uri,
            &request(
                "print('before the throw');\n\
                 __dgrid.result(0, 1);\n\
                 throw new Error('boom from script');\n\
                 __dgrid.result(1, 2);",
                &test_db.name,
            ),
            CancellationToken::new(),
            |_, _, dir| {
                assert!(dir.is_dir());
                run_dir = Some(dir.to_path_buf());
            },
        )
        .await
        .expect("a script error is a normal response");

        let error = response.error.expect("error is set");
        assert!(error.message.contains("boom from script"), "{error:?}");
        assert!(
            response.output.contains("before the throw"),
            "{}",
            response.output
        );
        assert_eq!(response.results.len(), 1);
        assert_eq!(
            documents_json(&response.results[0]),
            json!([{ "value": 1 }])
        );
        assert!(!run_dir.unwrap().exists());

        test_db.cleanup().await;
    }

    #[tokio::test]
    #[ignore]
    async fn shell_temp_dir_is_private_and_removed_after_success() {
        let test_db = TestDb::create("dgrid_shell_tempdir_test").await;
        let mut run_dir = None;

        let response = run_script(
            &mongosh_program(std::env::var_os(MONGOSH_PATH_ENV)),
            &test_db.uri,
            &request("__dgrid.result(0, 1)", &test_db.name),
            CancellationToken::new(),
            |_, _, dir| {
                assert!(dir.starts_with(std::env::temp_dir()));
                assert!(dir
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("dgrid-shell-"));
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let mode = std::fs::metadata(dir).unwrap().permissions().mode();
                    assert_eq!(mode & 0o777, 0o700);
                }
                run_dir = Some(dir.to_path_buf());
            },
        )
        .await
        .unwrap();

        assert!(response.error.is_none(), "{:?}", response.error);
        assert_eq!(response.results.len(), 1);
        assert!(!run_dir.unwrap().exists());

        test_db.cleanup().await;
    }

    #[tokio::test]
    #[ignore]
    async fn shell_dropping_the_run_kills_mongosh_and_removes_temp_dir() {
        let uri = std::env::var("MONGODB_TEST_URI").unwrap();
        let (spawned_tx, spawned_rx) = tokio::sync::oneshot::channel();
        let program = mongosh_program(std::env::var_os(MONGOSH_PATH_ENV));
        let request = request(
            "__dgrid.result(0, 1); sleep(120000);",
            "dgrid_shell_drop_test",
        );

        let run = tokio::spawn(async move {
            run_script(
                &program,
                &uri,
                &request,
                CancellationToken::new(),
                |pid, _, dir| {
                    let _ = spawned_tx.send((pid.unwrap(), dir.to_path_buf()));
                },
            )
            .await
        });
        let (pid, run_dir) = spawned_rx.await.unwrap();

        // The first result on disk means the script has reached its sleep.
        let result_file = run_dir.join(RESULT_FILE);
        let deadline = Instant::now() + std::time::Duration::from_secs(30);
        while std::fs::metadata(&result_file).map_or(true, |m| m.len() == 0) {
            assert!(Instant::now() < deadline, "script never reported a result");
            assert!(!run.is_finished(), "run ended before the sleep");
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }

        run.abort();
        let _ = run.await;

        let deadline = Instant::now() + std::time::Duration::from_secs(10);
        while process_is_running(pid) {
            assert!(Instant::now() < deadline, "mongosh {pid} is still running");
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
        assert!(!run_dir.exists());
    }

    #[tokio::test]
    #[ignore]
    async fn shell_cancel_kills_mongosh_and_removes_temp_dir() {
        let test_db = TestDb::create("dgrid_shell_cancel_test").await;
        let token = CancellationToken::new();
        let (spawned_tx, spawned_rx) = tokio::sync::oneshot::channel();

        let run = tokio::spawn({
            let token = token.clone();
            let uri = test_db.uri.clone();
            let request = request("__dgrid.result(0, 1); sleep(120000);", &test_db.name);
            let program = mongosh_program(std::env::var_os(MONGOSH_PATH_ENV));
            async move {
                run_script(&program, &uri, &request, token, |pid, _, dir| {
                    let _ = spawned_tx.send((pid.unwrap(), dir.to_path_buf()));
                })
                .await
            }
        });
        let (pid, run_dir) = spawned_rx.await.unwrap();

        // The first result on disk means the script has reached its sleep.
        let result_file = run_dir.join(RESULT_FILE);
        let deadline = Instant::now() + std::time::Duration::from_secs(30);
        while std::fs::metadata(&result_file).map_or(true, |m| m.len() == 0) {
            assert!(Instant::now() < deadline, "script never reported a result");
            assert!(!run.is_finished(), "run ended before the sleep");
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }

        #[cfg(unix)]
        {
            let ps = std::process::Command::new("ps")
                .args(["-o", "args=", "-p", &pid.to_string()])
                .output()
                .unwrap();
            let args = String::from_utf8_lossy(&ps.stdout);
            assert!(args.contains("mongosh"), "unexpected process: {args}");
            assert!(!args.contains(&test_db.uri), "URI in arguments: {args}");
            assert!(!args.contains("mongodb://"), "URI in arguments: {args}");
        }
        for entry in std::fs::read_dir(&run_dir).unwrap() {
            let content = std::fs::read_to_string(entry.unwrap().path()).unwrap();
            assert!(!content.contains(&test_db.uri));
        }

        token.cancel();
        let result = run.await.unwrap();

        assert!(matches!(result, Err(DgridError::QueryCancelled)));
        assert!(!process_is_running(pid), "mongosh {pid} is still running");
        assert!(!run_dir.exists());

        test_db.cleanup().await;
    }

    #[tokio::test]
    #[ignore]
    async fn shell_password_is_not_in_arguments_or_temp_files() {
        const PASSWORD: &str = "dgrid-s3cret-pw";
        // Nothing listens on port 1: the connection fails, which is fine here.
        let uri =
            format!("mongodb://dgrid_user:{PASSWORD}@127.0.0.1:1/?serverSelectionTimeoutMS=1000");
        let mut seen_args = Vec::new();
        let mut seen_files = Vec::new();
        let mut ps_args = String::new();
        let mut run_dir = None;

        let response = run_script(
            &mongosh_program(std::env::var_os(MONGOSH_PATH_ENV)),
            &uri,
            &request("__dgrid.result(0, 1)", "dgrid_shell_password_test"),
            CancellationToken::new(),
            |pid, args, dir| {
                seen_args = args.to_vec();
                #[cfg(unix)]
                {
                    let ps = std::process::Command::new("ps")
                        .args(["-o", "args=", "-p", &pid.unwrap().to_string()])
                        .output()
                        .unwrap();
                    ps_args = String::from_utf8_lossy(&ps.stdout).into_owned();
                }
                for entry in std::fs::read_dir(dir).unwrap() {
                    let path = entry.unwrap().path();
                    seen_files.push((path.clone(), std::fs::read_to_string(path).unwrap()));
                }
                run_dir = Some(dir.to_path_buf());
            },
        )
        .await
        .unwrap();

        assert!(response.error.is_some(), "the connection cannot succeed");
        assert_eq!(seen_args.len(), 5);
        for arg in &seen_args {
            let arg = arg.to_string_lossy();
            assert!(!arg.contains(PASSWORD), "password in argument: {arg}");
            assert!(!arg.contains("mongodb://"), "URI in argument: {arg}");
        }
        #[cfg(unix)]
        {
            assert!(ps_args.contains("mongosh"), "unexpected process: {ps_args}");
            assert!(!ps_args.contains(PASSWORD), "password in ps: {ps_args}");
        }
        assert_eq!(seen_files.len(), 2, "prelude and script: {seen_files:?}");
        for (path, content) in &seen_files {
            assert!(!content.contains(PASSWORD), "password in {path:?}");
        }
        assert!(!run_dir.unwrap().exists());
    }
}
