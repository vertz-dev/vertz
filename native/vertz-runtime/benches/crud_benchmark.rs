//! POC Benchmark: Rust-Native CRUD vs V8-Mediated CRUD
//!
//! Compares three execution paths for a CRUD list operation:
//! - Path A: V8 per-request isolate (new isolate per request — current model)
//! - Path B: V8 persistent isolate (reuse isolate, call handler function)
//! - Path C: Rust-native (no V8 — all Rust)
//!
//! Run: cargo bench --bench crud_benchmark

use criterion::{criterion_group, criterion_main, Criterion};
use rusqlite::Connection;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use vertz_runtime::native_handler::jwt::{self, JwtClaims};
use vertz_runtime::native_handler::sql_builder::OrderDir;
use vertz_runtime::native_handler::{self, ListParams};
use vertz_runtime::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JWT_SECRET: &[u8] = b"benchmark-secret-key-32-bytes!!!";
const BENCH_USER_ID: &str = "user-042";
const NUM_USERS: u32 = 100;
const TASKS_PER_USER: u32 = 100; // 10,000 total rows

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

fn create_jwt_token() -> String {
    let claims = JwtClaims {
        sub: BENCH_USER_ID.to_string(),
        tenant_id: Some("tenant-001".to_string()),
        roles: vec!["user".to_string()],
        exp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 86400, // 24 hours
        iat: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    };
    jwt::create_hs256(&claims, JWT_SECRET)
}

fn create_seeded_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    native_handler::seed_database(&conn, NUM_USERS, TASKS_PER_USER);
    conn
}

fn default_list_params() -> ListParams {
    ListParams {
        limit: 20,
        offset: 0,
        order_by: Some("createdAt".to_string()),
        order_dir: OrderDir::Desc,
    }
}

// ---------------------------------------------------------------------------
// JS handler code for V8 benchmarks
// ---------------------------------------------------------------------------

/// JS module that implements the same CRUD list pipeline.
fn js_handler_code(db_path: &str) -> String {
    format!(
        r#"
// --- Minimal JWT verification (HS256) ---
function base64UrlDecode(str) {{
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}}

let hmacKeyObj = null;

async function initHmac(secretStr) {{
  const enc = new TextEncoder();
  hmacKeyObj = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretStr),
    {{ name: 'HMAC', hash: 'SHA-256' }},
    false,
    ['sign', 'verify']
  );
}}

async function verifyJwt(token) {{
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');

  const signingInput = parts[0] + '.' + parts[1];
  const signature = base64UrlDecode(parts[2]);

  const enc = new TextEncoder();
  const valid = await crypto.subtle.verify(
    'HMAC', hmacKeyObj, signature, enc.encode(signingInput)
  );
  if (!valid) throw new Error('Invalid JWT signature');

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) throw new Error('JWT expired');
  return payload;
}}

// --- Access rule evaluation ---
function evaluateRule(rule, claims) {{
  switch (rule.type) {{
    case 'public':
      return {{ allowed: true, conditions: [] }};
    case 'authenticated':
      if (!claims.sub) throw new Error('Not authenticated');
      return {{ allowed: true, conditions: [] }};
    case 'where': {{
      const conditions = [];
      for (const [field, value] of Object.entries(rule.conditions)) {{
        if (value && value.__marker) {{
          const resolved = value.__marker === 'user.id' ? claims.sub
            : value.__marker === 'user.tenantId' ? claims.tenant_id
            : null;
          if (resolved === null) throw new Error('Unknown marker: ' + value.__marker);
          conditions.push([field, resolved]);
        }} else {{
          conditions.push([field, value]);
        }}
      }}
      return {{ allowed: true, conditions }};
    }}
    case 'all': {{
      const allConditions = [];
      for (const sub of rule.rules) {{
        const result = evaluateRule(sub, claims);
        allConditions.push(...result.conditions);
      }}
      return {{ allowed: true, conditions: allConditions }};
    }}
    case 'any': {{
      let lastError = null;
      for (const sub of rule.rules) {{
        try {{ return evaluateRule(sub, claims); }}
        catch (e) {{ lastError = e; }}
      }}
      throw lastError || new Error('No rules matched');
    }}
    default:
      throw new Error('Unknown rule type: ' + rule.type);
  }}
}}

// --- SQL builder ---
function camelToSnake(s) {{
  return s.replace(/[A-Z]/g, (c, i) => (i > 0 ? '_' : '') + c.toLowerCase());
}}

function snakeToCamel(s) {{
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}}

function buildSelect(table, columns, conditions, orderBy, orderDir, limit, offset) {{
  const params = [];
  let sql = 'SELECT ';
  sql += columns.map(col => {{
    const snake = camelToSnake(col);
    return snake !== col ? `"${{snake}}" AS "${{col}}"` : `"${{col}}"`;
  }}).join(', ');
  sql += ` FROM "${{table}}"`;

  if (conditions.length > 0) {{
    sql += ' WHERE ';
    sql += conditions.map(([field, value], i) => {{
      params.push(value);
      return `"${{camelToSnake(field)}}" = ?${{i + 1}}`;
    }}).join(' AND ');
  }}

  if (orderBy) {{
    sql += ` ORDER BY "${{camelToSnake(orderBy)}}" ${{orderDir === 'desc' ? 'DESC' : 'ASC'}}`;
  }}

  params.push(limit);
  sql += ` LIMIT ?${{params.length}}`;
  params.push(offset);
  sql += ` OFFSET ?${{params.length}}`;

  return [sql, params];
}}

// --- DB ---
let dbHandle = null;

function openDb(path) {{
  dbHandle = Deno.core.ops.op_sqlite_open(path);
}}

function queryAll(sql, params) {{
  return Deno.core.ops.op_sqlite_query_all(dbHandle, sql, params);
}}

// --- Main handler ---
const ACCESS_RULES = {{
  type: 'all',
  rules: [
    {{ type: 'authenticated' }},
    {{ type: 'where', conditions: {{ userId: {{ __marker: 'user.id' }} }} }},
  ],
}};

const COLUMNS = ['id', 'title', 'description', 'status', 'userId', 'createdAt', 'updatedAt'];

async function handleList(authHeader, limit, offset, orderBy, orderDir) {{
  const token = authHeader.replace('Bearer ', '');
  const claims = await verifyJwt(token);
  const evalResult = evaluateRule(ACCESS_RULES, claims);
  const [sql, params] = buildSelect('tasks', COLUMNS, evalResult.conditions, orderBy, orderDir, limit, offset);
  const rows = queryAll(sql, params);

  const items = rows.map(row => {{
    const mapped = {{}};
    for (const [key, value] of Object.entries(row)) {{
      mapped[snakeToCamel(key)] = value;
    }}
    return mapped;
  }});

  return JSON.stringify({{
    items,
    pagination: {{ limit, offset, total: items.length }},
  }});
}}

globalThis.__handleList = handleList;
globalThis.__initHmac = initHmac;
globalThis.__openDb = openDb;

const SECRET_STR = '{secret_str}';
const DB_PATH = '{db_path}';
"#,
        secret_str = std::str::from_utf8(JWT_SECRET).unwrap(),
        db_path = db_path,
    )
}

// ---------------------------------------------------------------------------
// SQLite ops for V8 benchmark (minimal — just open + query_all)
// ---------------------------------------------------------------------------

mod sqlite_ops {
    use deno_core::{op2, OpDecl, OpState};
    use rusqlite::Connection;
    use std::collections::HashMap;

    pub struct SqliteStore {
        connections: HashMap<u32, Connection>,
        next_id: u32,
    }

    impl Default for SqliteStore {
        fn default() -> Self {
            SqliteStore {
                connections: HashMap::new(),
                next_id: 1,
            }
        }
    }

    #[op2(fast)]
    #[smi]
    pub fn op_sqlite_open(
        state: &mut OpState,
        #[string] path: String,
    ) -> Result<u32, deno_core::error::AnyError> {
        let conn = Connection::open(&path)?;
        let store = state.borrow_mut::<SqliteStore>();
        let id = store.next_id;
        store.next_id += 1;
        store.connections.insert(id, conn);
        Ok(id)
    }

    #[op2]
    #[serde]
    pub fn op_sqlite_query_all(
        state: &mut OpState,
        #[smi] handle: u32,
        #[string] sql: String,
        #[serde] params: Vec<serde_json::Value>,
    ) -> Result<Vec<serde_json::Map<String, serde_json::Value>>, deno_core::error::AnyError> {
        let store = state.borrow::<SqliteStore>();
        let conn = store
            .connections
            .get(&handle)
            .ok_or_else(|| deno_core::anyhow::anyhow!("Invalid DB handle"))?;

        let mut stmt = conn.prepare(&sql)?;

        let rusqlite_params: Vec<Box<dyn rusqlite::types::ToSql>> = params
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

        let column_count = stmt.column_count();
        let column_names: Vec<String> = (0..column_count)
            .map(|i| stmt.column_name(i).unwrap().to_string())
            .collect();

        let rows = stmt
            .query_map(param_refs.as_slice(), |row| {
                let mut obj = serde_json::Map::new();
                for (idx, name) in column_names.iter().enumerate() {
                    let value = match row.get_ref(idx)? {
                        rusqlite::types::ValueRef::Null => serde_json::Value::Null,
                        rusqlite::types::ValueRef::Integer(i) => serde_json::json!(i),
                        rusqlite::types::ValueRef::Real(f) => serde_json::json!(f),
                        rusqlite::types::ValueRef::Text(t) => {
                            serde_json::Value::String(String::from_utf8_lossy(t).to_string())
                        }
                        rusqlite::types::ValueRef::Blob(b) => {
                            serde_json::Value::String(format!("<blob:{}>", b.len()))
                        }
                    };
                    obj.insert(name.clone(), value);
                }
                Ok(obj)
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    pub fn op_decls() -> Vec<OpDecl> {
        vec![op_sqlite_open(), op_sqlite_query_all()]
    }
}

// ---------------------------------------------------------------------------
// V8 runtime with SQLite ops
// ---------------------------------------------------------------------------

fn create_v8_runtime_with_sqlite() -> deno_core::JsRuntime {
    use deno_core::{Extension, JsRuntime, RuntimeOptions};

    let mut all_ops = Vec::new();
    all_ops.extend(vertz_runtime::runtime::ops::clone::op_decls());
    all_ops.extend(vertz_runtime::runtime::ops::console::op_decls());
    all_ops.extend(vertz_runtime::runtime::ops::timers::op_decls());
    all_ops.extend(vertz_runtime::runtime::ops::crypto::op_decls());
    all_ops.extend(vertz_runtime::runtime::ops::encoding::op_decls());
    all_ops.extend(vertz_runtime::runtime::ops::performance::op_decls());
    all_ops.extend(vertz_runtime::runtime::ops::crypto_subtle::op_decls());
    all_ops.extend(vertz_runtime::runtime::ops::web_api::op_decls());
    all_ops.extend(vertz_runtime::runtime::ops::microtask::op_decls());
    all_ops.extend(sqlite_ops::op_decls());

    let start_time = std::time::Instant::now();

    let ext = Extension {
        name: "vertz_bench",
        ops: std::borrow::Cow::Owned(all_ops),
        op_state_fn: Some(Box::new(move |state| {
            state.put(vertz_runtime::runtime::ops::console::ConsoleState {
                capture: false,
                captured: std::sync::Arc::new(std::sync::Mutex::new(
                    vertz_runtime::runtime::js_runtime::CapturedOutput::default(),
                )),
            });
            state.put(vertz_runtime::runtime::ops::performance::PerformanceState { start_time });
            state.put(vertz_runtime::runtime::ops::crypto_subtle::CryptoKeyStore::default());
            state.put(sqlite_ops::SqliteStore::default());
        })),
        ..Default::default()
    };

    let mut runtime = JsRuntime::new(RuntimeOptions {
        extensions: vec![ext],
        ..Default::default()
    });

    vertz_runtime::runtime::ops::clone::register_structured_clone(&mut runtime);

    let bootstrap = [
        vertz_runtime::runtime::ops::clone::CLONE_BOOTSTRAP_JS,
        vertz_runtime::runtime::ops::console::CONSOLE_BOOTSTRAP_JS,
        vertz_runtime::runtime::ops::timers::TIMERS_BOOTSTRAP_JS,
        vertz_runtime::runtime::ops::crypto::CRYPTO_BOOTSTRAP_JS,
        vertz_runtime::runtime::ops::encoding::ENCODING_BOOTSTRAP_JS,
        vertz_runtime::runtime::ops::performance::PERFORMANCE_BOOTSTRAP_JS,
        vertz_runtime::runtime::ops::web_api::WEB_API_BOOTSTRAP_JS,
        vertz_runtime::runtime::ops::microtask::MICROTASK_BOOTSTRAP_JS,
    ]
    .join("\n");

    runtime
        .execute_script("[vertz:bootstrap]", deno_core::FastString::from(bootstrap))
        .unwrap();

    runtime
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

fn bench_rust_native(c: &mut Criterion) {
    let mut group = c.benchmark_group("rust-native");
    group.measurement_time(Duration::from_secs(10));

    let conn = create_seeded_db();
    let config = native_handler::task_entity_config();
    let token = create_jwt_token();
    let auth_header = format!("Bearer {}", token);
    let params = default_list_params();

    // Warm: List 20 tasks (typical request)
    group.bench_function("list-20", |b| {
        b.iter(|| {
            native_handler::handle_list(&config, &conn, &auth_header, &params, JWT_SECRET).unwrap()
        })
    });

    // Large result: 100 tasks
    let large_params = ListParams {
        limit: 100,
        offset: 0,
        order_by: Some("createdAt".to_string()),
        order_dir: OrderDir::Desc,
    };
    group.bench_function("list-100", |b| {
        b.iter(|| {
            native_handler::handle_list(&config, &conn, &auth_header, &large_params, JWT_SECRET)
                .unwrap()
        })
    });

    // JWT verification only
    group.bench_function("jwt-only", |b| {
        b.iter(|| jwt::verify_hs256(&token, JWT_SECRET).unwrap())
    });

    group.finish();
}

fn bench_v8_cold(c: &mut Criterion) {
    let mut group = c.benchmark_group("v8-cold");
    group.sample_size(10);
    group.measurement_time(Duration::from_secs(30));

    // V8 cold: create a new VertzJsRuntime per "request"
    group.bench_function("full-runtime-creation", |b| {
        b.iter(|| {
            let mut runtime = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
            let _ = runtime.execute_script("<bench>", "1 + 1").unwrap();
        })
    });

    // V8 cold: create minimal runtime with sqlite ops
    group.bench_function("sqlite-runtime-creation", |b| {
        b.iter(|| {
            let _runtime = create_v8_runtime_with_sqlite();
        })
    });

    group.finish();
}

fn bench_v8_persistent(c: &mut Criterion) {
    let mut group = c.benchmark_group("v8-persistent");
    group.measurement_time(Duration::from_secs(10));

    // Create temp DB file for V8 ops
    let tmp_dir = tempfile::tempdir().unwrap();
    let db_path = tmp_dir.path().join("bench.db");
    let db_path_str = db_path.to_string_lossy().to_string();
    {
        let conn = Connection::open(&db_path).unwrap();
        native_handler::seed_database(&conn, NUM_USERS, TASKS_PER_USER);
    }

    let tokio_rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();

    let mut v8_runtime = create_v8_runtime_with_sqlite();

    // Load handler code
    let handler_code = js_handler_code(&db_path_str);
    v8_runtime
        .execute_script("[handler]", deno_core::FastString::from(handler_code))
        .unwrap();

    // Initialize HMAC key and open DB
    tokio_rt.block_on(async {
        v8_runtime
            .execute_script(
                "[init]",
                deno_core::FastString::from(
                    "(async () => { await globalThis.__initHmac(SECRET_STR); globalThis.__openDb(DB_PATH); })()".to_string(),
                ),
            )
            .unwrap();
        v8_runtime
            .run_event_loop(deno_core::PollEventLoopOptions::default())
            .await
            .unwrap();
    });

    let token = create_jwt_token();
    let auth_header = format!("Bearer {}", token);

    // Persistent V8: call handler (no isolate creation)
    group.bench_function("list-20", |b| {
        b.iter(|| {
            let call_code = format!(
                r#"globalThis.__handleList("{}", 20, 0, "createdAt", "desc")"#,
                auth_header
            );
            v8_runtime
                .execute_script("<bench>", deno_core::FastString::from(call_code))
                .unwrap();

            tokio_rt.block_on(async {
                v8_runtime
                    .run_event_loop(deno_core::PollEventLoopOptions::default())
                    .await
                    .unwrap();
            });
        })
    });

    // Simple eval baseline (no DB, no JWT)
    group.bench_function("json-stringify-baseline", |b| {
        b.iter(|| {
            v8_runtime
                .execute_script(
                    "<bench>",
                    deno_core::FastString::from(
                        r#"JSON.stringify({ items: [], pagination: { limit: 20, offset: 0 } })"#
                            .to_string(),
                    ),
                )
                .unwrap();
        })
    });

    group.finish();
}

fn bench_comparison(c: &mut Criterion) {
    let mut group = c.benchmark_group("head-to-head");
    group.measurement_time(Duration::from_secs(15));

    // --- Rust native ---
    let conn = create_seeded_db();
    let config = native_handler::task_entity_config();
    let token = create_jwt_token();
    let auth_header = format!("Bearer {}", token);
    let params = default_list_params();

    group.bench_function("rust-native/list-20", |b| {
        b.iter(|| {
            native_handler::handle_list(&config, &conn, &auth_header, &params, JWT_SECRET).unwrap()
        })
    });

    // --- V8 persistent ---
    let tmp_dir = tempfile::tempdir().unwrap();
    let db_path = tmp_dir.path().join("bench.db");
    let db_path_str = db_path.to_string_lossy().to_string();
    {
        let conn = Connection::open(&db_path).unwrap();
        native_handler::seed_database(&conn, NUM_USERS, TASKS_PER_USER);
    }

    let tokio_rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();

    let mut v8_runtime = create_v8_runtime_with_sqlite();
    let handler_code = js_handler_code(&db_path_str);
    v8_runtime
        .execute_script("[handler]", deno_core::FastString::from(handler_code))
        .unwrap();

    tokio_rt.block_on(async {
        v8_runtime
            .execute_script(
                "[init]",
                deno_core::FastString::from(
                    "(async () => { await globalThis.__initHmac(SECRET_STR); globalThis.__openDb(DB_PATH); })()".to_string(),
                ),
            )
            .unwrap();
        v8_runtime
            .run_event_loop(deno_core::PollEventLoopOptions::default())
            .await
            .unwrap();
    });

    group.bench_function("v8-persistent/list-20", |b| {
        b.iter(|| {
            let call_code = format!(
                r#"globalThis.__handleList("{}", 20, 0, "createdAt", "desc")"#,
                auth_header
            );
            v8_runtime
                .execute_script("<bench>", deno_core::FastString::from(call_code))
                .unwrap();
            tokio_rt.block_on(async {
                v8_runtime
                    .run_event_loop(deno_core::PollEventLoopOptions::default())
                    .await
                    .unwrap();
            });
        })
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_rust_native,
    bench_v8_cold,
    bench_v8_persistent,
    bench_comparison,
);
criterion_main!(benches);
