use std::collections::HashMap;

use deno_core::error::AnyError;
use deno_core::op2;
use deno_core::OpDecl;
use deno_core::OpState;
use rusqlite::types::Value as SqliteValue;
use rusqlite::Connection;

// ---------------------------------------------------------------------------
// Handle store — opaque db_id in OpState
// ---------------------------------------------------------------------------

/// Per-runtime SQLite connection store. JS only sees `db_id` (u32).
#[derive(Default)]
pub struct SqliteStore {
    next_db_id: u32,
    connections: HashMap<u32, Connection>,
}

impl SqliteStore {
    pub fn open(&mut self, path: &str) -> Result<u32, AnyError> {
        let conn = if path == ":memory:" {
            Connection::open_in_memory()?
        } else {
            Connection::open(path)?
        };
        let id = self.next_db_id;
        self.next_db_id = self
            .next_db_id
            .checked_add(1)
            .ok_or_else(|| deno_core::anyhow::anyhow!("SqliteStore: db ID overflow"))?;
        self.connections.insert(id, conn);
        Ok(id)
    }

    pub fn get(&self, id: u32) -> Result<&Connection, AnyError> {
        self.connections
            .get(&id)
            .ok_or_else(|| deno_core::anyhow::anyhow!("database is closed"))
    }

    pub fn close(&mut self, id: u32) -> Result<(), AnyError> {
        self.connections
            .remove(&id)
            .ok_or_else(|| deno_core::anyhow::anyhow!("database is closed"))?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helper: convert serde_json::Value params to rusqlite params
// ---------------------------------------------------------------------------

fn json_to_sqlite_value(v: &serde_json::Value) -> SqliteValue {
    match v {
        serde_json::Value::Null => SqliteValue::Null,
        serde_json::Value::Bool(b) => SqliteValue::Integer(if *b { 1 } else { 0 }),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqliteValue::Integer(i)
            } else if let Some(f) = n.as_f64() {
                SqliteValue::Real(f)
            } else {
                SqliteValue::Null
            }
        }
        serde_json::Value::String(s) => SqliteValue::Text(s.clone()),
        // Arrays and objects are serialized as JSON text
        _ => SqliteValue::Text(v.to_string()),
    }
}

fn sqlite_value_to_json(v: SqliteValue) -> serde_json::Value {
    match v {
        SqliteValue::Null => serde_json::Value::Null,
        SqliteValue::Integer(i) => serde_json::json!(i),
        SqliteValue::Real(f) => serde_json::json!(f),
        SqliteValue::Text(s) => serde_json::json!(s),
        SqliteValue::Blob(b) => {
            // Best-effort: encode as array of bytes
            serde_json::json!(b)
        }
    }
}

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

#[op2(fast)]
#[smi]
pub fn op_sqlite_open(state: &mut OpState, #[string] path: String) -> Result<u32, AnyError> {
    let store = state.borrow_mut::<SqliteStore>();
    store.open(&path)
}

#[op2(fast)]
pub fn op_sqlite_exec(
    state: &mut OpState,
    #[smi] db_id: u32,
    #[string] sql: String,
) -> Result<(), AnyError> {
    let store = state.borrow::<SqliteStore>();
    let conn = store.get(db_id)?;
    conn.execute_batch(&sql)?;
    Ok(())
}

#[op2]
#[serde]
pub fn op_sqlite_query_all(
    state: &mut OpState,
    #[smi] db_id: u32,
    #[string] sql: String,
    #[serde] params: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Value>, AnyError> {
    let store = state.borrow::<SqliteStore>();
    let conn = store.get(db_id)?;

    let mut stmt = conn.prepare(&sql)?;
    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let sqlite_params: Vec<SqliteValue> = params.iter().map(json_to_sqlite_value).collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = sqlite_params
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    let mut rows_result: Vec<serde_json::Value> = Vec::new();
    let mut rows = stmt.query(param_refs.as_slice())?;

    while let Some(row) = rows.next()? {
        let mut obj = serde_json::Map::new();
        for (i, col_name) in column_names.iter().enumerate() {
            let val: SqliteValue = row.get(i)?;
            obj.insert(col_name.clone(), sqlite_value_to_json(val));
        }
        rows_result.push(serde_json::Value::Object(obj));
    }

    Ok(rows_result)
}

#[op2]
#[serde]
pub fn op_sqlite_query_get(
    state: &mut OpState,
    #[smi] db_id: u32,
    #[string] sql: String,
    #[serde] params: Vec<serde_json::Value>,
) -> Result<serde_json::Value, AnyError> {
    let store = state.borrow::<SqliteStore>();
    let conn = store.get(db_id)?;

    let mut stmt = conn.prepare(&sql)?;
    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let sqlite_params: Vec<SqliteValue> = params.iter().map(json_to_sqlite_value).collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = sqlite_params
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    let mut rows = stmt.query(param_refs.as_slice())?;

    match rows.next()? {
        Some(row) => {
            let mut obj = serde_json::Map::new();
            for (i, col_name) in column_names.iter().enumerate() {
                let val: SqliteValue = row.get(i)?;
                obj.insert(col_name.clone(), sqlite_value_to_json(val));
            }
            Ok(serde_json::Value::Object(obj))
        }
        None => Ok(serde_json::Value::Null),
    }
}

#[op2]
#[serde]
pub fn op_sqlite_query_run(
    state: &mut OpState,
    #[smi] db_id: u32,
    #[string] sql: String,
    #[serde] params: Vec<serde_json::Value>,
) -> Result<serde_json::Value, AnyError> {
    let store = state.borrow::<SqliteStore>();
    let conn = store.get(db_id)?;

    let mut stmt = conn.prepare(&sql)?;
    let sqlite_params: Vec<SqliteValue> = params.iter().map(json_to_sqlite_value).collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = sqlite_params
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    let changes = stmt.execute(param_refs.as_slice())?;

    Ok(serde_json::json!({ "changes": changes }))
}

#[op2(fast)]
pub fn op_sqlite_close(state: &mut OpState, #[smi] db_id: u32) -> Result<(), AnyError> {
    let store = state.borrow_mut::<SqliteStore>();
    store.close(db_id)
}

// ---------------------------------------------------------------------------
// Op registration
// ---------------------------------------------------------------------------

pub fn op_decls() -> Vec<OpDecl> {
    vec![
        op_sqlite_open(),
        op_sqlite_exec(),
        op_sqlite_query_all(),
        op_sqlite_query_get(),
        op_sqlite_query_run(),
        op_sqlite_close(),
    ]
}

// No bootstrap JS needed — the synthetic module IS the bootstrap.
// It's loaded on import, not at startup.

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap()
    }

    // -- Phase 1: Rust op tests via JS execute_script --

    #[test]
    fn test_sqlite_open_memory() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "Deno.core.ops.op_sqlite_open(':memory:')")
            .unwrap();
        // Should return a db_id (number >= 0)
        assert!(result.is_number());
        assert!(result.as_u64().unwrap() < 1000);
    }

    #[test]
    fn test_sqlite_open_file() {
        let tmp = tempfile::tempdir().unwrap();
        let db_path = tmp.path().join("test.db");
        let path_str = db_path.to_string_lossy().to_string();

        let mut rt = create_runtime();
        let escaped = serde_json::to_string(&path_str).unwrap();
        let script = format!("Deno.core.ops.op_sqlite_open({})", escaped);
        let result = rt.execute_script("<test>", &script).unwrap();
        assert!(result.is_number());

        // File should be created
        assert!(db_path.exists());
    }

    #[test]
    fn test_sqlite_exec_ddl() {
        let mut rt = create_runtime();
        rt.execute_script_void(
            "<test>",
            r#"
            const dbId = Deno.core.ops.op_sqlite_open(':memory:');
            Deno.core.ops.op_sqlite_exec(dbId, 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
            "#,
        )
        .unwrap();
    }

    #[test]
    fn test_sqlite_exec_multi_statement() {
        let mut rt = create_runtime();
        rt.execute_script_void(
            "<test>",
            r#"
            const dbId = Deno.core.ops.op_sqlite_open(':memory:');
            Deno.core.ops.op_sqlite_exec(dbId, `
                CREATE TABLE a (id INTEGER PRIMARY KEY);
                CREATE TABLE b (id INTEGER PRIMARY KEY);
            `);
            "#,
        )
        .unwrap();
    }

    #[test]
    fn test_sqlite_query_all_returns_rows() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(dbId, 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
                Deno.core.ops.op_sqlite_query_run(dbId, 'INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
                Deno.core.ops.op_sqlite_query_run(dbId, 'INSERT INTO users (id, name) VALUES (?, ?)', [2, 'Bob']);
                Deno.core.ops.op_sqlite_query_all(dbId, 'SELECT * FROM users ORDER BY id', []);
                "#,
            )
            .unwrap();

        let rows = result.as_array().unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0]["id"], 1);
        assert_eq!(rows[0]["name"], "Alice");
        assert_eq!(rows[1]["id"], 2);
        assert_eq!(rows[1]["name"], "Bob");
    }

    #[test]
    fn test_sqlite_query_all_empty_result() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(dbId, 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
                Deno.core.ops.op_sqlite_query_all(dbId, 'SELECT * FROM users', []);
                "#,
            )
            .unwrap();

        let rows = result.as_array().unwrap();
        assert_eq!(rows.len(), 0);
    }

    #[test]
    fn test_sqlite_query_get_returns_single_row() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(dbId, 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
                Deno.core.ops.op_sqlite_query_run(dbId, 'INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
                Deno.core.ops.op_sqlite_query_get(dbId, 'SELECT * FROM users WHERE id = ?', [1]);
                "#,
            )
            .unwrap();

        assert!(result.is_object());
        assert_eq!(result["id"], 1);
        assert_eq!(result["name"], "Alice");
    }

    #[test]
    fn test_sqlite_query_get_returns_null_when_no_match() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(dbId, 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
                Deno.core.ops.op_sqlite_query_get(dbId, 'SELECT * FROM users WHERE id = ?', [999]);
                "#,
            )
            .unwrap();

        assert!(result.is_null());
    }

    #[test]
    fn test_sqlite_query_run_returns_changes() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(dbId, 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
                Deno.core.ops.op_sqlite_query_run(dbId, 'INSERT INTO users (id, name) VALUES (?, ?)', [1, 'Alice']);
                "#,
            )
            .unwrap();

        assert_eq!(result["changes"], 1);
    }

    #[test]
    fn test_sqlite_null_round_trip() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(dbId, 'CREATE TABLE t (id INTEGER, v TEXT)');
                Deno.core.ops.op_sqlite_query_run(dbId, 'INSERT INTO t (id, v) VALUES (?, ?)', [1, null]);
                Deno.core.ops.op_sqlite_query_all(dbId, 'SELECT * FROM t', []);
                "#,
            )
            .unwrap();

        let rows = result.as_array().unwrap();
        assert_eq!(rows[0]["id"], 1);
        assert!(rows[0]["v"].is_null());
    }

    #[test]
    fn test_sqlite_close_and_reuse_fails() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
            const dbId = Deno.core.ops.op_sqlite_open(':memory:');
            Deno.core.ops.op_sqlite_close(dbId);
            try {
                Deno.core.ops.op_sqlite_exec(dbId, 'SELECT 1');
                'no-error';
            } catch (e) {
                e.message;
            }
            "#,
            )
            .unwrap();

        assert_eq!(result, "database is closed");
    }

    #[test]
    fn test_sqlite_close_twice_fails() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_close(dbId);
                try {
                    Deno.core.ops.op_sqlite_close(dbId);
                    'no-error';
                } catch (e) {
                    e.message;
                }
                "#,
            )
            .unwrap();

        assert_eq!(result, "database is closed");
    }

    #[test]
    fn test_sqlite_parameterized_query() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(dbId, 'CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT, price REAL)');
                Deno.core.ops.op_sqlite_query_run(dbId, 'INSERT INTO items (id, label, price) VALUES (?, ?, ?)', [1, 'Widget', 9.99]);
                Deno.core.ops.op_sqlite_query_all(dbId, 'SELECT * FROM items WHERE price > ?', [5.0]);
                "#,
            )
            .unwrap();

        let rows = result.as_array().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["label"], "Widget");
        assert_eq!(rows[0]["price"], 9.99);
    }

    #[test]
    fn test_sqlite_query_all_no_params() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(dbId, 'CREATE TABLE t (id INTEGER PRIMARY KEY)');
                Deno.core.ops.op_sqlite_query_run(dbId, 'INSERT INTO t (id) VALUES (?)', [1]);
                Deno.core.ops.op_sqlite_query_all(dbId, 'SELECT * FROM t', []);
                "#,
            )
            .unwrap();

        let rows = result.as_array().unwrap();
        assert_eq!(rows.len(), 1);
    }

    #[test]
    fn test_sqlite_pragma_query() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(dbId, 'PRAGMA journal_mode = WAL');
                Deno.core.ops.op_sqlite_query_all(dbId, 'PRAGMA journal_mode', []);
                "#,
            )
            .unwrap();

        let rows = result.as_array().unwrap();
        assert_eq!(rows.len(), 1);
        // In-memory DBs use "memory" journal mode, but the PRAGMA still returns a result
        assert!(rows[0].get("journal_mode").is_some());
    }

    #[test]
    fn test_sqlite_multiple_databases() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const db1 = Deno.core.ops.op_sqlite_open(':memory:');
                const db2 = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(db1, 'CREATE TABLE t1 (id INTEGER)');
                Deno.core.ops.op_sqlite_exec(db2, 'CREATE TABLE t2 (id INTEGER)');
                Deno.core.ops.op_sqlite_query_run(db1, 'INSERT INTO t1 (id) VALUES (?)', [1]);
                Deno.core.ops.op_sqlite_query_run(db2, 'INSERT INTO t2 (id) VALUES (?)', [2]);
                const r1 = Deno.core.ops.op_sqlite_query_all(db1, 'SELECT * FROM t1', []);
                const r2 = Deno.core.ops.op_sqlite_query_all(db2, 'SELECT * FROM t2', []);
                [r1[0].id, r2[0].id];
                "#,
            )
            .unwrap();

        assert_eq!(result, serde_json::json!([1, 2]));
    }

    #[test]
    fn test_sqlite_ddl_returns_zero_changes() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_query_run(dbId, 'CREATE TABLE t (id INTEGER PRIMARY KEY)', []);
                "#,
            )
            .unwrap();

        assert_eq!(result["changes"], 0);
    }

    #[test]
    fn test_sqlite_boolean_params() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(dbId, 'CREATE TABLE flags (id INTEGER, active INTEGER)');
                Deno.core.ops.op_sqlite_query_run(dbId, 'INSERT INTO flags (id, active) VALUES (?, ?)', [1, true]);
                Deno.core.ops.op_sqlite_query_run(dbId, 'INSERT INTO flags (id, active) VALUES (?, ?)', [2, false]);
                Deno.core.ops.op_sqlite_query_all(dbId, 'SELECT * FROM flags ORDER BY id', []);
                "#,
            )
            .unwrap();

        let rows = result.as_array().unwrap();
        assert_eq!(rows[0]["active"], 1); // true → 1
        assert_eq!(rows[1]["active"], 0); // false → 0
    }
}
