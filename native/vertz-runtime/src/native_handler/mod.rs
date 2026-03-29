//! Rust-native CRUD handler for POC benchmarking.
//!
//! Performs the full list operation pipeline entirely in Rust:
//! JWT verification → access rule evaluation → SQL generation →
//! query execution → response serialization.

pub mod access_rules;
pub mod jwt;
pub mod response;
pub mod sql_builder;

use access_rules::{AccessRule, EvalResult};
pub use jwt::JwtClaims;
use response::ColumnMap;
use rusqlite::Connection;

/// Configuration for an entity's list operation.
pub struct EntityConfig {
    pub table: String,
    pub columns: Vec<String>,
    pub access_rule: AccessRule,
    pub column_map: ColumnMap,
}

/// Query parameters for a list request.
pub struct ListParams {
    pub limit: u32,
    pub offset: u32,
    pub order_by: Option<String>,
    pub order_dir: sql_builder::OrderDir,
}

#[derive(Debug)]
pub enum HandlerError {
    Auth(jwt::JwtError),
    Access(access_rules::AccessError),
    Db(rusqlite::Error),
}

impl std::fmt::Display for HandlerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HandlerError::Auth(e) => write!(f, "Auth error: {}", e),
            HandlerError::Access(e) => write!(f, "Access error: {}", e),
            HandlerError::Db(e) => write!(f, "DB error: {}", e),
        }
    }
}

impl std::error::Error for HandlerError {}

/// Execute a full list operation entirely in Rust.
///
/// This is the Rust-native fast path: no V8, no FFI, no JS.
pub fn handle_list(
    config: &EntityConfig,
    conn: &Connection,
    auth_header: &str,
    params: &ListParams,
    jwt_secret: &[u8],
) -> Result<serde_json::Value, HandlerError> {
    // 1. Extract and verify JWT
    let token = auth_header.strip_prefix("Bearer ").unwrap_or(auth_header);
    let claims = jwt::verify_hs256(token, jwt_secret).map_err(HandlerError::Auth)?;

    // 2. Evaluate access rules
    let eval_result: EvalResult =
        access_rules::evaluate(&config.access_rule, &claims).map_err(HandlerError::Access)?;

    // 3. Build SQL
    let col_refs: Vec<&str> = config.columns.iter().map(|s| s.as_str()).collect();
    let (sql, sql_params) = sql_builder::build_select(
        &config.table,
        &col_refs,
        &eval_result.where_conditions,
        params.order_by.as_deref(),
        params.order_dir,
        params.limit,
        params.offset,
    );

    // 4. Execute query
    let mut stmt = conn.prepare_cached(&sql).map_err(HandlerError::Db)?;

    // Bind parameters
    let rusqlite_params: Vec<Box<dyn rusqlite::types::ToSql>> = sql_params
        .iter()
        .map(|v| -> Box<dyn rusqlite::types::ToSql> {
            match v {
                serde_json::Value::String(s) => Box::new(s.clone()),
                serde_json::Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        Box::new(i)
                    } else {
                        Box::new(n.as_f64().unwrap_or(0.0))
                    }
                }
                serde_json::Value::Bool(b) => Box::new(*b),
                serde_json::Value::Null => Box::new(rusqlite::types::Null),
                _ => Box::new(v.to_string()),
            }
        })
        .collect();

    let param_refs: Vec<&dyn rusqlite::types::ToSql> =
        rusqlite_params.iter().map(|p| p.as_ref()).collect();

    let rows: Vec<serde_json::Value> = stmt
        .query_map(param_refs.as_slice(), |row| {
            response::row_to_json(row, &config.column_map)
        })
        .map_err(HandlerError::Db)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(HandlerError::Db)?;

    // 5. Build response
    let item_count = rows.len();
    Ok(response::build_list_response(
        rows,
        Some(item_count as u64),
        params.limit,
        params.offset,
    ))
}

/// Create the standard task entity config used in benchmarks.
pub fn task_entity_config() -> EntityConfig {
    use access_rules::{UserMarker, WhereValue};
    use std::collections::HashMap;

    let columns = vec![
        "id".to_string(),
        "title".to_string(),
        "description".to_string(),
        "status".to_string(),
        "userId".to_string(),
        "createdAt".to_string(),
        "updatedAt".to_string(),
    ];

    let mut where_conditions = HashMap::new();
    where_conditions.insert(
        "userId".to_string(),
        WhereValue::Marker(UserMarker {
            marker: "user.id".to_string(),
        }),
    );

    EntityConfig {
        table: "tasks".to_string(),
        columns: columns.clone(),
        access_rule: AccessRule::All {
            rules: vec![
                AccessRule::Authenticated,
                AccessRule::Where {
                    conditions: where_conditions,
                },
            ],
        },
        column_map: ColumnMap::from_camel_names(
            &columns.iter().map(|s| s.as_str()).collect::<Vec<_>>(),
        ),
    }
}

/// Seed a SQLite database with test task data.
pub fn seed_database(conn: &Connection, num_users: u32, tasks_per_user: u32) {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'todo',
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )
    .unwrap();

    let mut stmt = conn
        .prepare(
            "INSERT INTO tasks (id, title, description, status, user_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .unwrap();

    let statuses = ["todo", "in_progress", "done", "review"];
    let mut task_num = 0u32;

    for user_idx in 0..num_users {
        let user_id = format!("user-{:03}", user_idx);
        for task_idx in 0..tasks_per_user {
            let id = format!("task-{:06}", task_num);
            let title = format!("Task {} for user {}", task_idx, user_idx);
            let description = format!("Description for task {}", task_num);
            let status = statuses[task_num as usize % statuses.len()];
            let created_at = format!("2026-03-{:02}T10:00:00Z", (task_num % 28) + 1);
            let updated_at = &created_at;

            stmt.execute(rusqlite::params![
                id,
                title,
                description,
                status,
                user_id,
                created_at,
                updated_at
            ])
            .unwrap();
            task_num += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    const SECRET: &[u8] = b"test-secret-key-for-benchmarks!!";

    fn setup() -> (Connection, EntityConfig, String) {
        let conn = Connection::open_in_memory().unwrap();
        seed_database(&conn, 100, 100); // 100 users, 100 tasks each = 10,000 rows
        let config = task_entity_config();
        let claims = JwtClaims {
            sub: "user-042".to_string(),
            tenant_id: None,
            roles: vec!["user".to_string()],
            exp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs()
                + 3600,
            iat: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        };
        let token = jwt::create_hs256(&claims, SECRET);
        (conn, config, token)
    }

    #[test]
    fn full_list_pipeline() {
        let (conn, config, token) = setup();
        let params = ListParams {
            limit: 20,
            offset: 0,
            order_by: Some("createdAt".to_string()),
            order_dir: sql_builder::OrderDir::Desc,
        };

        let result = handle_list(
            &config,
            &conn,
            &format!("Bearer {}", token),
            &params,
            SECRET,
        );
        assert!(result.is_ok(), "Error: {:?}", result.err());
        let response = result.unwrap();
        let items = response["items"].as_array().unwrap();
        assert_eq!(items.len(), 20);
        // Verify camelCase field names
        assert!(items[0].get("userId").is_some());
        assert!(items[0].get("createdAt").is_some());
    }

    #[test]
    fn list_filters_by_user() {
        let (conn, config, token) = setup();
        let params = ListParams {
            limit: 200,
            offset: 0,
            order_by: None,
            order_dir: sql_builder::OrderDir::Asc,
        };

        let result = handle_list(
            &config,
            &conn,
            &format!("Bearer {}", token),
            &params,
            SECRET,
        );
        let response = result.unwrap();
        let items = response["items"].as_array().unwrap();
        // user-042 has 100 tasks
        assert_eq!(items.len(), 100);
        // All items belong to user-042
        for item in items {
            assert_eq!(item["userId"], "user-042");
        }
    }

    #[test]
    fn invalid_token_rejected() {
        let (conn, config, _) = setup();
        let params = ListParams {
            limit: 20,
            offset: 0,
            order_by: None,
            order_dir: sql_builder::OrderDir::Asc,
        };

        let result = handle_list(&config, &conn, "Bearer invalid-token", &params, SECRET);
        assert!(result.is_err());
    }
}
