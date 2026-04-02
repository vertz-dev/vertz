//! Response mapping and JSON serialization for CRUD list operations.

use rusqlite::Row;
use serde_json::{Map, Value};

/// Column mapping: (db_snake_name, json_camel_name, column_index).
pub struct ColumnMap {
    pub entries: Vec<(String, String, usize)>,
}

impl ColumnMap {
    /// Create a column map from camelCase field names.
    pub fn from_camel_names(names: &[&str]) -> Self {
        let entries = names
            .iter()
            .enumerate()
            .map(|(i, name)| {
                let snake = crate::native_handler::sql_builder::camel_to_snake(name);
                (snake, name.to_string(), i)
            })
            .collect();
        ColumnMap { entries }
    }
}

/// Extract a single row from rusqlite into a JSON object using the column map.
pub fn row_to_json(row: &Row, column_map: &ColumnMap) -> Result<Value, rusqlite::Error> {
    let mut obj = Map::with_capacity(column_map.entries.len());
    for (_snake, camel, idx) in &column_map.entries {
        let value = row_value_at(row, *idx)?;
        obj.insert(camel.clone(), value);
    }
    Ok(Value::Object(obj))
}

fn row_value_at(row: &Row, idx: usize) -> Result<Value, rusqlite::Error> {
    use rusqlite::types::ValueRef;
    match row.get_ref(idx)? {
        ValueRef::Null => Ok(Value::Null),
        ValueRef::Integer(i) => Ok(Value::Number(i.into())),
        ValueRef::Real(f) => Ok(serde_json::Number::from_f64(f)
            .map(Value::Number)
            .unwrap_or(Value::Null)),
        ValueRef::Text(t) => {
            let s = std::str::from_utf8(t).unwrap_or("");
            Ok(Value::String(s.to_string()))
        }
        ValueRef::Blob(b) => Ok(Value::String(base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            b,
        ))),
    }
}

/// Build the list response envelope with pagination metadata.
pub fn build_list_response(
    items: Vec<Value>,
    total: Option<u64>,
    limit: u32,
    offset: u32,
) -> Value {
    serde_json::json!({
        "items": items,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total": total,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn column_map_from_camel_names() {
        let map = ColumnMap::from_camel_names(&["id", "userId", "createdAt"]);
        assert_eq!(map.entries.len(), 3);
        assert_eq!(map.entries[0], ("id".to_string(), "id".to_string(), 0));
        assert_eq!(
            map.entries[1],
            ("user_id".to_string(), "userId".to_string(), 1)
        );
        assert_eq!(
            map.entries[2],
            ("created_at".to_string(), "createdAt".to_string(), 2)
        );
    }

    #[test]
    fn list_response_envelope() {
        let items = vec![serde_json::json!({"id": "1", "title": "Test"})];
        let response = build_list_response(items, Some(42), 20, 0);
        assert_eq!(response["pagination"]["total"], 42);
        assert_eq!(response["pagination"]["limit"], 20);
        assert_eq!(response["items"].as_array().unwrap().len(), 1);
    }
}
