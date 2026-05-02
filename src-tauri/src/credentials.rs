use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};

/// Characters that must be percent-encoded in MongoDB userinfo (RFC 3986 userinfo set).
/// We encode everything except unreserved characters (ALPHA / DIGIT / "-" / "." / "_" / "~").
const USERINFO_ENCODE_SET: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~');

pub struct StrippedCredentials {
    pub stripped_uri: String,
    pub username: String,
    pub password: String,
}

struct MongoUriParts {
    scheme: String,
    userinfo: Option<String>,
    /// Hosts string — may be comma-separated for replica set / sharded URIs.
    hosts: String,
    /// Includes the leading slash, e.g. "/admin" or "".
    path: String,
    query: Option<String>,
}

/// Parse a MongoDB URI without using the `url` crate, which rejects multi-host URIs
/// (comma-separated hosts are not valid per RFC 3986 but are required by MongoDB's URI spec).
fn parse_mongo_uri_parts(uri: &str) -> Option<MongoUriParts> {
    let (scheme, rest) = uri.split_once("://")?;

    // Split path+query from the authority/hosts portion at the first '/'.
    let (authority_and_hosts, path_and_query) = match rest.find('/') {
        Some(pos) => (&rest[..pos], &rest[pos..]),
        None => (rest, ""),
    };

    let (path, query) = match path_and_query.find('?') {
        Some(pos) => (&path_and_query[..pos], Some(&path_and_query[pos + 1..])),
        None => (path_and_query, None),
    };

    // Use rfind so that a literal '@' that slipped through encoding still resolves to the
    // last '@', which is always the userinfo/host separator.
    let (userinfo, hosts) = match authority_and_hosts.rfind('@') {
        Some(pos) => (
            Some(&authority_and_hosts[..pos]),
            &authority_and_hosts[pos + 1..],
        ),
        None => (None, authority_and_hosts),
    };

    Some(MongoUriParts {
        scheme: scheme.to_string(),
        userinfo: userinfo.map(|s| s.to_string()),
        hosts: hosts.to_string(),
        path: path.to_string(),
        query: query.map(|s| s.to_string()),
    })
}

/// Strip credentials from a MongoDB URI, returning the cleaned URI plus extracted username/password.
pub fn strip_credentials(uri: &str) -> StrippedCredentials {
    let parts = parse_mongo_uri_parts(uri).expect("invalid URI");

    let (username, password) = match &parts.userinfo {
        None => (String::new(), String::new()),
        Some(userinfo) => match userinfo.split_once(':') {
            Some((user, pass)) => (
                percent_decode_str(user).decode_utf8_lossy().into_owned(),
                percent_decode_str(pass).decode_utf8_lossy().into_owned(),
            ),
            None => (
                percent_decode_str(userinfo).decode_utf8_lossy().into_owned(),
                String::new(),
            ),
        },
    };

    let mut stripped = format!("{}://{}", parts.scheme, parts.hosts);
    stripped.push_str(&parts.path);
    if let Some(query) = &parts.query {
        stripped.push('?');
        stripped.push_str(query);
    }

    StrippedCredentials {
        stripped_uri: stripped,
        username,
        password,
    }
}

/// Re-insert credentials into a credential-stripped URI for connecting.
pub fn inject_credentials(uri: &str, username: &str, password: &str) -> String {
    if username.is_empty() {
        return uri.to_string();
    }

    let parts = parse_mongo_uri_parts(uri).expect("invalid URI");

    let encoded_user = utf8_percent_encode(username, USERINFO_ENCODE_SET).to_string();
    let mut result = format!("{}://", parts.scheme);
    result.push_str(&encoded_user);

    if !password.is_empty() {
        let encoded_pass = utf8_percent_encode(password, USERINFO_ENCODE_SET).to_string();
        result.push(':');
        result.push_str(&encoded_pass);
    }

    result.push('@');
    result.push_str(&parts.hosts);
    result.push_str(&parts.path);
    if let Some(query) = &parts.query {
        result.push('?');
        result.push_str(query);
    }

    result
}

/// Extract database name from a MongoDB URI.
pub fn get_database_from_uri(uri: &str) -> Option<String> {
    let parts = parse_mongo_uri_parts(uri)?;
    let db = parts.path.strip_prefix('/').unwrap_or(&parts.path);
    if db.is_empty() {
        None
    } else {
        Some(db.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    mod strip_credentials {
        use super::*;

        #[test]
        fn extracts_username_and_password() {
            let result = strip_credentials("mongodb://user:pass@localhost:27017/mydb");
            assert_eq!(result.username, "user");
            assert_eq!(result.password, "pass");
            assert_eq!(result.stripped_uri, "mongodb://localhost:27017/mydb");
        }

        #[test]
        fn handles_uri_without_credentials() {
            let result = strip_credentials("mongodb://localhost:27017/mydb");
            assert_eq!(result.username, "");
            assert_eq!(result.password, "");
            assert_eq!(result.stripped_uri, "mongodb://localhost:27017/mydb");
        }

        #[test]
        fn handles_uri_with_only_username() {
            let result = strip_credentials("mongodb://user@localhost:27017");
            assert_eq!(result.username, "user");
            assert_eq!(result.password, "");
        }

        #[test]
        fn handles_srv_uri_with_credentials() {
            let result =
                strip_credentials("mongodb+srv://admin:secret@cluster0.example.net/testdb");
            assert_eq!(result.username, "admin");
            assert_eq!(result.password, "secret");
            assert_eq!(
                result.stripped_uri,
                "mongodb+srv://cluster0.example.net/testdb"
            );
        }

        #[test]
        fn handles_url_encoded_special_characters() {
            let result = strip_credentials("mongodb://user%40domain:p%40ss%3Aword@localhost:27017");
            assert_eq!(result.username, "user@domain");
            assert_eq!(result.password, "p@ss:word");
            assert_eq!(result.stripped_uri, "mongodb://localhost:27017");
        }

        #[test]
        fn preserves_query_parameters() {
            let result = strip_credentials(
                "mongodb://user:pass@localhost:27017/mydb?authSource=admin&tls=true",
            );
            assert_eq!(
                result.stripped_uri,
                "mongodb://localhost:27017/mydb?authSource=admin&tls=true"
            );
        }

        #[test]
        fn handles_multi_host_uri() {
            let result = strip_credentials(
                "mongodb://user:pass@host1:27017,host2:27017,host3:27017/admin?ssl=true&authSource=admin",
            );
            assert_eq!(result.username, "user");
            assert_eq!(result.password, "pass");
            assert_eq!(
                result.stripped_uri,
                "mongodb://host1:27017,host2:27017,host3:27017/admin?ssl=true&authSource=admin"
            );
        }

        #[test]
        fn handles_multi_host_uri_without_credentials() {
            let result =
                strip_credentials("mongodb://host1:27017,host2:27017,host3:27017/admin");
            assert_eq!(result.username, "");
            assert_eq!(result.password, "");
            assert_eq!(
                result.stripped_uri,
                "mongodb://host1:27017,host2:27017,host3:27017/admin"
            );
        }
    }

    mod inject_credentials_tests {
        use super::*;

        #[test]
        fn inserts_username_and_password() {
            let result = inject_credentials("mongodb://localhost:27017/mydb", "user", "pass");
            assert_eq!(result, "mongodb://user:pass@localhost:27017/mydb");
        }

        #[test]
        fn returns_uri_unchanged_when_username_empty() {
            let result = inject_credentials("mongodb://localhost:27017", "", "");
            assert_eq!(result, "mongodb://localhost:27017");
        }

        #[test]
        fn handles_username_without_password() {
            let result = inject_credentials("mongodb://localhost:27017", "user", "");
            assert_eq!(result, "mongodb://user@localhost:27017");
        }

        #[test]
        fn handles_srv_uris() {
            let result = inject_credentials(
                "mongodb+srv://cluster0.example.net/testdb",
                "admin",
                "secret",
            );
            assert_eq!(
                result,
                "mongodb+srv://admin:secret@cluster0.example.net/testdb"
            );
        }

        #[test]
        fn url_encodes_special_characters() {
            let result =
                inject_credentials("mongodb://localhost:27017", "user@domain", "p@ss:word");
            assert_eq!(
                result,
                "mongodb://user%40domain:p%40ss%3Aword@localhost:27017"
            );
        }

        #[test]
        fn preserves_query_parameters() {
            let result = inject_credentials(
                "mongodb://localhost:27017/mydb?authSource=admin",
                "user",
                "pass",
            );
            assert_eq!(
                result,
                "mongodb://user:pass@localhost:27017/mydb?authSource=admin"
            );
        }

        #[test]
        fn handles_multi_host_uri() {
            let result = inject_credentials(
                "mongodb://host1:27017,host2:27017,host3:27017/admin?authSource=admin",
                "user",
                "pass",
            );
            assert_eq!(
                result,
                "mongodb://user:pass@host1:27017,host2:27017,host3:27017/admin?authSource=admin"
            );
        }
    }

    mod get_database_from_uri_tests {
        use super::*;

        #[test]
        fn extracts_database_name() {
            assert_eq!(
                get_database_from_uri("mongodb://localhost:27017/mydb"),
                Some("mydb".to_string())
            );
        }

        #[test]
        fn returns_none_when_no_database() {
            assert_eq!(get_database_from_uri("mongodb://localhost:27017"), None);
        }

        #[test]
        fn returns_none_for_empty_path() {
            assert_eq!(get_database_from_uri("mongodb://localhost:27017/"), None);
        }

        #[test]
        fn returns_none_for_invalid_uri() {
            assert_eq!(get_database_from_uri("not-a-uri"), None);
        }

        #[test]
        fn extracts_database_from_multi_host_uri() {
            assert_eq!(
                get_database_from_uri(
                    "mongodb://host1:27017,host2:27017,host3:27017/admin?ssl=true"
                ),
                Some("admin".to_string())
            );
        }
    }
}
