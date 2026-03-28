use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DgridError {
    #[error("{0}")]
    Storage(String),

    #[error("{0}")]
    Keyring(String),

    #[error("{0}")]
    Connection(String),

    #[error("{0}")]
    Database(String),

    #[error("{entity} '{id}' not found")]
    NotFound { entity: String, id: String },

    #[error("{0}")]
    Validation(String),

    #[error("{0}")]
    QueryExecution(String),

    #[error("Query was cancelled")]
    QueryCancelled,

    #[error("Connection was cancelled")]
    ConnectionCancelled,

    #[error("Connection test was cancelled")]
    TestConnectionCancelled,
}

impl From<std::io::Error> for DgridError {
    fn from(e: std::io::Error) -> Self {
        DgridError::Storage(e.to_string())
    }
}

impl From<serde_json::Error> for DgridError {
    fn from(e: serde_json::Error) -> Self {
        DgridError::Storage(e.to_string())
    }
}

impl Serialize for DgridError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_serializes_to_string() {
        let err = DgridError::Validation("test".into());
        let json = serde_json::to_string(&err).unwrap();
        assert_eq!(json, "\"test\"");
    }

    #[test]
    fn error_display() {
        let err = DgridError::Validation("not ready".into());
        assert_eq!(err.to_string(), "not ready");
    }

    #[test]
    fn storage_error_display() {
        let err = DgridError::Storage("disk full".into());
        assert_eq!(err.to_string(), "disk full");
    }

    #[test]
    fn keyring_error_display() {
        let err = DgridError::Keyring("access denied".into());
        assert_eq!(err.to_string(), "access denied");
    }

    #[test]
    fn connection_error_display() {
        let err = DgridError::Connection("timeout".into());
        assert_eq!(err.to_string(), "timeout");
    }

    #[test]
    fn database_error_display() {
        let err = DgridError::Database("query failed".into());
        assert_eq!(err.to_string(), "query failed");
    }

    #[test]
    fn not_found_error_display() {
        let err = DgridError::NotFound {
            entity: "Connection".into(),
            id: "abc-123".into(),
        };
        assert_eq!(err.to_string(), "Connection 'abc-123' not found");
    }

    #[test]
    fn validation_error_display() {
        let err = DgridError::Validation("name is required".into());
        assert_eq!(err.to_string(), "name is required");
    }

    #[test]
    fn from_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err: DgridError = io_err.into();
        assert!(matches!(err, DgridError::Storage(_)));
        assert_eq!(err.to_string(), "file not found");
    }

    #[test]
    fn from_serde_json_error() {
        let json_err = serde_json::from_str::<String>("invalid").unwrap_err();
        let err: DgridError = json_err.into();
        assert!(matches!(err, DgridError::Storage(_)));
    }

    #[test]
    fn connection_cancelled_error_display() {
        let err = DgridError::ConnectionCancelled;
        assert_eq!(err.to_string(), "Connection was cancelled");
    }

    #[test]
    fn test_connection_cancelled_error_display() {
        let err = DgridError::TestConnectionCancelled;
        assert_eq!(err.to_string(), "Connection test was cancelled");
    }
}
