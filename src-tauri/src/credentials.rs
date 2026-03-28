use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use url::Url;

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

/// Strip credentials from a MongoDB URI, returning the cleaned URI plus extracted username/password.
pub fn strip_credentials(uri: &str) -> StrippedCredentials {
    let parsed = Url::parse(uri).expect("invalid URI");

    let username = percent_decode_str(parsed.username())
        .decode_utf8_lossy()
        .into_owned();
    let password = parsed
        .password()
        .map(|p| percent_decode_str(p).decode_utf8_lossy().into_owned())
        .unwrap_or_default();

    // Build stripped URI from parts to avoid re-encoding issues
    let mut stripped = format!("{}://", parsed.scheme());
    stripped.push_str(parsed.host_str().unwrap_or(""));
    if let Some(port) = parsed.port() {
        stripped.push_str(&format!(":{}", port));
    }
    stripped.push_str(parsed.path());
    if let Some(query) = parsed.query() {
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

    let parsed = Url::parse(uri).expect("invalid URI");

    let encoded_user = utf8_percent_encode(username, USERINFO_ENCODE_SET).to_string();

    let mut result = format!("{}://", parsed.scheme());
    result.push_str(&encoded_user);

    if !password.is_empty() {
        let encoded_pass = utf8_percent_encode(password, USERINFO_ENCODE_SET).to_string();
        result.push(':');
        result.push_str(&encoded_pass);
    }

    result.push('@');
    result.push_str(parsed.host_str().unwrap_or(""));
    if let Some(port) = parsed.port() {
        result.push_str(&format!(":{}", port));
    }
    result.push_str(parsed.path());
    if let Some(query) = parsed.query() {
        result.push('?');
        result.push_str(query);
    }

    result
}

/// Extract database name from a MongoDB URI.
pub fn get_database_from_uri(uri: &str) -> Option<String> {
    let parsed = Url::parse(uri).ok()?;
    let path = parsed.path();
    let db = path.strip_prefix('/').unwrap_or(path);
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
    }
}
