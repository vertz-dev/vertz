/// Minimal `Bun` global compatibility shim for the vtz runtime.
///
/// Provides a `globalThis.Bun` object with just enough surface area so that
/// packages which check `typeof Bun !== 'undefined'` or call common Bun APIs
/// (file I/O, env, sleep) work without modification.
///
/// APIs that have no vtz equivalent (Bun.build, Bun.spawn) throw a clear error
/// instead of silently failing.
pub const BUN_COMPAT_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  if (typeof globalThis.Bun !== 'undefined') return;

  const ops = Deno.core.ops;

  /**
   * Bun.file(path) — returns a BunFile-like object backed by vtz fs ops.
   */
  function bunFile(path) {
    return {
      get name() { return path; },
      async text() {
        return ops.op_fs_read_file(path);
      },
      async arrayBuffer() {
        const text = ops.op_fs_read_file(path);
        return new TextEncoder().encode(text).buffer;
      },
      async json() {
        const text = ops.op_fs_read_file(path);
        return JSON.parse(text);
      },
      get size() {
        try {
          const stat = ops.op_fs_stat_sync(path);
          return stat.size;
        } catch {
          return 0;
        }
      },
      async exists() {
        try {
          ops.op_fs_stat_sync(path);
          return true;
        } catch {
          return false;
        }
      },
    };
  }

  /**
   * Bun.write(path, data) — write data to a file.
   */
  async function bunWrite(path, data) {
    // If path is a BunFile-like, extract its name
    const filePath = typeof path === 'string' ? path : path.name;
    const content = typeof data === 'string' ? data : new TextDecoder().decode(data);
    ops.op_fs_write_file_sync(filePath, content);
    return content.length;
  }

  /**
   * Bun.serve(options) — delegate to vtz HTTP serve.
   */
  function bunServe(options) {
    if (!globalThis.__vtz_http) {
      throw new Error('Bun.serve() is not available: vtz HTTP server not initialized');
    }

    const port = options.port ?? 3000;
    const hostname = options.hostname ?? '0.0.0.0';
    const handler = options.fetch;

    if (typeof handler !== 'function') {
      throw new Error('Bun.serve() requires a fetch handler');
    }

    // __vtz_http.serve is synchronous — socket is bound and port is
    // available immediately, matching Bun.serve() semantics.
    const serverRef = globalThis.__vtz_http.serve(port, hostname, handler);

    // Return a Bun-compatible server object
    return {
      port: serverRef.port,
      hostname: serverRef.hostname,
      stop() {
        if (serverRef && typeof serverRef.close === 'function') {
          return serverRef.close();
        }
      },
    };
  }

  function notAvailable(name) {
    return function() {
      throw new Error(
        `Bun.${name}() is not available in the vtz runtime. ` +
        `Guard with: if (typeof Bun !== 'undefined' && Bun.${name}) { ... }`
      );
    };
  }

  globalThis.Bun = {
    version: '0.0.0-vtz-compat',
    env: globalThis.process?.env || {},
    file: bunFile,
    write: bunWrite,
    serve: bunServe,
    sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
    build: notAvailable('build'),
    spawn: notAvailable('spawn'),
    spawnSync: notAvailable('spawnSync'),
    // Common property checks
    main: '',
    argv: globalThis.process?.argv || [],
  };
})(globalThis);
"#;
