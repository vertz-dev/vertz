//! Parameterized SQL generation for CRUD list operations.
//!
//! Generates SQLite-compatible parameterized queries with camelCase → snake_case
//! column name conversion.

/// Convert camelCase to snake_case.
pub fn camel_to_snake(s: &str) -> String {
    let mut result = String::with_capacity(s.len() + 4);
    for (i, c) in s.chars().enumerate() {
        if c.is_uppercase() {
            if i > 0 {
                result.push('_');
            }
            result.push(c.to_lowercase().next().unwrap());
        } else {
            result.push(c);
        }
    }
    result
}

/// Convert snake_case to camelCase.
pub fn snake_to_camel(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut capitalize_next = false;
    for c in s.chars() {
        if c == '_' {
            capitalize_next = true;
        } else if capitalize_next {
            result.push(c.to_uppercase().next().unwrap());
            capitalize_next = false;
        } else {
            result.push(c);
        }
    }
    result
}

#[derive(Debug, Clone, Copy)]
pub enum OrderDir {
    Asc,
    Desc,
}

/// Build a parameterized SELECT query for listing entities.
///
/// Returns (sql, params) where params are the bind values.
pub fn build_select(
    table: &str,
    columns: &[&str],
    where_conditions: &[(String, serde_json::Value)],
    order_by: Option<&str>,
    order_dir: OrderDir,
    limit: u32,
    offset: u32,
) -> (String, Vec<serde_json::Value>) {
    let mut sql = String::with_capacity(256);
    let mut params: Vec<serde_json::Value> = Vec::new();

    // SELECT columns (with aliases: snake_case AS "camelCase")
    sql.push_str("SELECT ");
    for (i, col) in columns.iter().enumerate() {
        if i > 0 {
            sql.push_str(", ");
        }
        let snake = camel_to_snake(col);
        if snake != *col {
            sql.push_str(&format!("\"{}\" AS \"{}\"", snake, col));
        } else {
            sql.push_str(&format!("\"{}\"", col));
        }
    }

    // FROM table
    sql.push_str(&format!(" FROM \"{}\"", table));

    // WHERE conditions (parameterized)
    if !where_conditions.is_empty() {
        sql.push_str(" WHERE ");
        for (i, (field, value)) in where_conditions.iter().enumerate() {
            if i > 0 {
                sql.push_str(" AND ");
            }
            let snake_field = camel_to_snake(field);
            sql.push_str(&format!("\"{}\" = ?{}", snake_field, params.len() + 1));
            params.push(value.clone());
        }
    }

    // ORDER BY
    if let Some(order_col) = order_by {
        let snake_order = camel_to_snake(order_col);
        let dir = match order_dir {
            OrderDir::Asc => "ASC",
            OrderDir::Desc => "DESC",
        };
        sql.push_str(&format!(" ORDER BY \"{}\" {}", snake_order, dir));
    }

    // LIMIT + OFFSET
    sql.push_str(&format!(" LIMIT ?{}", params.len() + 1));
    params.push(serde_json::Value::Number(limit.into()));
    sql.push_str(&format!(" OFFSET ?{}", params.len() + 1));
    params.push(serde_json::Value::Number(offset.into()));

    (sql, params)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn camel_to_snake_conversion() {
        assert_eq!(camel_to_snake("userId"), "user_id");
        assert_eq!(camel_to_snake("createdAt"), "created_at");
        assert_eq!(camel_to_snake("id"), "id");
        assert_eq!(camel_to_snake("tenantId"), "tenant_id");
    }

    #[test]
    fn snake_to_camel_conversion() {
        assert_eq!(snake_to_camel("user_id"), "userId");
        assert_eq!(snake_to_camel("created_at"), "createdAt");
        assert_eq!(snake_to_camel("id"), "id");
    }

    #[test]
    fn basic_select_no_where() {
        let (sql, params) = build_select(
            "tasks",
            &["id", "title", "status"],
            &[],
            Some("createdAt"),
            OrderDir::Desc,
            20,
            0,
        );
        assert_eq!(
            sql,
            r#"SELECT "id", "title", "status" FROM "tasks" ORDER BY "created_at" DESC LIMIT ?1 OFFSET ?2"#
        );
        assert_eq!(params.len(), 2);
        assert_eq!(params[0], serde_json::json!(20));
        assert_eq!(params[1], serde_json::json!(0));
    }

    #[test]
    fn select_with_where_conditions() {
        let conditions = vec![(
            "userId".to_string(),
            serde_json::Value::String("user-042".to_string()),
        )];
        let (sql, params) = build_select(
            "tasks",
            &["id", "title"],
            &conditions,
            Some("createdAt"),
            OrderDir::Desc,
            20,
            0,
        );
        assert_eq!(
            sql,
            r#"SELECT "id", "title" FROM "tasks" WHERE "user_id" = ?1 ORDER BY "created_at" DESC LIMIT ?2 OFFSET ?3"#
        );
        assert_eq!(params.len(), 3);
        assert_eq!(params[0], serde_json::Value::String("user-042".to_string()));
    }

    #[test]
    fn select_with_camel_case_aliases() {
        let (sql, _) = build_select(
            "tasks",
            &["id", "userId", "createdAt"],
            &[],
            None,
            OrderDir::Asc,
            10,
            0,
        );
        assert!(sql.contains(r#""user_id" AS "userId""#));
        assert!(sql.contains(r#""created_at" AS "createdAt""#));
        assert!(sql.contains(r#""id""#));
    }
}
