use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DgridError {
    #[error("{0}")]
    NotImplemented(String),
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
        let err = DgridError::NotImplemented("test".into());
        let json = serde_json::to_string(&err).unwrap();
        assert_eq!(json, "\"test\"");
    }

    #[test]
    fn error_display() {
        let err = DgridError::NotImplemented("not ready".into());
        assert_eq!(err.to_string(), "not ready");
    }
}
