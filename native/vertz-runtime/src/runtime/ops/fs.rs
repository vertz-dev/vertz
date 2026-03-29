use std::path::PathBuf;

use deno_core::error::AnyError;
use deno_core::op2;
use deno_core::OpDecl;
use serde::Serialize;

// NOTE: FS access is intentionally unrestricted, matching Bun/Node.js semantics.
// The runtime trusts the executing script. A future permission system (like Deno's
// --allow-read/--allow-write) may be added as an opt-in layer.

/// Map an `io::Error` to the appropriate POSIX-style error code prefix.
fn io_error_code(e: &std::io::Error) -> &'static str {
    match e.kind() {
        std::io::ErrorKind::NotFound => "ENOENT",
        std::io::ErrorKind::PermissionDenied => "EACCES",
        std::io::ErrorKind::AlreadyExists => "EEXIST",
        std::io::ErrorKind::NotADirectory => "ENOTDIR",
        std::io::ErrorKind::IsADirectory => "EISDIR",
        _ => "EIO",
    }
}

/// Stat result returned to JavaScript.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatResult {
    pub is_file: bool,
    pub is_directory: bool,
    pub is_symlink: bool,
    pub size: u64,
    /// Modified time in milliseconds since epoch.
    pub mtime_ms: f64,
    /// Access time in milliseconds since epoch.
    pub atime_ms: f64,
    /// Birth time in milliseconds since epoch.
    pub birthtime_ms: f64,
    /// Unix mode (permissions).
    pub mode: u32,
}

fn metadata_to_stat(meta: &std::fs::Metadata) -> StatResult {
    use std::time::UNIX_EPOCH;

    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0);
    let atime_ms = meta
        .accessed()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0);
    let birthtime_ms = meta
        .created()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs_f64() * 1000.0)
        .unwrap_or(0.0);

    #[cfg(unix)]
    let mode = {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode()
    };
    #[cfg(not(unix))]
    let mode = 0u32;

    StatResult {
        is_file: meta.is_file(),
        is_directory: meta.is_dir(),
        is_symlink: meta.is_symlink(),
        size: meta.len(),
        mtime_ms,
        atime_ms,
        birthtime_ms,
        mode,
    }
}

// --- Sync ops ---

/// Read a file as a UTF-8 string.
#[op2]
#[string]
pub fn op_fs_read_file_sync(#[string] path: String) -> Result<String, AnyError> {
    std::fs::read_to_string(&path)
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))
}

/// Read a file as raw bytes (returned as Vec<u8>).
#[op2]
#[buffer]
pub fn op_fs_read_file_bytes_sync(#[string] path: String) -> Result<Vec<u8>, AnyError> {
    std::fs::read(&path)
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))
}

/// Write string contents to a file.
#[op2(fast)]
pub fn op_fs_write_file_sync(
    #[string] path: String,
    #[string] data: String,
) -> Result<(), AnyError> {
    std::fs::write(&path, data)
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))
}

/// Write raw bytes to a file.
#[op2(fast)]
pub fn op_fs_write_file_bytes_sync(
    #[string] path: String,
    #[buffer] data: &[u8],
) -> Result<(), AnyError> {
    std::fs::write(&path, data)
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))
}

/// Append string contents to a file.
#[op2(fast)]
pub fn op_fs_append_file_sync(
    #[string] path: String,
    #[string] data: String,
) -> Result<(), AnyError> {
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| deno_core::anyhow::anyhow!("{}: '{}'", e, path))?;
    file.write_all(data.as_bytes())
        .map_err(|e| deno_core::anyhow::anyhow!("{}: '{}'", e, path))
}

/// Check if a path exists.
#[op2(fast)]
pub fn op_fs_exists_sync(#[string] path: String) -> bool {
    PathBuf::from(&path).exists()
}

/// Create a directory (optionally recursive).
#[op2(fast)]
pub fn op_fs_mkdir_sync(#[string] path: String, recursive: bool) -> Result<(), AnyError> {
    if recursive {
        std::fs::create_dir_all(&path)
    } else {
        std::fs::create_dir(&path)
    }
    .map_err(|e| deno_core::anyhow::anyhow!("{}: '{}'", e, path))
}

/// Read directory entries (returns list of filenames).
#[op2]
#[serde]
pub fn op_fs_readdir_sync(#[string] path: String) -> Result<Vec<String>, AnyError> {
    let entries = std::fs::read_dir(&path)
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))?;
    let mut names = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
        names.push(entry.file_name().to_string_lossy().to_string());
    }
    Ok(names)
}

/// Get file/directory metadata.
#[op2]
#[serde]
pub fn op_fs_stat_sync(#[string] path: String) -> Result<StatResult, AnyError> {
    let meta = std::fs::metadata(&path)
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))?;
    Ok(metadata_to_stat(&meta))
}

/// Get file/directory metadata (doesn't follow symlinks).
#[op2]
#[serde]
pub fn op_fs_lstat_sync(#[string] path: String) -> Result<StatResult, AnyError> {
    let meta = std::fs::symlink_metadata(&path)
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))?;
    Ok(metadata_to_stat(&meta))
}

/// Remove a file or directory.
#[op2(fast)]
pub fn op_fs_rm_sync(#[string] path: String, recursive: bool, force: bool) -> Result<(), AnyError> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        if force {
            return Ok(());
        }
        return Err(deno_core::anyhow::anyhow!(
            "ENOENT: no such file or directory: '{}'",
            path
        ));
    }
    if p.is_dir() {
        if recursive {
            std::fs::remove_dir_all(&path)
        } else {
            std::fs::remove_dir(&path)
        }
    } else {
        std::fs::remove_file(&path)
    }
    .map_err(|e| deno_core::anyhow::anyhow!("{}: '{}'", e, path))
}

/// Remove a file (unlink).
#[op2(fast)]
pub fn op_fs_unlink_sync(#[string] path: String) -> Result<(), AnyError> {
    std::fs::remove_file(&path).map_err(|e| deno_core::anyhow::anyhow!("{}: '{}'", e, path))
}

/// Rename/move a file or directory.
#[op2(fast)]
pub fn op_fs_rename_sync(
    #[string] old_path: String,
    #[string] new_path: String,
) -> Result<(), AnyError> {
    std::fs::rename(&old_path, &new_path)
        .map_err(|e| deno_core::anyhow::anyhow!("{}: '{}' -> '{}'", e, old_path, new_path))
}

/// Resolve symlinks to get the real path.
#[op2]
#[string]
pub fn op_fs_realpath_sync(#[string] path: String) -> Result<String, AnyError> {
    std::fs::canonicalize(&path)
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))
}

/// Create a unique temporary directory with the given prefix.
#[op2]
#[string]
pub fn op_fs_mkdtemp_sync(#[string] prefix: String) -> Result<String, AnyError> {
    let tmp = std::env::temp_dir();
    // Generate a random suffix
    let random: u64 = rand::random();
    let dir_name = format!("{}{}", prefix.replace("XXXXXX", ""), random);
    let dir_path = tmp.join(dir_name);
    std::fs::create_dir(&dir_path).map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
    Ok(dir_path.to_string_lossy().to_string())
}

/// Copy a file.
#[op2(fast)]
pub fn op_fs_copy_file_sync(#[string] src: String, #[string] dest: String) -> Result<(), AnyError> {
    std::fs::copy(&src, &dest)
        .map(|_| ())
        .map_err(|e| deno_core::anyhow::anyhow!("{}: '{}' -> '{}'", e, src, dest))
}

/// Change file permissions (chmod).
#[op2(fast)]
pub fn op_fs_chmod_sync(#[string] path: String, #[smi] mode: u32) -> Result<(), AnyError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = std::fs::Permissions::from_mode(mode);
        std::fs::set_permissions(&path, permissions)
            .map_err(|e| deno_core::anyhow::anyhow!("{}: '{}'", e, path))
    }
    #[cfg(not(unix))]
    {
        let _ = (path, mode);
        Ok(())
    }
}

// --- Async ops ---

/// Read a file as a UTF-8 string (async).
#[op2(async)]
#[string]
pub async fn op_fs_read_file(#[string] path: String) -> Result<String, AnyError> {
    tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))
}

/// Read a file as raw bytes (async).
#[op2(async)]
#[buffer]
pub async fn op_fs_read_file_bytes(#[string] path: String) -> Result<Vec<u8>, AnyError> {
    tokio::fs::read(&path)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))
}

/// Write string contents to a file (async).
#[op2(async)]
pub async fn op_fs_write_file(
    #[string] path: String,
    #[string] data: String,
) -> Result<(), AnyError> {
    tokio::fs::write(&path, data)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))
}

/// Write raw bytes to a file (async).
#[op2(async)]
pub async fn op_fs_write_file_bytes(
    #[string] path: String,
    #[serde] data: Vec<u8>,
) -> Result<(), AnyError> {
    tokio::fs::write(&path, data)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))
}

/// Create a directory (async, optionally recursive).
#[op2(async)]
pub async fn op_fs_mkdir(#[string] path: String, recursive: bool) -> Result<(), AnyError> {
    if recursive {
        tokio::fs::create_dir_all(&path).await
    } else {
        tokio::fs::create_dir(&path).await
    }
    .map_err(|e| deno_core::anyhow::anyhow!("{}: '{}'", e, path))
}

/// Read directory entries (async).
#[op2(async)]
#[serde]
pub async fn op_fs_readdir(#[string] path: String) -> Result<Vec<String>, AnyError> {
    let mut entries = tokio::fs::read_dir(&path)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))?;
    let mut names = Vec::new();
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?
    {
        names.push(entry.file_name().to_string_lossy().to_string());
    }
    Ok(names)
}

/// Get file metadata (async).
#[op2(async)]
#[serde]
pub async fn op_fs_stat(#[string] path: String) -> Result<StatResult, AnyError> {
    let meta = tokio::fs::metadata(&path)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))?;
    Ok(metadata_to_stat(&meta))
}

/// Remove file/directory (async).
#[op2(async)]
pub async fn op_fs_rm(
    #[string] path: String,
    recursive: bool,
    force: bool,
) -> Result<(), AnyError> {
    let p = PathBuf::from(&path);
    let exists = tokio::fs::metadata(&path).await.is_ok();
    if !exists {
        if force {
            return Ok(());
        }
        return Err(deno_core::anyhow::anyhow!(
            "ENOENT: no such file or directory: '{}'",
            path
        ));
    }
    if p.is_dir() {
        if recursive {
            tokio::fs::remove_dir_all(&path).await
        } else {
            tokio::fs::remove_dir(&path).await
        }
    } else {
        tokio::fs::remove_file(&path).await
    }
    .map_err(|e| deno_core::anyhow::anyhow!("{}: '{}'", e, path))
}

/// Remove a file (async).
#[op2(async)]
pub async fn op_fs_unlink(#[string] path: String) -> Result<(), AnyError> {
    tokio::fs::remove_file(&path)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}: '{}'", e, path))
}

/// Rename (async).
#[op2(async)]
pub async fn op_fs_rename(
    #[string] old_path: String,
    #[string] new_path: String,
) -> Result<(), AnyError> {
    tokio::fs::rename(&old_path, &new_path)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}: '{}' -> '{}'", e, old_path, new_path))
}

/// Resolve symlinks (async).
#[op2(async)]
#[string]
pub async fn op_fs_realpath(#[string] path: String) -> Result<String, AnyError> {
    tokio::fs::canonicalize(&path)
        .await
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| deno_core::anyhow::anyhow!("{}: {}: '{}'", io_error_code(&e), e, path))
}

/// Get the op declarations for fs ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![
        // Sync
        op_fs_read_file_sync(),
        op_fs_read_file_bytes_sync(),
        op_fs_write_file_sync(),
        op_fs_write_file_bytes_sync(),
        op_fs_append_file_sync(),
        op_fs_exists_sync(),
        op_fs_mkdir_sync(),
        op_fs_readdir_sync(),
        op_fs_stat_sync(),
        op_fs_lstat_sync(),
        op_fs_rm_sync(),
        op_fs_unlink_sync(),
        op_fs_rename_sync(),
        op_fs_realpath_sync(),
        op_fs_mkdtemp_sync(),
        op_fs_copy_file_sync(),
        op_fs_chmod_sync(),
        // Async
        op_fs_read_file(),
        op_fs_read_file_bytes(),
        op_fs_write_file(),
        op_fs_write_file_bytes(),
        op_fs_mkdir(),
        op_fs_readdir(),
        op_fs_stat(),
        op_fs_rm(),
        op_fs_unlink(),
        op_fs_rename(),
        op_fs_realpath(),
    ]
}

/// JavaScript bootstrap code — stores __vertz_fs on globalThis for synthetic module access.
/// No global `fs` is exposed — only available via `import from 'node:fs'`.
pub const FS_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  // Buffer shim: a thin wrapper around Uint8Array with Node-compatible methods.
  class Buffer extends Uint8Array {
    toString(encoding) {
      if (!encoding || encoding === 'utf-8' || encoding === 'utf8') {
        return new TextDecoder().decode(this);
      }
      if (encoding === 'hex') {
        return Array.from(this).map(b => b.toString(16).padStart(2, '0')).join('');
      }
      if (encoding === 'base64') {
        return btoa(String.fromCharCode(...this));
      }
      return new TextDecoder().decode(this);
    }
    static from(data, encoding) {
      if (typeof data === 'string') {
        if (encoding === 'hex') {
          const bytes = new Uint8Array(data.length / 2);
          for (let i = 0; i < data.length; i += 2) {
            bytes[i / 2] = parseInt(data.substr(i, 2), 16);
          }
          return new Buffer(bytes);
        }
        if (encoding === 'base64') {
          const bin = atob(data);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return new Buffer(bytes);
        }
        return new Buffer(new TextEncoder().encode(data));
      }
      if (data instanceof ArrayBuffer) return new Buffer(new Uint8Array(data));
      if (ArrayBuffer.isView(data)) return new Buffer(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      if (Array.isArray(data)) return new Buffer(new Uint8Array(data));
      return new Buffer(data);
    }
    static alloc(size, fill) {
      const buf = new Buffer(size);
      if (fill !== undefined) buf.fill(typeof fill === 'string' ? fill.charCodeAt(0) : fill);
      return buf;
    }
    static isBuffer(obj) {
      return obj instanceof Buffer;
    }
    static concat(list, totalLength) {
      if (totalLength === undefined) {
        totalLength = list.reduce((sum, buf) => sum + buf.length, 0);
      }
      const result = new Buffer(totalLength);
      let offset = 0;
      for (const buf of list) {
        result.set(buf, offset);
        offset += buf.length;
      }
      return result;
    }
    equals(other) {
      if (this.length !== other.length) return false;
      for (let i = 0; i < this.length; i++) {
        if (this[i] !== other[i]) return false;
      }
      return true;
    }
    write(string, offset, length, encoding) {
      const encoded = new TextEncoder().encode(string);
      const start = offset || 0;
      const len = Math.min(encoded.length, length || this.length - start, this.length - start);
      this.set(encoded.subarray(0, len), start);
      return len;
    }
    copy(target, targetStart, sourceStart, sourceEnd) {
      targetStart = targetStart || 0;
      sourceStart = sourceStart || 0;
      sourceEnd = sourceEnd || this.length;
      const slice = this.subarray(sourceStart, sourceEnd);
      target.set(slice, targetStart);
      return slice.length;
    }
    slice(start, end) {
      return new Buffer(this.subarray(start, end));
    }
  }
  globalThis.Buffer = Buffer;

  // Stat object with isFile/isDirectory methods
  function createStatObject(raw) {
    return {
      isFile: () => raw.isFile,
      isDirectory: () => raw.isDirectory,
      isSymbolicLink: () => raw.isSymlink,
      size: raw.size,
      mtimeMs: raw.mtimeMs,
      atimeMs: raw.atimeMs,
      birthtimeMs: raw.birthtimeMs,
      mtime: new Date(raw.mtimeMs),
      atime: new Date(raw.atimeMs),
      birthtime: new Date(raw.birthtimeMs),
      mode: raw.mode,
    };
  }

  // --- Sync functions ---
  function readFileSync(path, options) {
    const encoding = typeof options === 'string' ? options : (options && options.encoding);
    if (encoding === 'utf-8' || encoding === 'utf8') {
      return Deno.core.ops.op_fs_read_file_sync(String(path));
    }
    const bytes = Deno.core.ops.op_fs_read_file_bytes_sync(String(path));
    return Buffer.from(bytes);
  }

  function writeFileSync(path, data, options) {
    if (typeof data === 'string') {
      Deno.core.ops.op_fs_write_file_sync(String(path), data);
    } else {
      Deno.core.ops.op_fs_write_file_bytes_sync(String(path), data);
    }
  }

  function appendFileSync(path, data) {
    Deno.core.ops.op_fs_append_file_sync(String(path), String(data));
  }

  function existsSync(path) {
    return Deno.core.ops.op_fs_exists_sync(String(path));
  }

  function mkdirSync(path, options) {
    const recursive = options && options.recursive ? true : false;
    Deno.core.ops.op_fs_mkdir_sync(String(path), recursive);
  }

  function readdirSync(path) {
    return Deno.core.ops.op_fs_readdir_sync(String(path));
  }

  function statSync(path) {
    return createStatObject(Deno.core.ops.op_fs_stat_sync(String(path)));
  }

  function lstatSync(path) {
    return createStatObject(Deno.core.ops.op_fs_lstat_sync(String(path)));
  }

  function rmSync(path, options) {
    const recursive = options && options.recursive ? true : false;
    const force = options && options.force ? true : false;
    Deno.core.ops.op_fs_rm_sync(String(path), recursive, force);
  }

  function unlinkSync(path) {
    Deno.core.ops.op_fs_unlink_sync(String(path));
  }

  function renameSync(oldPath, newPath) {
    Deno.core.ops.op_fs_rename_sync(String(oldPath), String(newPath));
  }

  function realpathSync(path) {
    return Deno.core.ops.op_fs_realpath_sync(String(path));
  }

  function mkdtempSync(prefix) {
    return Deno.core.ops.op_fs_mkdtemp_sync(String(prefix));
  }

  function copyFileSync(src, dest) {
    Deno.core.ops.op_fs_copy_file_sync(String(src), String(dest));
  }

  function chmodSync(path, mode) {
    Deno.core.ops.op_fs_chmod_sync(String(path), mode);
  }

  // --- Async functions ---
  async function readFile(path, options) {
    const encoding = typeof options === 'string' ? options : (options && options.encoding);
    if (encoding === 'utf-8' || encoding === 'utf8') {
      return await Deno.core.ops.op_fs_read_file(String(path));
    }
    const bytes = await Deno.core.ops.op_fs_read_file_bytes(String(path));
    return Buffer.from(bytes);
  }

  async function writeFile(path, data, options) {
    if (typeof data === 'string') {
      await Deno.core.ops.op_fs_write_file(String(path), data);
    } else {
      // Binary data — use bytes op to avoid UTF-8 corruption
      const bytes = data instanceof Uint8Array
        ? data
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      await Deno.core.ops.op_fs_write_file_bytes(String(path), Array.from(bytes));
    }
  }

  async function mkdir(path, options) {
    const recursive = options && options.recursive ? true : false;
    await Deno.core.ops.op_fs_mkdir(String(path), recursive);
  }

  async function readdir(path) {
    return Deno.core.ops.op_fs_readdir(String(path));
  }

  async function stat(path) {
    const raw = await Deno.core.ops.op_fs_stat(String(path));
    return createStatObject(raw);
  }

  async function rm(path, options) {
    const recursive = options && options.recursive ? true : false;
    const force = options && options.force ? true : false;
    await Deno.core.ops.op_fs_rm(String(path), recursive, force);
  }

  async function unlink(path) {
    await Deno.core.ops.op_fs_unlink(String(path));
  }

  async function rename(oldPath, newPath) {
    await Deno.core.ops.op_fs_rename(String(oldPath), String(newPath));
  }

  async function realpath(path) {
    return Deno.core.ops.op_fs_realpath(String(path));
  }

  // --- Module object ---
  const fsSync = {
    readFileSync, writeFileSync, appendFileSync, existsSync,
    mkdirSync, readdirSync, statSync, lstatSync,
    rmSync, unlinkSync, renameSync, realpathSync,
    mkdtempSync, copyFileSync, chmodSync,
    // Async wrappers (node:fs also has callback-style but we provide promise-based)
    readFile, writeFile, mkdir, readdir, stat, rm, unlink, rename, realpath,
    // Promises sub-object
    promises: {
      readFile, writeFile, mkdir, readdir, stat, rm, unlink, rename, realpath,
    },
  };

  globalThis.__vertz_fs = fsSync;
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap()
    }

    // --- Sync tests ---

    #[test]
    fn test_fs_write_and_read_file_sync() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("test.txt");
        let mut rt = create_runtime();

        let write_code = format!(
            r#"__vertz_fs.writeFileSync("{}", "hello world")"#,
            file_path.to_string_lossy().replace('\\', "/")
        );
        rt.execute_script_void("<test>", &write_code).unwrap();

        let read_code = format!(
            r#"__vertz_fs.readFileSync("{}", "utf-8")"#,
            file_path.to_string_lossy().replace('\\', "/")
        );
        let result = rt.execute_script("<test>", &read_code).unwrap();
        assert_eq!(result, serde_json::json!("hello world"));
    }

    #[test]
    fn test_fs_read_file_sync_returns_buffer_without_encoding() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("test.bin");
        std::fs::write(&file_path, "abc").unwrap();
        let mut rt = create_runtime();

        let code = format!(
            r#"
            const buf = __vertz_fs.readFileSync("{}");
            [buf instanceof Uint8Array, buf.length, buf.toString('utf-8')]
        "#,
            file_path.to_string_lossy().replace('\\', "/")
        );
        let result = rt.execute_script("<test>", &code).unwrap();
        assert_eq!(result, serde_json::json!([true, 3, "abc"]));
    }

    #[test]
    fn test_fs_exists_sync() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("exists.txt");
        std::fs::write(&file_path, "x").unwrap();
        let mut rt = create_runtime();

        let code = format!(
            r#"[__vertz_fs.existsSync("{}"), __vertz_fs.existsSync("{}/nope")]"#,
            file_path.to_string_lossy().replace('\\', "/"),
            tmp.path().to_string_lossy().replace('\\', "/")
        );
        let result = rt.execute_script("<test>", &code).unwrap();
        assert_eq!(result, serde_json::json!([true, false]));
    }

    #[test]
    fn test_fs_mkdir_sync_recursive() {
        let tmp = tempfile::tempdir().unwrap();
        let nested = tmp.path().join("a").join("b").join("c");
        let mut rt = create_runtime();

        let code = format!(
            r#"__vertz_fs.mkdirSync("{}", {{ recursive: true }})"#,
            nested.to_string_lossy().replace('\\', "/")
        );
        rt.execute_script_void("<test>", &code).unwrap();
        assert!(nested.exists());
    }

    #[test]
    fn test_fs_readdir_sync() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("a.txt"), "").unwrap();
        std::fs::write(tmp.path().join("b.txt"), "").unwrap();
        let mut rt = create_runtime();

        let code = format!(
            r#"__vertz_fs.readdirSync("{}").sort()"#,
            tmp.path().to_string_lossy().replace('\\', "/")
        );
        let result = rt.execute_script("<test>", &code).unwrap();
        assert_eq!(result, serde_json::json!(["a.txt", "b.txt"]));
    }

    #[test]
    fn test_fs_stat_sync() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("stat-test.txt");
        std::fs::write(&file_path, "hello").unwrap();
        let mut rt = create_runtime();

        let code = format!(
            r#"
            const s = __vertz_fs.statSync("{}");
            [s.isFile(), s.isDirectory(), s.size]
        "#,
            file_path.to_string_lossy().replace('\\', "/")
        );
        let result = rt.execute_script("<test>", &code).unwrap();
        assert_eq!(result, serde_json::json!([true, false, 5]));
    }

    #[test]
    fn test_fs_stat_sync_directory() {
        let tmp = tempfile::tempdir().unwrap();
        let mut rt = create_runtime();

        let code = format!(
            r#"
            const s = __vertz_fs.statSync("{}");
            [s.isFile(), s.isDirectory()]
        "#,
            tmp.path().to_string_lossy().replace('\\', "/")
        );
        let result = rt.execute_script("<test>", &code).unwrap();
        assert_eq!(result, serde_json::json!([false, true]));
    }

    #[test]
    fn test_fs_rm_sync_file() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("to-delete.txt");
        std::fs::write(&file_path, "x").unwrap();
        let mut rt = create_runtime();

        let code = format!(
            r#"__vertz_fs.rmSync("{}")"#,
            file_path.to_string_lossy().replace('\\', "/")
        );
        rt.execute_script_void("<test>", &code).unwrap();
        assert!(!file_path.exists());
    }

    #[test]
    fn test_fs_rm_sync_recursive() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("nested");
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("sub").join("file.txt"), "x").unwrap();
        let mut rt = create_runtime();

        let code = format!(
            r#"__vertz_fs.rmSync("{}", {{ recursive: true }})"#,
            dir.to_string_lossy().replace('\\', "/")
        );
        rt.execute_script_void("<test>", &code).unwrap();
        assert!(!dir.exists());
    }

    #[test]
    fn test_fs_rm_sync_force_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let mut rt = create_runtime();

        // force: true should not throw for missing path
        let code = format!(
            r#"__vertz_fs.rmSync("{}/nonexistent", {{ force: true }})"#,
            tmp.path().to_string_lossy().replace('\\', "/")
        );
        rt.execute_script_void("<test>", &code).unwrap();
    }

    #[test]
    fn test_fs_rename_sync() {
        let tmp = tempfile::tempdir().unwrap();
        let old = tmp.path().join("old.txt");
        let new_path = tmp.path().join("new.txt");
        std::fs::write(&old, "content").unwrap();
        let mut rt = create_runtime();

        let code = format!(
            r#"__vertz_fs.renameSync("{}", "{}")"#,
            old.to_string_lossy().replace('\\', "/"),
            new_path.to_string_lossy().replace('\\', "/")
        );
        rt.execute_script_void("<test>", &code).unwrap();
        assert!(!old.exists());
        assert_eq!(std::fs::read_to_string(&new_path).unwrap(), "content");
    }

    #[test]
    fn test_fs_mkdtemp_sync() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", r#"__vertz_fs.mkdtempSync("vertz-test-")"#)
            .unwrap();
        let dir = result.as_str().unwrap();
        assert!(
            std::path::Path::new(dir).is_dir(),
            "mkdtempSync should create a directory: {}",
            dir
        );
        // Clean up
        std::fs::remove_dir(dir).ok();
    }

    #[test]
    fn test_fs_append_file_sync() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("append.txt");
        std::fs::write(&file_path, "hello").unwrap();
        let mut rt = create_runtime();

        let code = format!(
            r#"__vertz_fs.appendFileSync("{}", " world")"#,
            file_path.to_string_lossy().replace('\\', "/")
        );
        rt.execute_script_void("<test>", &code).unwrap();
        assert_eq!(std::fs::read_to_string(&file_path).unwrap(), "hello world");
    }

    #[test]
    fn test_fs_unlink_sync() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("to-unlink.txt");
        std::fs::write(&file_path, "x").unwrap();
        let mut rt = create_runtime();

        let code = format!(
            r#"__vertz_fs.unlinkSync("{}")"#,
            file_path.to_string_lossy().replace('\\', "/")
        );
        rt.execute_script_void("<test>", &code).unwrap();
        assert!(!file_path.exists());
    }

    #[test]
    fn test_fs_realpath_sync() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("real.txt");
        std::fs::write(&file_path, "x").unwrap();
        let mut rt = create_runtime();

        let code = format!(
            r#"__vertz_fs.realpathSync("{}")"#,
            file_path.to_string_lossy().replace('\\', "/")
        );
        let result = rt.execute_script("<test>", &code).unwrap();
        let resolved = result.as_str().unwrap();
        assert!(
            resolved.ends_with("real.txt"),
            "Expected resolved path, got: {}",
            resolved
        );
    }

    #[test]
    fn test_fs_copy_file_sync() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src.txt");
        let dest = tmp.path().join("dest.txt");
        std::fs::write(&src, "copy me").unwrap();
        let mut rt = create_runtime();

        let code = format!(
            r#"__vertz_fs.copyFileSync("{}", "{}")"#,
            src.to_string_lossy().replace('\\', "/"),
            dest.to_string_lossy().replace('\\', "/")
        );
        rt.execute_script_void("<test>", &code).unwrap();
        assert_eq!(std::fs::read_to_string(&dest).unwrap(), "copy me");
    }

    // --- Async tests ---

    #[tokio::test]
    async fn test_fs_read_file_async() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("async-read.txt");
        std::fs::write(&file_path, "async content").unwrap();
        let mut rt = create_runtime();

        let code = format!(
            r#"(async () => {{ return await __vertz_fs.promises.readFile("{}", "utf-8") }})().then(v => {{ globalThis.__result = v; }})"#,
            file_path.to_string_lossy().replace('\\', "/")
        );
        rt.execute_script_void("<test>", &code).unwrap();
        rt.run_event_loop().await.unwrap();
        let result = rt
            .execute_script("<result>", "globalThis.__result")
            .unwrap();
        assert_eq!(result, serde_json::json!("async content"));
    }

    #[tokio::test]
    async fn test_fs_write_file_async() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("async-write.txt");
        let mut rt = create_runtime();

        let code = format!(
            r#"(async () => {{ await __vertz_fs.promises.writeFile("{}", "async data"); return "ok" }})().then(v => {{ globalThis.__result = v; }})"#,
            file_path.to_string_lossy().replace('\\', "/")
        );
        rt.execute_script_void("<test>", &code).unwrap();
        rt.run_event_loop().await.unwrap();
        let result = rt
            .execute_script("<result>", "globalThis.__result")
            .unwrap();
        assert_eq!(result, serde_json::json!("ok"));
        assert_eq!(std::fs::read_to_string(&file_path).unwrap(), "async data");
    }

    // --- Buffer tests ---

    #[test]
    fn test_buffer_from_string() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const buf = Buffer.from("hello");
                [buf instanceof Uint8Array, buf.length, buf.toString()]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([true, 5, "hello"]));
    }

    #[test]
    fn test_buffer_from_hex() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const buf = Buffer.from("68656c6c6f", "hex");
                buf.toString("utf-8")
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("hello"));
    }

    #[test]
    fn test_buffer_to_hex() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", r#"Buffer.from("hello").toString("hex")"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("68656c6c6f"));
    }

    #[test]
    fn test_buffer_alloc() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const buf = Buffer.alloc(4, 0);
                [buf.length, buf[0], buf[3]]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([4, 0, 0]));
    }

    #[test]
    fn test_buffer_concat() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const a = Buffer.from("hel");
                const b = Buffer.from("lo");
                Buffer.concat([a, b]).toString()
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("hello"));
    }

    #[test]
    fn test_buffer_is_buffer() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                [Buffer.isBuffer(Buffer.from("x")), Buffer.isBuffer(new Uint8Array(1)), Buffer.isBuffer("nope")]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([true, false, false]));
    }

    #[test]
    fn test_buffer_equals() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const a = Buffer.from("abc");
                const b = Buffer.from("abc");
                const c = Buffer.from("xyz");
                [a.equals(b), a.equals(c)]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([true, false]));
    }
}
