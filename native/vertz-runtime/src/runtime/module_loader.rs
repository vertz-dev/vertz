use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use deno_core::error::AnyError;
use deno_core::ModuleLoadResponse;
use deno_core::ModuleLoader;
use deno_core::ModuleSource;
use deno_core::ModuleSourceCode;
use deno_core::ModuleSpecifier;
use deno_core::ModuleType;
use deno_core::RequestedModuleType;
use deno_core::ResolutionKind;

use crate::compiler::pipeline::post_process_compiled;
use crate::runtime::compile_cache::{CachedCompilation, CompileCache};
use vertz_compiler_core::CompileOptions;

/// Source maps collected during module loading.
pub type SourceMapStore = RefCell<HashMap<String, String>>;

/// Custom module loader for the Vertz runtime.
///
/// Handles:
/// - File system resolution for relative and absolute paths
/// - Node.js-style resolution for bare specifiers (node_modules)
/// - TypeScript/TSX compilation via vertz-compiler-core
/// - Source map collection for error reporting
/// - URL canonicalization to ensure same physical file = same module identity
/// - Compilation caching (disk-backed, content-hash-keyed)
pub struct VertzModuleLoader {
    root_dir: PathBuf,
    source_maps: SourceMapStore,
    canon_cache: RefCell<HashMap<PathBuf, PathBuf>>,
    compile_cache: CompileCache,
}

impl VertzModuleLoader {
    pub fn new(root_dir: &str) -> Self {
        Self {
            root_dir: PathBuf::from(root_dir),
            source_maps: RefCell::new(HashMap::new()),
            canon_cache: RefCell::new(HashMap::new()),
            compile_cache: CompileCache::new(Path::new(root_dir), false),
        }
    }

    /// Create a new module loader with compilation caching enabled.
    pub fn new_with_cache(root_dir: &str, cache_enabled: bool) -> Self {
        Self {
            root_dir: PathBuf::from(root_dir),
            source_maps: RefCell::new(HashMap::new()),
            canon_cache: RefCell::new(HashMap::new()),
            compile_cache: CompileCache::new(Path::new(root_dir), cache_enabled),
        }
    }

    /// Canonicalize a file path, using a cache to avoid repeated syscalls.
    /// Falls back to the original path if canonicalization fails (e.g., broken symlink).
    fn canonicalize_cached(&self, path: &Path) -> PathBuf {
        if let Some(cached) = self.canon_cache.borrow().get(path) {
            return cached.clone();
        }
        let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        self.canon_cache
            .borrow_mut()
            .insert(path.to_path_buf(), canonical.clone());
        canonical
    }

    /// Resolve a specifier to an absolute file path.
    fn resolve_specifier(
        &self,
        specifier: &str,
        referrer_path: &Path,
    ) -> Result<PathBuf, AnyError> {
        // Relative imports: ./foo, ../bar
        if specifier.starts_with("./") || specifier.starts_with("../") {
            let base_dir = referrer_path.parent().unwrap_or(&self.root_dir);
            let resolved = base_dir.join(specifier);
            return self.resolve_with_extensions(&resolved);
        }

        // Absolute imports
        if specifier.starts_with('/') {
            let resolved = PathBuf::from(specifier);
            return self.resolve_with_extensions(&resolved);
        }

        // Bare specifiers: try node_modules resolution starting from referrer
        let referrer_dir = referrer_path.parent().unwrap_or(&self.root_dir);
        self.resolve_node_module(specifier, referrer_dir)
    }

    /// Try to resolve a path by appending common extensions if needed.
    fn resolve_with_extensions(&self, path: &Path) -> Result<PathBuf, AnyError> {
        // Try exact path first
        if path.is_file() {
            return Ok(path.to_path_buf());
        }

        // Try appending extensions (e.g., foo.service -> foo.service.ts)
        let extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
        for ext in &extensions {
            let appended = PathBuf::from(format!("{}{}", path.display(), ext));
            if appended.is_file() {
                return Ok(appended);
            }
        }

        // Try replacing extension (e.g., foo -> foo.ts)
        for ext in &extensions {
            let with_ext = path.with_extension(ext.trim_start_matches('.'));
            if with_ext.is_file() {
                return Ok(with_ext);
            }
        }

        // Try as a directory with index files
        if path.is_dir() {
            let index_files = ["index.ts", "index.tsx", "index.js", "index.mjs"];
            for index in &index_files {
                let index_path = path.join(index);
                if index_path.is_file() {
                    return Ok(index_path);
                }
            }
        }

        Err(deno_core::anyhow::anyhow!(
            "Cannot resolve module: {}",
            path.display()
        ))
    }

    /// Resolve a bare specifier through node_modules.
    ///
    /// Searches from `start_dir` upward (Node.js-style resolution), then falls
    /// back to Bun's `.bun/node_modules/` cache directory.
    fn resolve_node_module(&self, specifier: &str, start_dir: &Path) -> Result<PathBuf, AnyError> {
        // Split package name from subpath
        let (package_name, subpath) = if specifier.starts_with('@') {
            // Scoped package: @scope/pkg or @scope/pkg/subpath
            let parts: Vec<&str> = specifier.splitn(3, '/').collect();
            if parts.len() >= 2 {
                let pkg = format!("{}/{}", parts[0], parts[1]);
                let sub = if parts.len() > 2 {
                    Some(parts[2..].join("/"))
                } else {
                    None
                };
                (pkg, sub)
            } else {
                return Err(deno_core::anyhow::anyhow!(
                    "Invalid scoped package specifier: {}",
                    specifier
                ));
            }
        } else {
            // Regular package: pkg or pkg/subpath
            let parts: Vec<&str> = specifier.splitn(2, '/').collect();
            (parts[0].to_string(), parts.get(1).map(|s| s.to_string()))
        };

        // Walk up from referrer's directory looking for node_modules (Node.js-style)
        let mut search_dir = start_dir.to_path_buf();
        loop {
            let nm_dir = search_dir.join("node_modules").join(&package_name);
            if nm_dir.is_symlink() {
                // Follow symlinks (Bun creates symlinks in workspace packages)
                let canonical = nm_dir.canonicalize().unwrap_or(nm_dir);
                return self.resolve_package_entry(&canonical, subpath.as_deref());
            }
            if nm_dir.is_dir() {
                return self.resolve_package_entry(&nm_dir, subpath.as_deref());
            }

            if !search_dir.pop() {
                break;
            }
        }

        // Fallback: check Bun's internal cache directory (node_modules/.bun/node_modules/)
        let mut search_dir = self.root_dir.clone();
        loop {
            let bun_cache = search_dir
                .join("node_modules")
                .join(".bun")
                .join("node_modules")
                .join(&package_name);
            if bun_cache.is_dir() {
                return self.resolve_package_entry(&bun_cache, subpath.as_deref());
            }

            if !search_dir.pop() {
                break;
            }
        }

        Err(deno_core::anyhow::anyhow!(
            "Cannot find module '{}' in node_modules (searched from {})",
            specifier,
            start_dir.display()
        ))
    }

    /// Resolve the entry point of a package in node_modules.
    fn resolve_package_entry(
        &self,
        package_dir: &Path,
        subpath: Option<&str>,
    ) -> Result<PathBuf, AnyError> {
        let pkg_json_path = package_dir.join("package.json");

        if pkg_json_path.is_file() {
            let pkg_json: serde_json::Value =
                serde_json::from_str(&std::fs::read_to_string(&pkg_json_path)?)?;

            // If subpath is provided, check "exports" field
            if let Some(sub) = subpath {
                // Check exports map
                if let Some(exports) = pkg_json.get("exports") {
                    let export_key = format!("./{}", sub);
                    if let Some(entry) = resolve_exports_entry(exports, &export_key) {
                        let resolved = package_dir.join(entry);
                        if resolved.is_file() {
                            return Ok(resolved);
                        }
                    }
                }

                // Fallback: direct path resolution
                let direct = package_dir.join(sub);
                return self.resolve_with_extensions(&direct);
            }

            // No subpath — resolve main entry

            // Check exports "." entry
            if let Some(exports) = pkg_json.get("exports") {
                if let Some(entry) = resolve_exports_entry(exports, ".") {
                    let resolved = package_dir.join(entry);
                    if resolved.is_file() {
                        return Ok(resolved);
                    }
                }
            }

            // Check "module" field (ESM preference)
            if let Some(module) = pkg_json.get("module").and_then(|v| v.as_str()) {
                let resolved = package_dir.join(module);
                if resolved.is_file() {
                    return Ok(resolved);
                }
            }

            // Check "main" field
            if let Some(main) = pkg_json.get("main").and_then(|v| v.as_str()) {
                let resolved = package_dir.join(main);
                return self.resolve_with_extensions(&resolved);
            }
        }

        // Fallback: index.js
        let index = package_dir.join("index.js");
        if index.is_file() {
            return Ok(index);
        }

        Err(deno_core::anyhow::anyhow!(
            "Cannot resolve entry point for package at {}",
            package_dir.display()
        ))
    }

    /// Prepend a CSS injection call to compiled JS code.
    ///
    /// If CSS was extracted by the compiler, this wraps it in a
    /// `__vertz_inject_css()` call so the SSR renderer can collect styles.
    fn prepend_css_injection(code: String, css: Option<&str>, filename: &str) -> String {
        match css {
            Some(css) => {
                let escaped = css
                    .replace('\\', "\\\\")
                    .replace('`', "\\`")
                    .replace("${", "\\${");
                format!(
                    "if (typeof __vertz_inject_css === 'function') {{ __vertz_inject_css(`{}`, '{}'); }}\n{}",
                    escaped,
                    filename.replace('\\', "/"),
                    code
                )
            }
            None => code,
        }
    }

    /// Compile TypeScript/TSX source code using vertz-compiler-core.
    ///
    /// Checks the disk-backed compilation cache first. On cache hit, skips
    /// the compiler entirely and returns the cached result. On cache miss,
    /// compiles, post-processes, caches the result, and returns.
    fn compile_source(&self, source: &str, filename: &str) -> Result<String, AnyError> {
        let target = "ssr";

        // Check compilation cache first
        if let Some(cached) = self.compile_cache.get(source, target) {
            // Restore source map from cache
            if let Some(ref map) = cached.source_map {
                self.source_maps
                    .borrow_mut()
                    .insert(filename.to_string(), map.clone());
            }
            return Ok(Self::prepend_css_injection(
                cached.code,
                cached.css.as_deref(),
                filename,
            ));
        }

        let result = vertz_compiler_core::compile(
            source,
            CompileOptions {
                filename: Some(filename.to_string()),
                target: Some(target.to_string()),
                ..Default::default()
            },
        );

        // Check for compilation errors
        if let Some(ref diagnostics) = result.diagnostics {
            let errors: Vec<String> = diagnostics
                .iter()
                .map(|d| {
                    let location = match (d.line, d.column) {
                        (Some(line), Some(col)) => format!(" at {}:{}:{}", filename, line, col),
                        _ => String::new(),
                    };
                    format!("{}{}", d.message, location)
                })
                .collect();

            if !errors.is_empty() {
                // Diagnostics are warnings, not hard errors — log but don't fail
                // (the vertz compiler may emit diagnostics that are informational)
            }
        }

        // Store source map if available
        if let Some(ref map) = result.map {
            self.source_maps
                .borrow_mut()
                .insert(filename.to_string(), map.clone());
        }

        // Apply the same post-processing as the browser pipeline:
        // fix API names, split internal imports, strip leftover TS, deduplicate imports
        let code = post_process_compiled(&result.code);

        // Cache the compilation result (code + source map + CSS, before CSS injection)
        self.compile_cache.put(
            source,
            target,
            &CachedCompilation {
                code: code.clone(),
                source_map: result.map.clone(),
                css: result.css.clone(),
            },
        );

        Ok(Self::prepend_css_injection(
            code,
            result.css.as_deref(),
            filename,
        ))
    }
}

/// Resolve an exports entry from a package.json "exports" field.
/// Supports:
/// - String value: `"exports": "./dist/index.js"`
/// - Object with conditions: `"exports": { "import": "./dist/index.mjs", "default": "./dist/index.js" }`
/// - Object with subpath patterns: `"exports": { ".": { "import": "./dist/index.mjs" } }`
fn resolve_exports_entry(exports: &serde_json::Value, key: &str) -> Option<String> {
    match exports {
        // Direct string value (applies to "." entry)
        serde_json::Value::String(s) if key == "." => Some(s.clone()),

        // Object with conditions or subpath patterns
        serde_json::Value::Object(map) => {
            // Check if this is a subpath map or a conditions map
            if let Some(entry) = map.get(key) {
                return resolve_condition_value(entry);
            }

            // If key is "." and this looks like a conditions map
            // (has "import", "require", "default" keys)
            if key == "." {
                return resolve_condition_value(exports);
            }

            None
        }

        _ => None,
    }
}

/// Resolve a condition value to a string path.
fn resolve_condition_value(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Object(map) => {
            // Priority: import > module > default > require
            for key in &["import", "module", "default", "require"] {
                if let Some(entry) = map.get(*key) {
                    return resolve_condition_value(entry);
                }
            }
            None
        }
        _ => None,
    }
}

/// Synthetic module source for `@vertz/test` and `bun:test` imports.
/// Re-exports all test harness globals that were injected by the test runner.
const VERTZ_TEST_MODULE: &str = r#"
const { describe, it, test, expect, beforeEach, afterEach, beforeAll, afterAll, mock, spyOn, vi, expectTypeOf } = globalThis.__vertz_test_exports;
export { describe, it, test, expect, beforeEach, afterEach, beforeAll, afterAll, mock, spyOn, vi, expectTypeOf };
export default { describe, it, test, expect, beforeEach, afterEach, beforeAll, afterAll, mock, spyOn, vi, expectTypeOf };
"#;

/// URL used for the synthetic test module.
const VERTZ_TEST_SPECIFIER: &str = "vertz:test";

/// Synthetic module for `vertz:sqlite` (canonical) and `bun:sqlite` (compat alias).
const VERTZ_SQLITE_SPECIFIER: &str = "vertz:sqlite";
const VERTZ_SQLITE_MODULE: &str = r#"
const _registry = new FinalizationRegistry((id) => {
  try { Deno.core.ops.op_sqlite_close(id); } catch {}
});

class Statement {
  #dbId;
  #sql;
  constructor(dbId, sql) {
    this.#dbId = dbId;
    this.#sql = sql;
  }
  all(...params) {
    return Deno.core.ops.op_sqlite_query_all(this.#dbId, this.#sql, params);
  }
  get(...params) {
    return Deno.core.ops.op_sqlite_query_get(this.#dbId, this.#sql, params);
  }
  run(...params) {
    return Deno.core.ops.op_sqlite_query_run(this.#dbId, this.#sql, params);
  }
}

class Database {
  #id;
  #closed = false;
  constructor(path) {
    if (typeof path !== 'string') throw new TypeError('Database path must be a string');
    this.#id = Deno.core.ops.op_sqlite_open(path);
    _registry.register(this, this.#id, this);
  }
  #assertOpen() {
    if (this.#closed) throw new TypeError('database is closed');
  }
  prepare(sql) {
    this.#assertOpen();
    return new Statement(this.#id, sql);
  }
  exec(sql) {
    this.#assertOpen();
    Deno.core.ops.op_sqlite_exec(this.#id, sql);
  }
  run(sql, ...params) {
    this.#assertOpen();
    return Deno.core.ops.op_sqlite_query_run(this.#id, sql, params);
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    _registry.unregister(this);
    Deno.core.ops.op_sqlite_close(this.#id);
  }
}

export { Database, Statement };
export default Database;
"#;

/// Synthetic module for `node:path`.
const NODE_PATH_SPECIFIER: &str = "vertz:node_path";
const NODE_PATH_MODULE: &str = r#"
const p = globalThis.__vertz_path;
export const join = p.join;
export const resolve = p.resolve;
export const dirname = p.dirname;
export const basename = p.basename;
export const extname = p.extname;
export const relative = p.relative;
export const normalize = p.normalize;
export const isAbsolute = p.isAbsolute;
export const parse = p.parse;
export const format = p.format;
export const sep = p.sep;
export const delimiter = p.delimiter;
export const posix = p.posix;
export default p;
"#;

/// Synthetic module for `node:os`.
const NODE_OS_SPECIFIER: &str = "vertz:node_os";
const NODE_OS_MODULE: &str = r#"
const os = globalThis.__vertz_os;
export const tmpdir = os.tmpdir;
export const homedir = os.homedir;
export const platform = os.platform;
export const hostname = os.hostname;
export const EOL = os.EOL;
export const type_ = os.type;
export { type_ as type };
export const arch = os.arch;
export const cpus = os.cpus;
export const totalmem = os.totalmem;
export const freemem = os.freemem;
export const release = os.release;
export const networkInterfaces = os.networkInterfaces;
export const userInfo = os.userInfo;
export const endianness = os.endianness;
export default os;
"#;

/// Synthetic module for `node:url`.
const NODE_URL_SPECIFIER: &str = "vertz:node_url";
const NODE_URL_MODULE: &str = r#"
function fileURLToPath(url) {
  if (typeof url === 'string') {
    return Deno.core.ops.op_file_url_to_path(url);
  }
  if (url && typeof url === 'object' && typeof url.href === 'string') {
    return Deno.core.ops.op_file_url_to_path(url.href);
  }
  throw new TypeError('The "url" argument must be of type string or URL');
}

function pathToFileURL(path) {
  return new URL(Deno.core.ops.op_path_to_file_url(String(path)));
}

export { fileURLToPath, pathToFileURL };
export { URL, URLSearchParams } from 'vertz:node_url_globals';
export default { fileURLToPath, pathToFileURL, URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams };
"#;

/// Helper synthetic module that re-exports URL globals for node:url.
const NODE_URL_GLOBALS_SPECIFIER: &str = "vertz:node_url_globals";
const NODE_URL_GLOBALS_MODULE: &str = r#"
export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;
"#;

/// Synthetic module for `node:events`.
const NODE_EVENTS_SPECIFIER: &str = "vertz:node_events";
const NODE_EVENTS_MODULE: &str = r#"
// Snapshot helper: captures async context at registration time if available.
const _Snapshot = typeof globalThis.AsyncContext?.Snapshot === 'function'
  ? globalThis.AsyncContext.Snapshot
  : null;

function _snap() {
  return _Snapshot ? new _Snapshot() : null;
}

// Listeners are stored as { fn, snapshot } entries.
// - fn: the listener function (or once-wrapper with _original)
// - snapshot: AsyncContext.Snapshot captured at on() time, or null

class EventEmitter {
  #listeners = new Map();
  #maxListeners = 10;

  on(event, listener) {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, []);
    }
    this.#listeners.get(event).push({ fn: listener, snapshot: _snap() });
    return this;
  }

  addListener(event, listener) {
    return this.on(event, listener);
  }

  once(event, listener) {
    const wrapped = (...args) => {
      this.removeListener(event, wrapped);
      listener.apply(this, args);
    };
    wrapped._original = listener;
    return this.on(event, wrapped);
  }

  off(event, listener) {
    return this.removeListener(event, listener);
  }

  removeListener(event, listener) {
    const arr = this.#listeners.get(event);
    if (!arr) return this;
    const idx = arr.findIndex(entry => entry.fn === listener || entry.fn._original === listener);
    if (idx !== -1) arr.splice(idx, 1);
    if (arr.length === 0) this.#listeners.delete(event);
    return this;
  }

  removeAllListeners(event) {
    if (event !== undefined) {
      this.#listeners.delete(event);
    } else {
      this.#listeners.clear();
    }
    return this;
  }

  emit(event, ...args) {
    const arr = this.#listeners.get(event);
    if (!arr || arr.length === 0) return false;
    for (const entry of [...arr]) {
      if (entry.snapshot) {
        entry.snapshot.run(() => entry.fn.apply(this, args));
      } else {
        entry.fn.apply(this, args);
      }
    }
    return true;
  }

  listenerCount(event) {
    const arr = this.#listeners.get(event);
    return arr ? arr.length : 0;
  }

  listeners(event) {
    const arr = this.#listeners.get(event);
    if (!arr) return [];
    return arr.map(entry => entry.fn._original || entry.fn);
  }

  rawListeners(event) {
    const arr = this.#listeners.get(event);
    return arr ? arr.map(entry => entry.fn) : [];
  }

  eventNames() {
    return [...this.#listeners.keys()];
  }

  prependListener(event, listener) {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, []);
    }
    this.#listeners.get(event).unshift({ fn: listener, snapshot: _snap() });
    return this;
  }

  setMaxListeners(n) {
    this.#maxListeners = n;
    return this;
  }

  getMaxListeners() {
    return this.#maxListeners;
  }
}

export { EventEmitter };
export default EventEmitter;
"#;

/// Synthetic module for `node:process` (minimal shim).
const NODE_PROCESS_SPECIFIER: &str = "vertz:node_process";
const NODE_PROCESS_MODULE: &str = r#"
// Ensure process global exists with required properties
const proc = globalThis.process || {};
if (!proc.env) proc.env = {};
if (!proc.cwd) proc.cwd = () => '/';
if (!proc.argv) proc.argv = [];
if (!proc.platform) proc.platform = Deno.core.ops.op_os_platform();
if (!proc.version) proc.version = 'v20.0.0';
if (!proc.versions) proc.versions = {};
if (!proc.exit) proc.exit = (code) => { throw new Error('process.exit(' + (code !== undefined ? code : '') + ') is not supported in the Vertz runtime'); };
if (!proc.nextTick) proc.nextTick = (fn, ...args) => queueMicrotask(() => fn(...args));
if (!proc.stdout) proc.stdout = { write: (s) => { console.log(s); } };
if (!proc.stderr) proc.stderr = { write: (s) => { console.error(s); } };
globalThis.process = proc;

export default proc;
export const env = proc.env;
export const cwd = proc.cwd;
export const argv = proc.argv;
export const platform = proc.platform;
export const version = proc.version;
export const versions = proc.versions;
export const nextTick = proc.nextTick;
export const stdout = proc.stdout;
export const stderr = proc.stderr;
"#;

/// Synthetic module for `node:fs`.
const NODE_FS_SPECIFIER: &str = "vertz:node_fs";
const NODE_FS_MODULE: &str = r#"
const fs = globalThis.__vertz_fs;
export const readFileSync = fs.readFileSync;
export const writeFileSync = fs.writeFileSync;
export const appendFileSync = fs.appendFileSync;
export const existsSync = fs.existsSync;
export const mkdirSync = fs.mkdirSync;
export const readdirSync = fs.readdirSync;
export const statSync = fs.statSync;
export const lstatSync = fs.lstatSync;
export const rmSync = fs.rmSync;
export const unlinkSync = fs.unlinkSync;
export const renameSync = fs.renameSync;
export const realpathSync = fs.realpathSync;
export const mkdtempSync = fs.mkdtempSync;
export const copyFileSync = fs.copyFileSync;
export const chmodSync = fs.chmodSync;
export const readFile = fs.readFile;
export const writeFile = fs.writeFile;
export const mkdir = fs.mkdir;
export const readdir = fs.readdir;
export const stat = fs.stat;
export const rm = fs.rm;
export const unlink = fs.unlink;
export const rename = fs.rename;
export const realpath = fs.realpath;
export const promises = fs.promises;
export default fs;
"#;

/// Synthetic module for `node:fs/promises`.
const NODE_FS_PROMISES_SPECIFIER: &str = "vertz:node_fs_promises";
const NODE_FS_PROMISES_MODULE: &str = r#"
const p = globalThis.__vertz_fs.promises;
export const readFile = p.readFile;
export const writeFile = p.writeFile;
export const mkdir = p.mkdir;
export const readdir = p.readdir;
export const stat = p.stat;
export const rm = p.rm;
export const unlink = p.unlink;
export const rename = p.rename;
export const realpath = p.realpath;
export default p;
"#;

/// Synthetic module for `node:crypto`.
const NODE_CRYPTO_SPECIFIER: &str = "vertz:node_crypto";
const NODE_CRYPTO_MODULE: &str = r#"
class Hash {
  #algorithm;
  #data;

  constructor(algorithm) {
    this.#algorithm = algorithm;
    this.#data = new Uint8Array(0);
  }

  update(data, encoding) {
    let bytes;
    if (typeof data === 'string') {
      bytes = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array) {
      bytes = data;
    } else if (ArrayBuffer.isView(data)) {
      bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else {
      bytes = new Uint8Array(data);
    }
    // Concatenate
    const merged = new Uint8Array(this.#data.length + bytes.length);
    merged.set(this.#data);
    merged.set(bytes, this.#data.length);
    this.#data = merged;
    return this;
  }

  digest(encoding) {
    const result = Deno.core.ops.op_crypto_hash_digest(this.#algorithm, this.#data);
    const buf = Buffer.from(result);
    if (encoding === 'hex') return buf.toString('hex');
    if (encoding === 'base64') return buf.toString('base64');
    return buf;
  }
}

function createHash(algorithm) {
  return new Hash(algorithm);
}

function createHmac(algorithm, key) {
  // Minimal HMAC using Web Crypto pattern (synchronous via Rust op)
  let keyBytes;
  if (typeof key === 'string') {
    keyBytes = new TextEncoder().encode(key);
  } else if (key instanceof Uint8Array) {
    keyBytes = key;
  } else {
    keyBytes = new Uint8Array(key);
  }

  let data = new Uint8Array(0);

  return {
    update(input) {
      const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
      const merged = new Uint8Array(data.length + bytes.length);
      merged.set(data);
      merged.set(bytes, data.length);
      data = merged;
      return this;
    },
    digest(encoding) {
      // HMAC: hash(key XOR opad || hash(key XOR ipad || message))
      // For simplicity, delegate to the subtle API synchronously via hash
      // This is a minimal shim — full HMAC available via crypto.subtle
      const algoMap = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512', sha1: 'SHA-1' };
      const normalizedAlgo = algoMap[algorithm.toLowerCase()] || algorithm;
      const blockSize = (normalizedAlgo.includes('512') || normalizedAlgo.includes('384')) ? 128 : 64;

      let k = keyBytes;
      if (k.length > blockSize) {
        k = new Uint8Array(Deno.core.ops.op_crypto_hash_digest(normalizedAlgo, k));
      }
      if (k.length < blockSize) {
        const padded = new Uint8Array(blockSize);
        padded.set(k);
        k = padded;
      }

      const ipad = new Uint8Array(blockSize);
      const opad = new Uint8Array(blockSize);
      for (let i = 0; i < blockSize; i++) {
        ipad[i] = k[i] ^ 0x36;
        opad[i] = k[i] ^ 0x5c;
      }

      const inner = new Uint8Array(ipad.length + data.length);
      inner.set(ipad);
      inner.set(data, ipad.length);
      const innerHash = new Uint8Array(Deno.core.ops.op_crypto_hash_digest(normalizedAlgo, inner));

      const outer = new Uint8Array(opad.length + innerHash.length);
      outer.set(opad);
      outer.set(innerHash, opad.length);
      const result = Deno.core.ops.op_crypto_hash_digest(normalizedAlgo, outer);

      const buf = Buffer.from(result);
      if (encoding === 'hex') return buf.toString('hex');
      if (encoding === 'base64') return buf.toString('base64');
      return buf;
    },
  };
}

function timingSafeEqual(a, b) {
  const aBuf = a instanceof Uint8Array ? a : new Uint8Array(a);
  const bBuf = b instanceof Uint8Array ? b : new Uint8Array(b);
  return Deno.core.ops.op_crypto_timing_safe_equal(aBuf, bBuf);
}

function randomBytes(size) {
  return Buffer.from(Deno.core.ops.op_crypto_random_bytes(size));
}

function randomUUID() {
  return Deno.core.ops.op_crypto_random_uuid();
}

// webcrypto: expose the Web Crypto API (available in V8 via globalThis.crypto)
const webcrypto = globalThis.crypto;

// KeyObject stub for RSA key operations (the runtime uses Rust-native JWT ops)
class KeyObject {
  constructor(type, data) {
    this._type = type;
    this._data = data;
  }
  get type() { return this._type; }
  export(options) {
    if (options && options.type === 'pkcs1' && options.format === 'pem') {
      return this._data;
    }
    if (options && options.type === 'spki' && options.format === 'pem') {
      return this._data;
    }
    return this._data;
  }
}

function createPrivateKey(input) {
  const key = typeof input === 'string' ? input : (input.key || input);
  return new KeyObject('private', key);
}

function createPublicKey(input) {
  const key = typeof input === 'string' ? input : (input.key || input);
  return new KeyObject('public', key);
}

function generateKeyPairSync(type, options) {
  // Delegate to Rust op if available
  if (typeof Deno !== 'undefined' && Deno.core && Deno.core.ops.op_crypto_generate_keypair) {
    const result = Deno.core.ops.op_crypto_generate_keypair(
      type,
      options.modulusLength || 2048
    );
    return {
      publicKey: createPublicKey(result.publicKey),
      privateKey: createPrivateKey(result.privateKey),
    };
  }
  throw new Error('generateKeyPairSync is not supported in the Vertz runtime without the crypto op');
}

export { createHash, createHmac, timingSafeEqual, randomBytes, randomUUID, Hash, webcrypto, KeyObject, createPrivateKey, createPublicKey, generateKeyPairSync };
export default { createHash, createHmac, timingSafeEqual, randomBytes, randomUUID, webcrypto, KeyObject, createPrivateKey, createPublicKey, generateKeyPairSync };
"#;

/// Synthetic module for `node:buffer` / `buffer`.
const NODE_BUFFER_SPECIFIER: &str = "vertz:node_buffer";
const NODE_BUFFER_MODULE: &str = r#"
export const Buffer = globalThis.Buffer;
export default { Buffer: globalThis.Buffer };
"#;

/// Synthetic module for `node:module`.
/// Provides createRequire for CJS interop (used by bunup-generated shims).
const NODE_MODULE_SPECIFIER: &str = "vertz:node_module";
const NODE_MODULE_MODULE: &str = r#"
// createRequire shim: resolves bare specifiers via dynamic import
// This is used by bunup's CJS interop: `var __require = createRequire(import.meta.url)`
export function createRequire(_url) {
  return function require(specifier) {
    throw new Error(
      `createRequire().require("${specifier}") is not supported in the Vertz runtime. ` +
      `Use ESM imports instead.`
    );
  };
}
export default { createRequire };
"#;

/// Synthetic module for `node:async_hooks`.
/// Delegates to the AsyncContext polyfill installed by load_async_context().
const NODE_ASYNC_HOOKS_SPECIFIER: &str = "vertz:node_async_hooks";
const NODE_ASYNC_HOOKS_MODULE: &str = r#"
const { AsyncLocalStorage, AsyncResource } = globalThis.__vertz_async_hooks || {};
export { AsyncLocalStorage, AsyncResource };
export default { AsyncLocalStorage, AsyncResource };
"#;

/// Map a `node:*` specifier to a synthetic module specifier.
fn node_specifier_to_synthetic(specifier: &str) -> Option<&'static str> {
    match specifier {
        "node:path" | "path" => Some(NODE_PATH_SPECIFIER),
        "node:os" | "os" => Some(NODE_OS_SPECIFIER),
        "node:url" | "url" => Some(NODE_URL_SPECIFIER),
        "node:events" | "events" => Some(NODE_EVENTS_SPECIFIER),
        "node:process" | "process" => Some(NODE_PROCESS_SPECIFIER),
        "node:fs" | "fs" => Some(NODE_FS_SPECIFIER),
        "node:fs/promises" => Some(NODE_FS_PROMISES_SPECIFIER),
        "node:crypto" | "crypto" => Some(NODE_CRYPTO_SPECIFIER),
        "node:buffer" | "buffer" => Some(NODE_BUFFER_SPECIFIER),
        "node:module" | "module" => Some(NODE_MODULE_SPECIFIER),
        "node:async_hooks" | "async_hooks" => Some(NODE_ASYNC_HOOKS_SPECIFIER),
        _ => None,
    }
}

/// Map a synthetic module specifier to its source code.
fn synthetic_module_source(specifier: &str) -> Option<&'static str> {
    match specifier {
        VERTZ_TEST_SPECIFIER => Some(VERTZ_TEST_MODULE),
        NODE_PATH_SPECIFIER => Some(NODE_PATH_MODULE),
        NODE_OS_SPECIFIER => Some(NODE_OS_MODULE),
        NODE_URL_SPECIFIER => Some(NODE_URL_MODULE),
        NODE_URL_GLOBALS_SPECIFIER => Some(NODE_URL_GLOBALS_MODULE),
        NODE_EVENTS_SPECIFIER => Some(NODE_EVENTS_MODULE),
        NODE_PROCESS_SPECIFIER => Some(NODE_PROCESS_MODULE),
        NODE_FS_SPECIFIER => Some(NODE_FS_MODULE),
        NODE_FS_PROMISES_SPECIFIER => Some(NODE_FS_PROMISES_MODULE),
        NODE_CRYPTO_SPECIFIER => Some(NODE_CRYPTO_MODULE),
        NODE_BUFFER_SPECIFIER => Some(NODE_BUFFER_MODULE),
        NODE_MODULE_SPECIFIER => Some(NODE_MODULE_MODULE),
        NODE_ASYNC_HOOKS_SPECIFIER => Some(NODE_ASYNC_HOOKS_MODULE),
        VERTZ_SQLITE_SPECIFIER => Some(VERTZ_SQLITE_MODULE),
        _ => None,
    }
}

impl ModuleLoader for VertzModuleLoader {
    fn resolve(
        &self,
        specifier: &str,
        referrer: &str,
        _kind: ResolutionKind,
    ) -> Result<ModuleSpecifier, deno_core::anyhow::Error> {
        // Intercept @vertz/test and bun:test → synthetic vertz:test module
        if specifier == "@vertz/test" || specifier == "bun:test" {
            return Ok(ModuleSpecifier::parse(VERTZ_TEST_SPECIFIER)?);
        }

        // Intercept vertz:sqlite (canonical) and bun:sqlite (compat) → synthetic SQLite module
        if specifier == "vertz:sqlite" || specifier == "bun:sqlite" {
            return Ok(ModuleSpecifier::parse(VERTZ_SQLITE_SPECIFIER)?);
        }

        // Intercept node:* specifiers → synthetic modules
        if let Some(synthetic) = node_specifier_to_synthetic(specifier) {
            return Ok(ModuleSpecifier::parse(synthetic)?);
        }

        // Internal synthetic module references
        if specifier == NODE_URL_GLOBALS_SPECIFIER {
            return Ok(ModuleSpecifier::parse(NODE_URL_GLOBALS_SPECIFIER)?);
        }

        // If specifier is already a file:// URL, canonicalize and return
        if specifier.starts_with("file://") {
            let parsed = ModuleSpecifier::parse(specifier)?;
            if let Ok(file_path) = parsed.to_file_path() {
                let canonical = self.canonicalize_cached(&file_path);
                return ModuleSpecifier::from_file_path(&canonical).map_err(|_| {
                    deno_core::anyhow::anyhow!(
                        "Cannot convert path to URL: {}",
                        canonical.display()
                    )
                });
            }
            return Ok(parsed);
        }

        // Get the referrer's file path
        let referrer_path = if referrer.starts_with("file://") {
            ModuleSpecifier::parse(referrer)?
                .to_file_path()
                .map_err(|_| {
                    deno_core::anyhow::anyhow!(
                        "Cannot convert referrer URL to file path: {}",
                        referrer
                    )
                })?
        } else if referrer.contains("://") {
            // Non-file URL referrer (e.g., ext:, internal:)
            // Resolve relative to root_dir
            self.root_dir.clone()
        } else {
            PathBuf::from(referrer)
        };

        let resolved_path = self.resolve_specifier(specifier, &referrer_path)?;

        // Canonicalize to ensure same physical file = same module URL.
        // This prevents instanceof failures across ES module boundaries when the
        // same file is reached via different paths (symlinks, .. components, etc.).
        let canonical_path = self.canonicalize_cached(&resolved_path);

        let url = ModuleSpecifier::from_file_path(&canonical_path).map_err(|_| {
            deno_core::anyhow::anyhow!("Cannot convert path to URL: {}", canonical_path.display())
        })?;

        Ok(url)
    }

    fn load(
        &self,
        module_specifier: &ModuleSpecifier,
        _maybe_referrer: Option<&ModuleSpecifier>,
        _is_dyn_import: bool,
        _requested_module_type: RequestedModuleType,
    ) -> ModuleLoadResponse {
        let specifier = module_specifier.clone();

        let load_result = (|| -> Result<ModuleSource, AnyError> {
            // Return synthetic modules (vertz:test, vertz:node_path, etc.)
            if let Some(source) = synthetic_module_source(specifier.as_str()) {
                return Ok(ModuleSource::new(
                    ModuleType::JavaScript,
                    ModuleSourceCode::String(source.to_string().into()),
                    &specifier,
                    None,
                ));
            }

            let path = specifier.to_file_path().map_err(|_| {
                deno_core::anyhow::anyhow!("Only file:// URLs are supported, got: {}", specifier)
            })?;

            let source = std::fs::read_to_string(&path).map_err(|e| {
                deno_core::anyhow::anyhow!("Cannot read module '{}': {}", path.display(), e)
            })?;

            let filename = path.to_string_lossy().to_string();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

            // Determine if we need to compile
            let (code, module_type) = match ext {
                "ts" | "tsx" | "jsx" => {
                    let compiled = self.compile_source(&source, &filename)?;
                    (compiled, ModuleType::JavaScript)
                }
                "json" => (source, ModuleType::Json),
                _ => (source, ModuleType::JavaScript),
            };

            Ok(ModuleSource::new(
                module_type,
                ModuleSourceCode::String(code.into()),
                &specifier,
                None,
            ))
        })();

        ModuleLoadResponse::Sync(load_result)
    }

    fn get_source_map(&self, specifier: &str) -> Option<Vec<u8>> {
        self.source_maps
            .borrow()
            .get(specifier)
            .map(|s| s.as_bytes().to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn create_temp_dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    /// Canonicalize a path for test assertions.
    /// On macOS, tempdir paths are under /tmp which is a symlink to /private/tmp.
    fn canon(path: &Path) -> PathBuf {
        path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
    }

    #[test]
    fn test_resolve_relative_js() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        let util_file = tmp.path().join("utils.js");
        std::fs::write(&main_file, "import './utils.js';").unwrap();
        std::fs::write(&util_file, "export const x = 1;").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("./utils.js", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.to_file_path().unwrap(), canon(&util_file));
    }

    #[test]
    fn test_resolve_with_extension_inference() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        let util_file = tmp.path().join("utils.ts");
        std::fs::write(&main_file, "").unwrap();
        std::fs::write(&util_file, "export const x = 1;").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("./utils", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.to_file_path().unwrap(), canon(&util_file));
    }

    #[test]
    fn test_resolve_index_file_in_directory() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        let subdir = tmp.path().join("lib");
        std::fs::create_dir(&subdir).unwrap();
        let index_file = subdir.join("index.ts");
        std::fs::write(&main_file, "").unwrap();
        std::fs::write(&index_file, "export const x = 1;").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("./lib", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.to_file_path().unwrap(), canon(&index_file));
    }

    #[test]
    fn test_resolve_missing_module_error() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("./nonexistent", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Cannot resolve module"), "Error: {}", err);
    }

    #[test]
    fn test_resolve_node_module_with_package_json() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        // Create a fake node_modules package
        let pkg_dir = tmp.path().join("node_modules").join("my-pkg");
        std::fs::create_dir_all(&pkg_dir).unwrap();
        let pkg_json = pkg_dir.join("package.json");
        let entry = pkg_dir.join("dist").join("index.mjs");
        std::fs::create_dir_all(pkg_dir.join("dist")).unwrap();
        std::fs::write(
            &pkg_json,
            r#"{ "exports": { ".": { "import": "./dist/index.mjs" } } }"#,
        )
        .unwrap();
        std::fs::write(&entry, "export default {};").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("my-pkg", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.to_file_path().unwrap(), canon(&entry));
    }

    #[test]
    fn test_resolve_node_module_missing() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("nonexistent-pkg", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Cannot find module"), "Error: {}", err);
    }

    #[test]
    fn test_load_js_module() {
        let tmp = create_temp_dir();
        let js_file = tmp.path().join("test.js");
        std::fs::write(&js_file, "export const x = 42;").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let specifier = ModuleSpecifier::from_file_path(&js_file).unwrap();
        let response = loader.load(&specifier, None, false, RequestedModuleType::None);

        match response {
            ModuleLoadResponse::Sync(Ok(source)) => match &source.code {
                deno_core::ModuleSourceCode::String(code) => {
                    assert!(code.as_str().contains("export const x = 42"));
                }
                _ => panic!("Expected string source code"),
            },
            ModuleLoadResponse::Sync(Err(e)) => {
                panic!("Module load failed: {}", e);
            }
            _ => panic!("Expected synchronous module load"),
        }
    }

    #[test]
    fn test_load_ts_module_compiles() {
        let tmp = create_temp_dir();
        let ts_file = tmp.path().join("test.ts");
        std::fs::write(&ts_file, "const x: number = 42; export { x };").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let specifier = ModuleSpecifier::from_file_path(&ts_file).unwrap();
        let response = loader.load(&specifier, None, false, RequestedModuleType::None);

        match response {
            ModuleLoadResponse::Sync(Ok(source)) => {
                match &source.code {
                    deno_core::ModuleSourceCode::String(code) => {
                        let code_str = code.as_str();
                        // Should be compiled (type annotations stripped)
                        assert!(code_str.contains("compiled by vertz-native"));
                        // Type annotations should be removed
                        assert!(
                            !code_str.contains(": number"),
                            "Type annotation should be stripped"
                        );
                    }
                    _ => panic!("Expected string source code"),
                }
            }
            ModuleLoadResponse::Sync(Err(e)) => {
                panic!("Module load failed: {}", e);
            }
            _ => panic!("Expected synchronous module load"),
        }
    }

    #[test]
    fn test_load_tsx_module_compiles() {
        let tmp = create_temp_dir();
        let tsx_file = tmp.path().join("test.tsx");
        std::fs::write(
            &tsx_file,
            r#"
export function Hello() {
  return <div>Hello</div>;
}
"#,
        )
        .unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let specifier = ModuleSpecifier::from_file_path(&tsx_file).unwrap();
        let response = loader.load(&specifier, None, false, RequestedModuleType::None);

        match response {
            ModuleLoadResponse::Sync(Ok(source)) => match &source.code {
                deno_core::ModuleSourceCode::String(code) => {
                    let code_str = code.as_str();
                    assert!(code_str.contains("compiled by vertz-native"));
                }
                _ => panic!("Expected string source code"),
            },
            ModuleLoadResponse::Sync(Err(e)) => {
                panic!("Module load failed: {}", e);
            }
            _ => panic!("Expected synchronous module load"),
        }
    }

    #[test]
    fn test_resolve_exports_entry_string() {
        let exports = serde_json::json!("./dist/index.js");
        assert_eq!(
            resolve_exports_entry(&exports, "."),
            Some("./dist/index.js".to_string())
        );
    }

    #[test]
    fn test_resolve_exports_entry_conditions_map() {
        let exports = serde_json::json!({
            ".": { "import": "./dist/index.mjs", "require": "./dist/index.cjs" }
        });
        assert_eq!(
            resolve_exports_entry(&exports, "."),
            Some("./dist/index.mjs".to_string())
        );
    }

    #[test]
    fn test_resolve_vertz_test_specifier() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("@vertz/test", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.as_str(), "vertz:test");
    }

    #[test]
    fn test_resolve_bun_test_specifier() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("bun:test", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.as_str(), "vertz:test");
    }

    #[test]
    fn test_load_vertz_test_module() {
        let tmp = create_temp_dir();
        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let specifier = ModuleSpecifier::parse("vertz:test").unwrap();
        let response = loader.load(&specifier, None, false, RequestedModuleType::None);

        match response {
            ModuleLoadResponse::Sync(Ok(source)) => match &source.code {
                deno_core::ModuleSourceCode::String(code) => {
                    let code_str = code.as_str();
                    assert!(
                        code_str.contains("__vertz_test_exports"),
                        "Should reference test harness exports"
                    );
                    assert!(code_str.contains("export"), "Should have export statements");
                }
                _ => panic!("Expected string source code"),
            },
            ModuleLoadResponse::Sync(Err(e)) => {
                panic!("Module load failed: {}", e);
            }
            _ => panic!("Expected synchronous module load"),
        }
    }

    #[test]
    fn test_resolve_exports_entry_subpath() {
        let exports = serde_json::json!({
            ".": "./dist/index.js",
            "./utils": "./dist/utils.js"
        });
        assert_eq!(
            resolve_exports_entry(&exports, "./utils"),
            Some("./dist/utils.js".to_string())
        );
    }

    // --- Phase 5a: node:* synthetic module resolution ---

    #[test]
    fn test_resolve_node_path() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("node:path", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), NODE_PATH_SPECIFIER);
    }

    #[test]
    fn test_resolve_node_os() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("node:os", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), NODE_OS_SPECIFIER);
    }

    #[test]
    fn test_resolve_node_url() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("node:url", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), NODE_URL_SPECIFIER);
    }

    #[test]
    fn test_resolve_node_events() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("node:events", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), NODE_EVENTS_SPECIFIER);
    }

    #[test]
    fn test_resolve_node_process() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("node:process", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), NODE_PROCESS_SPECIFIER);
    }

    #[test]
    fn test_resolve_bare_path_maps_to_node_path() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        // bare "path" (without node: prefix) should also resolve
        let result = loader.resolve("path", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), NODE_PATH_SPECIFIER);
    }

    #[test]
    fn test_load_node_path_module() {
        let tmp = create_temp_dir();
        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let specifier = ModuleSpecifier::parse(NODE_PATH_SPECIFIER).unwrap();
        let response = loader.load(&specifier, None, false, RequestedModuleType::None);

        match response {
            ModuleLoadResponse::Sync(Ok(source)) => match &source.code {
                deno_core::ModuleSourceCode::String(code) => {
                    let code_str = code.as_str();
                    assert!(code_str.contains("export const join"), "Should export join");
                    assert!(
                        code_str.contains("export const relative"),
                        "Should export relative"
                    );
                    assert!(
                        code_str.contains("export default"),
                        "Should have default export"
                    );
                }
                _ => panic!("Expected string source code"),
            },
            ModuleLoadResponse::Sync(Err(e)) => panic!("Module load failed: {}", e),
            _ => panic!("Expected synchronous module load"),
        }
    }

    #[test]
    fn test_load_node_events_module() {
        let tmp = create_temp_dir();
        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let specifier = ModuleSpecifier::parse(NODE_EVENTS_SPECIFIER).unwrap();
        let response = loader.load(&specifier, None, false, RequestedModuleType::None);

        match response {
            ModuleLoadResponse::Sync(Ok(source)) => match &source.code {
                deno_core::ModuleSourceCode::String(code) => {
                    let code_str = code.as_str();
                    assert!(
                        code_str.contains("class EventEmitter"),
                        "Should contain EventEmitter class"
                    );
                    assert!(
                        code_str.contains("export { EventEmitter }"),
                        "Should export EventEmitter"
                    );
                }
                _ => panic!("Expected string source code"),
            },
            ModuleLoadResponse::Sync(Err(e)) => panic!("Module load failed: {}", e),
            _ => panic!("Expected synchronous module load"),
        }
    }

    // --- URL canonicalization (#2071) ---

    #[test]
    fn test_resolve_canonicalizes_dotdot_paths() {
        // Given a file imported via a path with .. components
        // When the same file is also imported via a direct path
        // Then both resolve to the same canonical module URL
        let tmp = create_temp_dir();
        let src_dir = tmp.path().join("src");
        let lib_dir = tmp.path().join("src").join("lib");
        std::fs::create_dir_all(&lib_dir).unwrap();

        let main_file = src_dir.join("main.ts");
        let utils_file = lib_dir.join("utils.ts");
        std::fs::write(&main_file, "").unwrap();
        std::fs::write(&utils_file, "export const x = 1;").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();

        // Direct path
        let direct = loader
            .resolve("./lib/utils.ts", referrer.as_str(), ResolutionKind::Import)
            .unwrap();

        // Path with .. components (goes up then back down)
        let dotdot = loader
            .resolve(
                "../src/lib/../lib/utils.ts",
                referrer.as_str(),
                ResolutionKind::Import,
            )
            .unwrap();

        assert_eq!(
            direct, dotdot,
            "Direct and .. paths should resolve to the same URL"
        );
    }

    #[test]
    fn test_resolve_canonicalizes_symlinked_paths() {
        // Given a workspace package symlinked in node_modules
        // When imported via bare specifier and via relative path
        // Then both resolve to the same module URL
        let tmp = create_temp_dir();

        // Create the real package directory
        let real_pkg_dir = tmp.path().join("packages").join("my-lib");
        let real_dist = real_pkg_dir.join("dist");
        std::fs::create_dir_all(&real_dist).unwrap();
        let real_entry = real_dist.join("index.js");
        std::fs::write(&real_entry, "export const x = 1;").unwrap();
        std::fs::write(
            real_pkg_dir.join("package.json"),
            r#"{ "name": "my-lib", "exports": { ".": "./dist/index.js" } }"#,
        )
        .unwrap();

        // Create a symlink in node_modules pointing to the real package
        let nm_dir = tmp.path().join("node_modules").join("my-lib");
        std::fs::create_dir_all(tmp.path().join("node_modules")).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&real_pkg_dir, &nm_dir).unwrap();
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&real_pkg_dir, &nm_dir).unwrap();

        // Create a source file that could import via either path
        let src_file = tmp.path().join("src").join("app.ts");
        std::fs::create_dir_all(tmp.path().join("src")).unwrap();
        std::fs::write(&src_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&src_file).unwrap();

        // Import via bare specifier (goes through node_modules symlink)
        let via_bare = loader
            .resolve("my-lib", referrer.as_str(), ResolutionKind::Import)
            .unwrap();

        // Import via relative path to the real package directory
        let via_relative = loader
            .resolve(
                "../packages/my-lib/dist/index.js",
                referrer.as_str(),
                ResolutionKind::Import,
            )
            .unwrap();

        assert_eq!(
            via_bare, via_relative,
            "Symlink and relative paths to the same file should resolve to the same URL"
        );
    }

    #[test]
    fn test_canonicalize_cached_returns_consistent_results() {
        let tmp = create_temp_dir();
        let file = tmp.path().join("test.js");
        std::fs::write(&file, "export const x = 1;").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());

        let result1 = loader.canonicalize_cached(&file);
        let result2 = loader.canonicalize_cached(&file);

        assert_eq!(
            result1, result2,
            "Cached canonicalization should be consistent"
        );
        // On macOS, /tmp -> /private/tmp, so canonical path may differ from input
        assert!(result1.is_absolute(), "Canonical path should be absolute");
    }
}
