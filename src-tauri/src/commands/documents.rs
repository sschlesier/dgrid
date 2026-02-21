use mongodb::bson::Document;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::bson_ser;
use crate::error::DgridError;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFieldRequest {
    pub database: String,
    pub collection: String,
    pub document_id: Value,
    pub field_path: String,
    pub value: Value,
    #[serde(rename = "type")]
    pub value_type: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFieldResponse {
    pub success: bool,
    pub modified_count: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDocumentRequest {
    pub database: String,
    pub collection: String,
    pub document_id: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteDocumentResponse {
    pub success: bool,
    pub deleted_count: u64,
}

#[tauri::command]
pub async fn update_field(
    state: State<'_, AppState>,
    id: String,
    request: UpdateFieldRequest,
) -> Result<UpdateFieldResponse, DgridError> {
    let db = state
        .pool
        .get_db(&id, Some(&request.database))
        .await
        .ok_or_else(|| DgridError::NotFound {
            entity: "Connection".into(),
            id: id.clone(),
        })?;

    let bson_id = bson_ser::json_to_bson(&request.document_id)
        .map_err(|e| DgridError::Validation(format!("Invalid document ID: {e}")))?;

    let bson_value = bson_ser::json_to_bson(&request.value)
        .map_err(|e| DgridError::Validation(format!("Invalid value: {e}")))?;

    let collection = db.collection::<Document>(&request.collection);
    let filter = mongodb::bson::doc! { "_id": bson_id };
    let update = mongodb::bson::doc! { "$set": { &request.field_path: bson_value } };

    let result = collection
        .update_one(filter, update)
        .await
        .map_err(|e| DgridError::Database(e.to_string()))?;

    Ok(UpdateFieldResponse {
        success: result.modified_count > 0 || result.matched_count > 0,
        modified_count: result.modified_count,
    })
}

#[tauri::command]
pub async fn delete_document(
    state: State<'_, AppState>,
    id: String,
    request: DeleteDocumentRequest,
) -> Result<DeleteDocumentResponse, DgridError> {
    let db = state
        .pool
        .get_db(&id, Some(&request.database))
        .await
        .ok_or_else(|| DgridError::NotFound {
            entity: "Connection".into(),
            id: id.clone(),
        })?;

    let bson_id = bson_ser::json_to_bson(&request.document_id)
        .map_err(|e| DgridError::Validation(format!("Invalid document ID: {e}")))?;

    let collection = db.collection::<Document>(&request.collection);
    let filter = mongodb::bson::doc! { "_id": bson_id };

    let result = collection
        .delete_one(filter)
        .await
        .map_err(|e| DgridError::Database(e.to_string()))?;

    Ok(DeleteDocumentResponse {
        success: result.deleted_count > 0,
        deleted_count: result.deleted_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_update_field_request() {
        let json = serde_json::json!({
            "database": "testdb",
            "collection": "users",
            "documentId": {"_type": "ObjectId", "_value": "507f1f77bcf86cd799439011"},
            "fieldPath": "name",
            "value": "Alice",
            "type": "string",
        });
        let req: UpdateFieldRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.database, "testdb");
        assert_eq!(req.collection, "users");
        assert_eq!(req.field_path, "name");
        assert_eq!(req.value_type, "string");
    }

    #[test]
    fn deserialize_update_field_request_nested_path() {
        let json = serde_json::json!({
            "database": "testdb",
            "collection": "users",
            "documentId": 42,
            "fieldPath": "address.city",
            "value": "New York",
            "type": "string",
        });
        let req: UpdateFieldRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.field_path, "address.city");
        assert_eq!(req.document_id, serde_json::json!(42));
    }

    #[test]
    fn deserialize_update_field_request_with_tagged_value() {
        let json = serde_json::json!({
            "database": "testdb",
            "collection": "users",
            "documentId": {"_type": "ObjectId", "_value": "507f1f77bcf86cd799439011"},
            "fieldPath": "createdAt",
            "value": {"_type": "Date", "_value": "2024-01-15T10:30:00.000Z"},
            "type": "Date",
        });
        let req: UpdateFieldRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.value_type, "Date");
        assert!(req.value.is_object());
    }

    #[test]
    fn deserialize_delete_document_request() {
        let json = serde_json::json!({
            "database": "testdb",
            "collection": "users",
            "documentId": {"_type": "ObjectId", "_value": "507f1f77bcf86cd799439011"},
        });
        let req: DeleteDocumentRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.database, "testdb");
        assert_eq!(req.collection, "users");
    }

    #[test]
    fn deserialize_delete_document_request_int_id() {
        let json = serde_json::json!({
            "database": "testdb",
            "collection": "events",
            "documentId": 123,
        });
        let req: DeleteDocumentRequest = serde_json::from_value(json).unwrap();
        assert_eq!(req.document_id, serde_json::json!(123));
    }

    #[test]
    fn serialize_update_field_response() {
        let resp = UpdateFieldResponse {
            success: true,
            modified_count: 1,
        };
        let json = serde_json::to_value(&resp).unwrap();
        assert_eq!(json["success"], true);
        assert_eq!(json["modifiedCount"], 1);
    }

    #[test]
    fn serialize_delete_document_response() {
        let resp = DeleteDocumentResponse {
            success: true,
            deleted_count: 1,
        };
        let json = serde_json::to_value(&resp).unwrap();
        assert_eq!(json["success"], true);
        assert_eq!(json["deletedCount"], 1);
    }

    #[test]
    fn serialize_update_field_response_no_match() {
        let resp = UpdateFieldResponse {
            success: false,
            modified_count: 0,
        };
        let json = serde_json::to_value(&resp).unwrap();
        assert_eq!(json["success"], false);
        assert_eq!(json["modifiedCount"], 0);
    }

    #[test]
    fn serialize_delete_document_response_not_found() {
        let resp = DeleteDocumentResponse {
            success: false,
            deleted_count: 0,
        };
        let json = serde_json::to_value(&resp).unwrap();
        assert_eq!(json["success"], false);
        assert_eq!(json["deletedCount"], 0);
    }
}
