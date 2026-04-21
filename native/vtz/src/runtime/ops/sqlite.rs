use std::collections::HashMap;
use std::fmt;

use deno_core::error::AnyError;
use deno_core::op2;
use deno_core::OpDecl;
use deno_core::OpState;
use rusqlite::types::Value as SqliteValue;
use rusqlite::Connection;
use serde::de::{MapAccess, SeqAccess, Visitor};
use serde::ser::SerializeMap;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

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
// SqliteParam — accepts either a JSON-compatible value or a byte array
// ---------------------------------------------------------------------------

/// A single parameter passed to a prepared statement. Carries either a
/// JSON-compatible scalar (mapped to `INTEGER`/`REAL`/`TEXT`/`NULL`) or an
/// opaque byte sequence (mapped to `BLOB`).
///
/// `serde_json::Value` alone cannot represent a `Uint8Array` because it has
/// no byte-array variant; it rejects `serde_v8`'s `visit_byte_buf` with
/// `"invalid type: byte array, expected any valid JSON value"`. This enum
/// intercepts `visit_bytes`/`visit_byte_buf` before delegating everything
/// else to `serde_json::Value`.
#[derive(Debug)]
pub enum SqliteParam {
    Bytes(Vec<u8>),
    Json(serde_json::Value),
}

impl<'de> Deserialize<'de> for SqliteParam {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_any(SqliteParamVisitor)
    }
}

struct SqliteParamVisitor;

impl<'de> Visitor<'de> for SqliteParamVisitor {
    type Value = SqliteParam;

    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("a JSON scalar, JSON compound value, or Uint8Array")
    }

    fn visit_bytes<E>(self, v: &[u8]) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ok(SqliteParam::Bytes(v.to_vec()))
    }

    fn visit_byte_buf<E>(self, v: Vec<u8>) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ok(SqliteParam::Bytes(v))
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ok(SqliteParam::Json(serde_json::Value::Null))
    }

    fn visit_none<E>(self) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ok(SqliteParam::Json(serde_json::Value::Null))
    }

    fn visit_bool<E>(self, v: bool) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ok(SqliteParam::Json(serde_json::Value::Bool(v)))
    }

    fn visit_i64<E>(self, v: i64) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ok(SqliteParam::Json(serde_json::Value::from(v)))
    }

    fn visit_u64<E>(self, v: u64) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ok(SqliteParam::Json(serde_json::Value::from(v)))
    }

    fn visit_f64<E>(self, v: f64) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ok(SqliteParam::Json(serde_json::Value::from(v)))
    }

    fn visit_str<E>(self, v: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ok(SqliteParam::Json(serde_json::Value::String(v.to_owned())))
    }

    fn visit_string<E>(self, v: String) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        Ok(SqliteParam::Json(serde_json::Value::String(v)))
    }

    fn visit_seq<A>(self, seq: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let value =
            serde_json::Value::deserialize(serde::de::value::SeqAccessDeserializer::new(seq))?;
        Ok(SqliteParam::Json(value))
    }

    fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let value =
            serde_json::Value::deserialize(serde::de::value::MapAccessDeserializer::new(map))?;
        Ok(SqliteParam::Json(value))
    }
}

fn sqlite_param_to_value(p: &SqliteParam) -> SqliteValue {
    match p {
        SqliteParam::Bytes(b) => SqliteValue::Blob(b.clone()),
        SqliteParam::Json(v) => json_to_sqlite_value(v),
    }
}

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

// ---------------------------------------------------------------------------
// SqliteCell / SqliteRow — serialize SQLite column values, with BLOBs as
// Uint8Array (via `serialize_bytes`, which serde_v8 maps to a typed array).
// ---------------------------------------------------------------------------

/// A single SQLite cell. Mirrors `rusqlite::types::Value` but serializes
/// blobs as byte strings so `serde_v8` emits a `Uint8Array` to JS.
#[derive(Debug)]
enum SqliteCell {
    Null,
    Integer(i64),
    Real(f64),
    Text(String),
    Blob(Vec<u8>),
}

impl From<SqliteValue> for SqliteCell {
    fn from(v: SqliteValue) -> Self {
        match v {
            SqliteValue::Null => SqliteCell::Null,
            SqliteValue::Integer(i) => SqliteCell::Integer(i),
            SqliteValue::Real(f) => SqliteCell::Real(f),
            SqliteValue::Text(s) => SqliteCell::Text(s),
            SqliteValue::Blob(b) => SqliteCell::Blob(b),
        }
    }
}

impl Serialize for SqliteCell {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            SqliteCell::Null => serializer.serialize_unit(),
            SqliteCell::Integer(i) => serializer.serialize_i64(*i),
            SqliteCell::Real(f) => serializer.serialize_f64(*f),
            SqliteCell::Text(s) => serializer.serialize_str(s),
            SqliteCell::Blob(b) => serializer.serialize_bytes(b),
        }
    }
}

/// A row of `(column_name, cell)` pairs. Preserves column order by using a
/// `Vec` and emitting a V8 object via a custom `Serialize` impl.
#[derive(Debug, Default)]
struct SqliteRow {
    cells: Vec<(String, SqliteCell)>,
}

impl SqliteRow {
    fn with_capacity(cap: usize) -> Self {
        Self {
            cells: Vec::with_capacity(cap),
        }
    }

    fn push(&mut self, name: String, cell: SqliteCell) {
        self.cells.push((name, cell));
    }
}

impl Serialize for SqliteRow {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.cells.len()))?;
        for (k, v) in &self.cells {
            map.serialize_entry(k, v)?;
        }
        map.end()
    }
}

/// A row that can be either a full `SqliteRow` object or `null`. Used as the
/// return type of `op_sqlite_query_get`, which returns `null` when no row
/// matched. Serializes to a V8 object or `null`.
#[derive(Debug)]
enum SqliteRowOrNull {
    Row(SqliteRow),
    None,
}

impl Serialize for SqliteRowOrNull {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            SqliteRowOrNull::Row(row) => row.serialize(serializer),
            SqliteRowOrNull::None => serializer.serialize_none(),
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
    #[serde] params: Vec<SqliteParam>,
) -> Result<Vec<SqliteRow>, AnyError> {
    let store = state.borrow::<SqliteStore>();
    let conn = store.get(db_id)?;

    let mut stmt = conn.prepare(&sql)?;
    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let sqlite_params: Vec<SqliteValue> = params.iter().map(sqlite_param_to_value).collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = sqlite_params
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    let mut rows_result: Vec<SqliteRow> = Vec::new();
    let mut rows = stmt.query(param_refs.as_slice())?;

    while let Some(row) = rows.next()? {
        let mut out = SqliteRow::with_capacity(column_names.len());
        for (i, col_name) in column_names.iter().enumerate() {
            let val: SqliteValue = row.get(i)?;
            out.push(col_name.clone(), SqliteCell::from(val));
        }
        rows_result.push(out);
    }

    Ok(rows_result)
}

#[op2]
#[serde]
pub fn op_sqlite_query_get(
    state: &mut OpState,
    #[smi] db_id: u32,
    #[string] sql: String,
    #[serde] params: Vec<SqliteParam>,
) -> Result<SqliteRowOrNull, AnyError> {
    let store = state.borrow::<SqliteStore>();
    let conn = store.get(db_id)?;

    let mut stmt = conn.prepare(&sql)?;
    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let sqlite_params: Vec<SqliteValue> = params.iter().map(sqlite_param_to_value).collect();
    let param_refs: Vec<&dyn rusqlite::types::ToSql> = sqlite_params
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    let mut rows = stmt.query(param_refs.as_slice())?;

    match rows.next()? {
        Some(row) => {
            let mut out = SqliteRow::with_capacity(column_names.len());
            for (i, col_name) in column_names.iter().enumerate() {
                let val: SqliteValue = row.get(i)?;
                out.push(col_name.clone(), SqliteCell::from(val));
            }
            Ok(SqliteRowOrNull::Row(out))
        }
        None => Ok(SqliteRowOrNull::None),
    }
}

#[op2]
#[serde]
pub fn op_sqlite_query_run(
    state: &mut OpState,
    #[smi] db_id: u32,
    #[string] sql: String,
    #[serde] params: Vec<SqliteParam>,
) -> Result<serde_json::Value, AnyError> {
    let store = state.borrow::<SqliteStore>();
    let conn = store.get(db_id)?;

    let mut stmt = conn.prepare(&sql)?;
    let sqlite_params: Vec<SqliteValue> = params.iter().map(sqlite_param_to_value).collect();
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
    fn test_sqlite_bytea_round_trip_small() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(dbId, 'CREATE TABLE blobs (id INTEGER PRIMARY KEY, data BLOB)');
                const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]);
                Deno.core.ops.op_sqlite_query_run(dbId, 'INSERT INTO blobs (id, data) VALUES (?, ?)', [1, payload]);
                const row = Deno.core.ops.op_sqlite_query_get(dbId, 'SELECT data FROM blobs WHERE id = ?', [1]);
                const cell = row.data;
                [cell instanceof Uint8Array, cell.length, Array.from(cell)];
                "#,
            )
            .unwrap();

        let arr = result.as_array().unwrap();
        assert!(
            arr[0].as_bool().unwrap(),
            "read-back cell must be a Uint8Array"
        );
        assert_eq!(arr[1].as_u64().unwrap(), 6);
        assert_eq!(
            arr[2],
            serde_json::json!([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff])
        );
    }

    #[test]
    fn test_sqlite_bytea_round_trip_empty() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(dbId, 'CREATE TABLE blobs (id INTEGER PRIMARY KEY, data BLOB)');
                Deno.core.ops.op_sqlite_query_run(dbId, 'INSERT INTO blobs (id, data) VALUES (?, ?)', [1, new Uint8Array(0)]);
                const row = Deno.core.ops.op_sqlite_query_get(dbId, 'SELECT data FROM blobs WHERE id = ?', [1]);
                [row.data instanceof Uint8Array, row.data.length];
                "#,
            )
            .unwrap();

        let arr = result.as_array().unwrap();
        assert!(arr[0].as_bool().unwrap());
        assert_eq!(arr[1].as_u64().unwrap(), 0);
    }

    #[test]
    fn test_sqlite_bytea_round_trip_large() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(dbId, 'CREATE TABLE blobs (id INTEGER PRIMARY KEY, data BLOB)');
                const size = 1024 * 1024;
                const payload = new Uint8Array(size);
                for (let i = 0; i < size; i++) payload[i] = i & 0xff;
                Deno.core.ops.op_sqlite_query_run(dbId, 'INSERT INTO blobs (id, data) VALUES (?, ?)', [1, payload]);
                const row = Deno.core.ops.op_sqlite_query_get(dbId, 'SELECT data FROM blobs WHERE id = ?', [1]);
                const cell = row.data;
                let ok = cell instanceof Uint8Array && cell.length === size;
                for (let i = 0; ok && i < size; i += 997) {
                    if (cell[i] !== (i & 0xff)) ok = false;
                }
                ok;
                "#,
            )
            .unwrap();

        assert!(
            result.as_bool().unwrap(),
            "1MB payload must round-trip byte-exact"
        );
    }

    #[test]
    fn test_sqlite_bytea_query_all_returns_uint8array() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const dbId = Deno.core.ops.op_sqlite_open(':memory:');
                Deno.core.ops.op_sqlite_exec(dbId, 'CREATE TABLE blobs (id INTEGER PRIMARY KEY, data BLOB)');
                Deno.core.ops.op_sqlite_query_run(dbId, 'INSERT INTO blobs (id, data) VALUES (?, ?)', [1, new Uint8Array([1, 2, 3])]);
                Deno.core.ops.op_sqlite_query_run(dbId, 'INSERT INTO blobs (id, data) VALUES (?, ?)', [2, new Uint8Array([9, 8, 7, 6])]);
                const rows = Deno.core.ops.op_sqlite_query_all(dbId, 'SELECT * FROM blobs ORDER BY id', []);
                [
                    rows.length,
                    rows[0].data instanceof Uint8Array,
                    Array.from(rows[0].data),
                    rows[1].data instanceof Uint8Array,
                    Array.from(rows[1].data),
                ];
                "#,
            )
            .unwrap();

        let arr = result.as_array().unwrap();
        assert_eq!(arr[0].as_u64().unwrap(), 2);
        assert!(arr[1].as_bool().unwrap());
        assert_eq!(arr[2], serde_json::json!([1, 2, 3]));
        assert!(arr[3].as_bool().unwrap());
        assert_eq!(arr[4], serde_json::json!([9, 8, 7, 6]));
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
