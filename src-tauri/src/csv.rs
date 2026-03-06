//! CSV utilities for exporting MongoDB documents.
//!
//! Ported from `src/backend/db/csv.ts`. Works with raw BSON documents
//! from MongoDB cursors, converting special types to display strings.

use mongodb::bson::{self, Bson, Document};
use std::collections::BTreeSet;

/// Convert a BSON value to a display string for CSV output.
fn bson_to_string(value: &Bson) -> Option<String> {
    match value {
        Bson::ObjectId(oid) => Some(oid.to_hex()),
        Bson::DateTime(dt) => {
            let millis = dt.timestamp_millis();
            chrono::DateTime::from_timestamp_millis(millis)
                .map(|d| d.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
                .or_else(|| Some(millis.to_string()))
        }
        Bson::Binary(bin) => {
            if bin.subtype == bson::spec::BinarySubtype::Uuid && bin.bytes.len() == 16 {
                let u = uuid::Uuid::from_bytes(bin.bytes.as_slice().try_into().unwrap());
                Some(u.to_string())
            } else {
                use base64::{engine::general_purpose::STANDARD, Engine};
                Some(format!("Binary({})", STANDARD.encode(&bin.bytes)))
            }
        }
        Bson::Decimal128(d) => Some(d.to_string()),
        Bson::Int64(i) => Some(i.to_string()),
        _ => None,
    }
}

/// Recursively flatten a BSON document to dot-notation key-value pairs.
pub fn flatten_document(doc: &Document, prefix: &str) -> Vec<(String, String)> {
    let mut result = Vec::new();

    for (key, value) in doc.iter() {
        let full_key = if prefix.is_empty() {
            key.clone()
        } else {
            format!("{prefix}.{key}")
        };

        match value {
            Bson::Null => {
                result.push((full_key, String::new()));
            }
            Bson::Array(arr) => {
                // JSON-stringify arrays
                let json_vals: Vec<serde_json::Value> = arr
                    .iter()
                    .map(crate::bson_ser::serialize_bson_value)
                    .collect();
                let json_str =
                    serde_json::to_string(&json_vals).unwrap_or_else(|_| "[]".to_string());
                result.push((full_key, json_str));
            }
            Bson::Document(nested) => {
                result.extend(flatten_document(nested, &full_key));
            }
            other => {
                if let Some(s) = bson_to_string(other) {
                    result.push((full_key, s));
                } else {
                    // Primitives: bool, int32, double, string
                    match other {
                        Bson::Boolean(b) => result.push((full_key, b.to_string())),
                        Bson::Int32(i) => result.push((full_key, i.to_string())),
                        Bson::Double(f) => result.push((full_key, f.to_string())),
                        Bson::String(s) => result.push((full_key, s.clone())),
                        _ => result.push((full_key, format!("{other:?}"))),
                    }
                }
            }
        }
    }

    result
}

/// Escape a value for CSV per RFC 4180: quote fields containing commas,
/// quotes, or newlines. Double any embedded quotes.
pub fn escape_csv_field(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

/// Collect the union of all flattened keys from a batch of documents,
/// with `_id` first and remaining keys in insertion order.
pub fn collect_columns(docs: &[Document]) -> Vec<String> {
    // Use BTreeSet to get deterministic ordering for non-_id keys
    let mut seen = BTreeSet::new();
    let mut ordered = Vec::new();

    for doc in docs {
        let flat = flatten_document(doc, "");
        for (key, _) in &flat {
            if seen.insert(key.clone()) {
                ordered.push(key.clone());
            }
        }
    }

    // Move _id to front if present
    let mut columns = Vec::new();
    if seen.contains("_id") {
        columns.push("_id".to_string());
    }
    for key in &ordered {
        if key != "_id" {
            columns.push(key.clone());
        }
    }
    columns
}

/// Build a single CSV row from a document given an ordered list of columns.
pub fn build_csv_row(doc: &Document, columns: &[String]) -> String {
    let flat: std::collections::HashMap<String, String> = flatten_document(doc, "")
        .into_iter()
        .collect();

    columns
        .iter()
        .map(|col| {
            let value = flat.get(col).map(|s| s.as_str()).unwrap_or("");
            escape_csv_field(value)
        })
        .collect::<Vec<_>>()
        .join(",")
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::{doc, oid::ObjectId, Binary, Decimal128};

    #[test]
    fn flatten_flat_document() {
        let doc = doc! { "name": "Alice", "age": 30, "active": true };
        let flat: std::collections::HashMap<_, _> =
            flatten_document(&doc, "").into_iter().collect();
        assert_eq!(flat["name"], "Alice");
        assert_eq!(flat["age"], "30");
        assert_eq!(flat["active"], "true");
    }

    #[test]
    fn flatten_nested_document() {
        let doc = doc! { "address": { "city": "NYC", "zip": "10001" } };
        let flat: std::collections::HashMap<_, _> =
            flatten_document(&doc, "").into_iter().collect();
        assert_eq!(flat["address.city"], "NYC");
        assert_eq!(flat["address.zip"], "10001");
        assert!(!flat.contains_key("address"));
    }

    #[test]
    fn flatten_deeply_nested() {
        let doc = doc! { "a": { "b": { "c": "deep" } } };
        let flat: std::collections::HashMap<_, _> =
            flatten_document(&doc, "").into_iter().collect();
        assert_eq!(flat["a.b.c"], "deep");
    }

    #[test]
    fn flatten_null_to_empty() {
        let doc = doc! { "a": Bson::Null };
        let flat: std::collections::HashMap<_, _> =
            flatten_document(&doc, "").into_iter().collect();
        assert_eq!(flat["a"], "");
    }

    #[test]
    fn flatten_array_json_stringified() {
        let doc = doc! { "tags": [1, 2, 3] };
        let flat: std::collections::HashMap<_, _> =
            flatten_document(&doc, "").into_iter().collect();
        assert_eq!(flat["tags"], "[1,2,3]");
    }

    #[test]
    fn flatten_array_of_objects() {
        let doc = doc! { "items": [{ "x": 1 }, { "x": 2 }] };
        let flat: std::collections::HashMap<_, _> =
            flatten_document(&doc, "").into_iter().collect();
        assert_eq!(flat["items"], "[{\"x\":1},{\"x\":2}]");
    }

    #[test]
    fn flatten_objectid() {
        let oid = ObjectId::parse_str("507f1f77bcf86cd799439011").unwrap();
        let doc = doc! { "_id": oid };
        let flat: std::collections::HashMap<_, _> =
            flatten_document(&doc, "").into_iter().collect();
        assert_eq!(flat["_id"], "507f1f77bcf86cd799439011");
    }

    #[test]
    fn flatten_datetime() {
        let dt = bson::DateTime::from_millis(1705312800000);
        let doc = doc! { "created": dt };
        let flat: std::collections::HashMap<_, _> =
            flatten_document(&doc, "").into_iter().collect();
        assert!(flat["created"].contains("2024-01-15"));
    }

    #[test]
    fn flatten_uuid() {
        let u = uuid::Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let bin = Binary {
            subtype: bson::spec::BinarySubtype::Uuid,
            bytes: u.as_bytes().to_vec(),
        };
        let doc = doc! { "id": bin };
        let flat: std::collections::HashMap<_, _> =
            flatten_document(&doc, "").into_iter().collect();
        assert_eq!(flat["id"], "550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn flatten_decimal128() {
        let d: Decimal128 = "123.456".parse().unwrap();
        let doc = doc! { "price": d };
        let flat: std::collections::HashMap<_, _> =
            flatten_document(&doc, "").into_iter().collect();
        assert_eq!(flat["price"], "123.456");
    }

    #[test]
    fn flatten_int64() {
        let doc = doc! { "big": Bson::Int64(9007199254740993) };
        let flat: std::collections::HashMap<_, _> =
            flatten_document(&doc, "").into_iter().collect();
        assert_eq!(flat["big"], "9007199254740993");
    }

    #[test]
    fn flatten_binary() {
        let bin = Binary {
            subtype: bson::spec::BinarySubtype::Generic,
            bytes: b"hello".to_vec(),
        };
        let doc = doc! { "data": bin };
        let flat: std::collections::HashMap<_, _> =
            flatten_document(&doc, "").into_iter().collect();
        assert_eq!(flat["data"], "Binary(aGVsbG8=)");
    }

    #[test]
    fn flatten_double() {
        let doc = doc! { "val": 3.14 };
        let flat: std::collections::HashMap<_, _> =
            flatten_document(&doc, "").into_iter().collect();
        assert_eq!(flat["val"], "3.14");
    }

    // escape_csv_field tests

    #[test]
    fn escape_plain_field() {
        assert_eq!(escape_csv_field("hello"), "hello");
    }

    #[test]
    fn escape_field_with_comma() {
        assert_eq!(escape_csv_field("hello, world"), "\"hello, world\"");
    }

    #[test]
    fn escape_field_with_quotes() {
        assert_eq!(escape_csv_field("say \"hi\""), "\"say \"\"hi\"\"\"");
    }

    #[test]
    fn escape_field_with_newline() {
        assert_eq!(escape_csv_field("line1\nline2"), "\"line1\nline2\"");
    }

    #[test]
    fn escape_field_with_carriage_return() {
        assert_eq!(escape_csv_field("line1\rline2"), "\"line1\rline2\"");
    }

    #[test]
    fn escape_empty_field() {
        assert_eq!(escape_csv_field(""), "");
    }

    // collect_columns tests

    #[test]
    fn collect_columns_empty() {
        let columns = collect_columns(&[]);
        assert!(columns.is_empty());
    }

    #[test]
    fn collect_columns_id_first() {
        let docs = vec![doc! { "name": "Alice", "_id": "1", "email": "a@b.c" }];
        let columns = collect_columns(&docs);
        assert_eq!(columns[0], "_id");
    }

    #[test]
    fn collect_columns_no_id() {
        let docs = vec![doc! { "name": "Alice", "age": 30 }];
        let columns = collect_columns(&docs);
        assert!(!columns.contains(&"_id".to_string()));
        assert!(columns.contains(&"name".to_string()));
        assert!(columns.contains(&"age".to_string()));
    }

    #[test]
    fn collect_columns_union_across_docs() {
        let docs = vec![
            doc! { "_id": "1", "name": "Alice" },
            doc! { "_id": "2", "email": "bob@test.com" },
        ];
        let columns = collect_columns(&docs);
        assert_eq!(columns[0], "_id");
        assert!(columns.contains(&"name".to_string()));
        assert!(columns.contains(&"email".to_string()));
    }

    // build_csv_row tests

    #[test]
    fn build_row_simple() {
        let doc = doc! { "_id": "1", "name": "Alice", "age": 30 };
        let columns = vec!["_id".to_string(), "name".to_string(), "age".to_string()];
        let row = build_csv_row(&doc, &columns);
        assert_eq!(row, "1,Alice,30");
    }

    #[test]
    fn build_row_with_escaping() {
        let doc = doc! { "_id": "1", "note": "hello, world" };
        let columns = vec!["_id".to_string(), "note".to_string()];
        let row = build_csv_row(&doc, &columns);
        assert_eq!(row, "1,\"hello, world\"");
    }

    #[test]
    fn build_row_missing_fields() {
        let doc = doc! { "_id": "1", "name": "Alice" };
        let columns = vec![
            "_id".to_string(),
            "name".to_string(),
            "email".to_string(),
        ];
        let row = build_csv_row(&doc, &columns);
        assert_eq!(row, "1,Alice,");
    }

    #[test]
    fn build_row_nested_flattened() {
        let doc = doc! { "_id": "1", "address": { "city": "NYC", "zip": "10001" } };
        let columns = vec![
            "_id".to_string(),
            "address.city".to_string(),
            "address.zip".to_string(),
        ];
        let row = build_csv_row(&doc, &columns);
        assert_eq!(row, "1,NYC,10001");
    }

    #[test]
    fn build_row_with_objectid() {
        let oid = ObjectId::parse_str("507f1f77bcf86cd799439011").unwrap();
        let doc = doc! { "_id": oid, "name": "Test" };
        let columns = vec!["_id".to_string(), "name".to_string()];
        let row = build_csv_row(&doc, &columns);
        assert_eq!(row, "507f1f77bcf86cd799439011,Test");
    }

    // Full CSV generation test (header + rows)

    #[test]
    fn full_csv_generation() {
        let docs = vec![
            doc! { "_id": "1", "name": "Alice", "age": 30 },
            doc! { "_id": "2", "name": "Bob", "age": 25 },
        ];
        let columns = collect_columns(&docs);
        let header = columns
            .iter()
            .map(|c| escape_csv_field(c))
            .collect::<Vec<_>>()
            .join(",");

        let mut csv = header;
        for d in &docs {
            csv.push('\n');
            csv.push_str(&build_csv_row(d, &columns));
        }

        assert_eq!(csv, "_id,name,age\n1,Alice,30\n2,Bob,25");
    }

    #[test]
    fn full_csv_mixed_schemas() {
        let docs = vec![
            doc! { "_id": "1", "name": "Alice" },
            doc! { "_id": "2", "email": "bob@test.com" },
        ];
        let columns = collect_columns(&docs);
        let header = columns
            .iter()
            .map(|c| escape_csv_field(c))
            .collect::<Vec<_>>()
            .join(",");

        let mut csv = header;
        for d in &docs {
            csv.push('\n');
            csv.push_str(&build_csv_row(d, &columns));
        }

        assert_eq!(csv, "_id,name,email\n1,Alice,\n2,,bob@test.com");
    }
}
