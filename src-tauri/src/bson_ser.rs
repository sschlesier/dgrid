//! BSON ↔ JSON serialization with type-tagged special types.
//!
//! Matches the frontend's `src/backend/db/bson.ts` format exactly:
//! six tagged types represented as `{ _type, _value }` objects.

use mongodb::bson::{self, Bson, Binary, Decimal128};
use serde_json::{Map, Value};

/// Serialize a BSON value into a JSON value, using type-tagged objects
/// for types that have no direct JSON representation.
///
/// Tagged types: ObjectId, Date, Binary, Decimal128, Long (Int64), UUID (Binary subtype 4).
/// Primitives, Int32, and Double pass through as JSON.
pub fn serialize_bson_value(value: &Bson) -> Value {
    match value {
        Bson::Null => Value::Null,
        Bson::Boolean(b) => Value::Bool(*b),
        Bson::Int32(i) => Value::Number((*i).into()),
        Bson::Double(f) => {
            serde_json::Number::from_f64(*f)
                .map(Value::Number)
                .unwrap_or(Value::Null)
        }
        Bson::String(s) => Value::String(s.clone()),

        Bson::ObjectId(oid) => tagged("ObjectId", &oid.to_hex()),
        Bson::DateTime(dt) => {
            let millis = dt.timestamp_millis();
            let iso = chrono::DateTime::from_timestamp_millis(millis)
                .map(|d| d.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
                .unwrap_or_else(|| millis.to_string());
            tagged("Date", &iso)
        }
        Bson::Decimal128(d) => tagged("Decimal128", &d.to_string()),
        Bson::Int64(i) => tagged("Long", &i.to_string()),

        Bson::Binary(bin) => {
            // Binary subtype 4 = UUID
            if bin.subtype == bson::spec::BinarySubtype::Uuid {
                if bin.bytes.len() == 16 {
                    let u = uuid::Uuid::from_bytes(bin.bytes.as_slice().try_into().unwrap());
                    return tagged("UUID", &u.to_string());
                }
            }
            let b64 = base64_encode(&bin.bytes);
            tagged("Binary", &b64)
        }

        Bson::Array(arr) => {
            Value::Array(arr.iter().map(serialize_bson_value).collect())
        }
        Bson::Document(doc) => {
            Value::Object(serialize_document(doc))
        }

        // Less common types — serialize as strings
        Bson::RegularExpression(re) => {
            let mut m = Map::new();
            m.insert("$regex".into(), Value::String(re.pattern.clone()));
            if !re.options.is_empty() {
                m.insert("$options".into(), Value::String(re.options.clone()));
            }
            Value::Object(m)
        }
        Bson::Timestamp(ts) => {
            let mut m = Map::new();
            m.insert("t".into(), Value::Number(ts.time.into()));
            m.insert("i".into(), Value::Number(ts.increment.into()));
            Value::Object(m)
        }
        Bson::JavaScriptCode(code) => Value::String(code.clone()),
        Bson::JavaScriptCodeWithScope(cs) => Value::String(cs.code.clone()),
        Bson::Symbol(s) => Value::String(s.clone()),
        Bson::Undefined => Value::Null,
        Bson::MinKey => Value::String("MinKey".into()),
        Bson::MaxKey => Value::String("MaxKey".into()),
        Bson::DbPointer(_) => Value::String("DBRef(...)".into()),
    }
}

/// Serialize a BSON document into a JSON object map.
pub fn serialize_document(doc: &bson::Document) -> Map<String, Value> {
    let mut m = Map::new();
    for (key, value) in doc.iter() {
        m.insert(key.clone(), serialize_bson_value(value));
    }
    m
}

/// Convert a JSON value (potentially containing `{_type, _value}` tags) back to BSON.
/// Used to convert filter/update/pipeline args from the parser into BSON for the driver.
pub fn json_to_bson(value: &Value) -> Result<Bson, String> {
    match value {
        Value::Null => Ok(Bson::Null),
        Value::Bool(b) => Ok(Bson::Boolean(*b)),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                // Fit into Int32 if possible, otherwise Int64
                if i >= i32::MIN as i64 && i <= i32::MAX as i64 {
                    Ok(Bson::Int32(i as i32))
                } else {
                    Ok(Bson::Int64(i))
                }
            } else if let Some(f) = n.as_f64() {
                Ok(Bson::Double(f))
            } else {
                Err(format!("Unsupported number: {n}"))
            }
        }
        Value::String(s) => Ok(Bson::String(s.clone())),
        Value::Array(arr) => {
            let items: Result<Vec<Bson>, String> = arr.iter().map(json_to_bson).collect();
            Ok(Bson::Array(items?))
        }
        Value::Object(obj) => {
            // Check for type-tagged values
            if let (Some(Value::String(type_name)), Some(Value::String(val))) =
                (obj.get("_type"), obj.get("_value"))
            {
                return match type_name.as_str() {
                    "ObjectId" => {
                        let oid = bson::oid::ObjectId::parse_str(val)
                            .map_err(|e| format!("Invalid ObjectId: {e}"))?;
                        Ok(Bson::ObjectId(oid))
                    }
                    "Date" => {
                        let millis = chrono::DateTime::parse_from_rfc3339(val)
                            .map(|d| d.timestamp_millis())
                            .or_else(|_| val.parse::<i64>())
                            .map_err(|e| format!("Invalid Date: {e}"))?;
                        Ok(Bson::DateTime(bson::DateTime::from_millis(millis)))
                    }
                    "Binary" => {
                        let bytes = base64_decode(val)
                            .map_err(|e| format!("Invalid Binary base64: {e}"))?;
                        Ok(Bson::Binary(Binary {
                            subtype: bson::spec::BinarySubtype::Generic,
                            bytes,
                        }))
                    }
                    "Decimal128" => {
                        let d = val.parse::<Decimal128>()
                            .map_err(|e| format!("Invalid Decimal128: {e}"))?;
                        Ok(Bson::Decimal128(d))
                    }
                    "Long" => {
                        let i = val.parse::<i64>()
                            .map_err(|e| format!("Invalid Long: {e}"))?;
                        Ok(Bson::Int64(i))
                    }
                    "UUID" => {
                        let u = uuid::Uuid::parse_str(val)
                            .map_err(|e| format!("Invalid UUID: {e}"))?;
                        Ok(Bson::Binary(Binary {
                            subtype: bson::spec::BinarySubtype::Uuid,
                            bytes: u.as_bytes().to_vec(),
                        }))
                    }
                    other => Err(format!("Unknown _type: {other}")),
                };
            }

            // Check for $regex
            if let Some(Value::String(pattern)) = obj.get("$regex") {
                let options = obj
                    .get("$options")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                return Ok(Bson::RegularExpression(bson::Regex {
                    pattern: pattern.clone(),
                    options,
                }));
            }

            // Regular document
            let mut doc = bson::Document::new();
            for (k, v) in obj {
                doc.insert(k.clone(), json_to_bson(v)?);
            }
            Ok(Bson::Document(doc))
        }
    }
}

/// Convert a JSON value to a BSON Document (top-level must be an object).
pub fn json_to_document(value: &Value) -> Result<bson::Document, String> {
    match json_to_bson(value)? {
        Bson::Document(doc) => Ok(doc),
        other => Err(format!("Expected document, got {:?}", other)),
    }
}

fn tagged(type_name: &str, value: &str) -> Value {
    let mut m = Map::new();
    m.insert("_type".into(), Value::String(type_name.into()));
    m.insert("_value".into(), Value::String(value.into()));
    Value::Object(m)
}

fn base64_encode(data: &[u8]) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine};
    STANDARD.encode(data)
}

fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    STANDARD.decode(s).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use mongodb::bson::{doc, oid::ObjectId, Bson};

    #[test]
    fn serialize_null() {
        assert_eq!(serialize_bson_value(&Bson::Null), Value::Null);
    }

    #[test]
    fn serialize_bool() {
        assert_eq!(serialize_bson_value(&Bson::Boolean(true)), Value::Bool(true));
    }

    #[test]
    fn serialize_int32() {
        assert_eq!(
            serialize_bson_value(&Bson::Int32(42)),
            Value::Number(42.into())
        );
    }

    #[test]
    fn serialize_double() {
        let val = serialize_bson_value(&Bson::Double(3.14));
        assert_eq!(val, serde_json::json!(3.14));
    }

    #[test]
    fn serialize_string() {
        assert_eq!(
            serialize_bson_value(&Bson::String("hello".into())),
            Value::String("hello".into())
        );
    }

    #[test]
    fn serialize_objectid() {
        let oid = ObjectId::parse_str("507f1f77bcf86cd799439011").unwrap();
        let val = serialize_bson_value(&Bson::ObjectId(oid));
        assert_eq!(val, serde_json::json!({"_type": "ObjectId", "_value": "507f1f77bcf86cd799439011"}));
    }

    #[test]
    fn serialize_datetime() {
        let dt = bson::DateTime::from_millis(1234567890000);
        let val = serialize_bson_value(&Bson::DateTime(dt));
        let obj = val.as_object().unwrap();
        assert_eq!(obj["_type"], "Date");
        assert!(obj["_value"].as_str().unwrap().contains("2009-02-13"));
    }

    #[test]
    fn serialize_int64() {
        let val = serialize_bson_value(&Bson::Int64(9999999999));
        assert_eq!(val, serde_json::json!({"_type": "Long", "_value": "9999999999"}));
    }

    #[test]
    fn serialize_decimal128() {
        let d: Decimal128 = "123.456".parse().unwrap();
        let val = serialize_bson_value(&Bson::Decimal128(d));
        let obj = val.as_object().unwrap();
        assert_eq!(obj["_type"], "Decimal128");
    }

    #[test]
    fn serialize_binary() {
        let bin = Binary {
            subtype: bson::spec::BinarySubtype::Generic,
            bytes: vec![1, 2, 3],
        };
        let val = serialize_bson_value(&Bson::Binary(bin));
        let obj = val.as_object().unwrap();
        assert_eq!(obj["_type"], "Binary");
    }

    #[test]
    fn serialize_uuid_binary() {
        let u = uuid::Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let bin = Binary {
            subtype: bson::spec::BinarySubtype::Uuid,
            bytes: u.as_bytes().to_vec(),
        };
        let val = serialize_bson_value(&Bson::Binary(bin));
        let obj = val.as_object().unwrap();
        assert_eq!(obj["_type"], "UUID");
        assert_eq!(obj["_value"], "550e8400-e29b-41d4-a716-446655440000");
    }

    #[test]
    fn serialize_document_nested() {
        let doc = doc! {
            "name": "Alice",
            "age": 30,
            "id": ObjectId::parse_str("507f1f77bcf86cd799439011").unwrap(),
        };
        let m = serialize_document(&doc);
        assert_eq!(m["name"], "Alice");
        assert_eq!(m["age"], 30);
        assert!(m["id"].as_object().unwrap().contains_key("_type"));
    }

    #[test]
    fn serialize_array() {
        let arr = Bson::Array(vec![Bson::Int32(1), Bson::Int32(2), Bson::Int32(3)]);
        let val = serialize_bson_value(&arr);
        assert_eq!(val, serde_json::json!([1, 2, 3]));
    }

    #[test]
    fn json_to_bson_primitives() {
        assert_eq!(json_to_bson(&Value::Null).unwrap(), Bson::Null);
        assert_eq!(json_to_bson(&Value::Bool(true)).unwrap(), Bson::Boolean(true));
        assert_eq!(json_to_bson(&serde_json::json!(42)).unwrap(), Bson::Int32(42));
        assert_eq!(json_to_bson(&serde_json::json!(3.14)).unwrap(), Bson::Double(3.14));
        assert_eq!(json_to_bson(&serde_json::json!("hello")).unwrap(), Bson::String("hello".into()));
    }

    #[test]
    fn json_to_bson_tagged_objectid() {
        let json = serde_json::json!({"_type": "ObjectId", "_value": "507f1f77bcf86cd799439011"});
        let bson = json_to_bson(&json).unwrap();
        match bson {
            Bson::ObjectId(oid) => assert_eq!(oid.to_hex(), "507f1f77bcf86cd799439011"),
            other => panic!("Expected ObjectId, got {:?}", other),
        }
    }

    #[test]
    fn json_to_bson_tagged_long() {
        let json = serde_json::json!({"_type": "Long", "_value": "9999999999"});
        let bson = json_to_bson(&json).unwrap();
        assert_eq!(bson, Bson::Int64(9999999999));
    }

    #[test]
    fn json_to_bson_regex() {
        let json = serde_json::json!({"$regex": "^test", "$options": "i"});
        let bson = json_to_bson(&json).unwrap();
        match bson {
            Bson::RegularExpression(re) => {
                assert_eq!(re.pattern, "^test");
                assert_eq!(re.options, "i");
            }
            other => panic!("Expected Regex, got {:?}", other),
        }
    }

    #[test]
    fn roundtrip_objectid() {
        let oid = ObjectId::parse_str("507f1f77bcf86cd799439011").unwrap();
        let serialized = serialize_bson_value(&Bson::ObjectId(oid));
        let deserialized = json_to_bson(&serialized).unwrap();
        assert_eq!(deserialized, Bson::ObjectId(oid));
    }

    #[test]
    fn roundtrip_int64() {
        let original = Bson::Int64(9999999999);
        let serialized = serialize_bson_value(&original);
        let deserialized = json_to_bson(&serialized).unwrap();
        assert_eq!(deserialized, original);
    }
}
