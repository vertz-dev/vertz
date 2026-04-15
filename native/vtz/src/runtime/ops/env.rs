use deno_core::op2;
use deno_core::OpDecl;
use std::collections::HashMap;

/// Get an environment variable. Returns null if not set.
#[op2]
#[string]
pub fn op_env_get(#[string] key: String) -> Option<String> {
    std::env::var(&key).ok()
}

/// Set an environment variable.
#[op2(fast)]
pub fn op_env_set(#[string] key: String, #[string] value: String) {
    std::env::set_var(&key, &value);
}

/// Remove an environment variable.
#[op2(fast)]
pub fn op_env_remove(#[string] key: String) {
    std::env::remove_var(&key);
}

/// List all environment variable names.
#[op2]
#[serde]
pub fn op_env_keys() -> Vec<String> {
    std::env::vars().map(|(k, _)| k).collect()
}

/// Get the current working directory.
#[op2]
#[string]
pub fn op_cwd() -> Result<String, deno_core::error::AnyError> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| deno_core::error::type_error(format!("Failed to get current directory: {e}")))
}

/// Change the current working directory.
#[op2(fast)]
pub fn op_chdir(#[string] dir: String) -> Result<(), deno_core::error::AnyError> {
    std::env::set_current_dir(&dir)
        .map_err(|e| deno_core::error::type_error(format!("Failed to change directory: {e}")))
}

/// Return platform-correct POSIX fs constants (O_RDONLY, O_CREAT, etc.).
/// Used by `process.binding("constants")` to support Node.js compat (e.g. PGlite NODEFS).
#[op2]
#[serde]
pub fn op_fs_constants() -> HashMap<&'static str, i32> {
    let mut m = HashMap::new();
    m.insert("O_RDONLY", libc::O_RDONLY);
    m.insert("O_WRONLY", libc::O_WRONLY);
    m.insert("O_RDWR", libc::O_RDWR);
    m.insert("O_CREAT", libc::O_CREAT);
    m.insert("O_EXCL", libc::O_EXCL);
    m.insert("O_NOCTTY", libc::O_NOCTTY);
    m.insert("O_TRUNC", libc::O_TRUNC);
    m.insert("O_APPEND", libc::O_APPEND);
    m.insert("O_SYNC", libc::O_SYNC);
    m.insert("O_NOFOLLOW", libc::O_NOFOLLOW);
    m
}

/// Get the op declarations for env ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![
        op_env_get(),
        op_env_set(),
        op_env_remove(),
        op_env_keys(),
        op_cwd(),
        op_chdir(),
        op_fs_constants(),
    ]
}

/// JavaScript bootstrap code for process.env.
pub const ENV_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  const envProxy = new Proxy({}, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      const val = Deno.core.ops.op_env_get(prop);
      return val === null ? undefined : val;
    },
    set(_target, prop, value) {
      if (typeof prop !== 'string') return true;
      Deno.core.ops.op_env_set(prop, String(value));
      return true;
    },
    deleteProperty(_target, prop) {
      if (typeof prop !== 'string') return true;
      Deno.core.ops.op_env_remove(prop);
      return true;
    },
    has(_target, prop) {
      if (typeof prop !== 'string') return false;
      return Deno.core.ops.op_env_get(prop) !== null;
    },
    ownKeys() {
      return Deno.core.ops.op_env_keys();
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      const val = Deno.core.ops.op_env_get(prop);
      if (val === null) return undefined;
      return { value: val, writable: true, enumerable: true, configurable: true };
    },
  });

  if (!globalThis.process) {
    globalThis.process = {};
  }
  Object.defineProperty(globalThis.process, 'env', {
    value: envProxy,
    writable: false,
    configurable: false,
    enumerable: true,
  });
  if (!globalThis.process.cwd) {
    globalThis.process.cwd = () => Deno.core.ops.op_cwd();
  }
  if (!globalThis.process.chdir) {
    globalThis.process.chdir = (dir) => Deno.core.ops.op_chdir(dir);
  }
  if (!globalThis.process.versions) {
    globalThis.process.versions = {};
  }
  if (!globalThis.process.versions.node) {
    globalThis.process.versions.node = '20.0.0';
  }
  if (!globalThis.process.version) {
    globalThis.process.version = 'v20.0.0';
  }
  if (!globalThis.process.platform) {
    globalThis.process.platform = Deno.core.ops.op_os_platform();
  }
  if (!globalThis.process.arch) {
    globalThis.process.arch = Deno.core.ops.op_os_arch();
  }
  if (!globalThis.process.argv) {
    globalThis.process.argv = [];
  }
  if (!globalThis.process.exit) {
    globalThis.process.exit = function(code) {
      throw new Error('process.exit(' + (code !== undefined ? code : '') + ') is not supported in the Vertz runtime');
    };
  }
  if (!globalThis.process.nextTick) {
    globalThis.process.nextTick = function(fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      queueMicrotask(function() { fn.apply(null, args); });
    };
  }
  if (!globalThis.process.on) {
    globalThis.process.on = function(_event, _cb) { return this; };
  }
  if (!globalThis.process.off) {
    globalThis.process.off = function(_event, _cb) { return this; };
  }
  if (!globalThis.process.once) {
    globalThis.process.once = function(_event, _cb) { return this; };
  }
  if (!globalThis.process.removeListener) {
    globalThis.process.removeListener = function(_event, _cb) { return this; };
  }
  if (!globalThis.process.emit) {
    globalThis.process.emit = function() { return false; };
  }
  if (!globalThis.process.listeners) {
    globalThis.process.listeners = function() { return []; };
  }
  if (!globalThis.process.removeAllListeners) {
    globalThis.process.removeAllListeners = function() { return this; };
  }
  if (!globalThis.process.stdout) {
    globalThis.process.stdout = {
      isTTY: Deno.core.ops.op_is_tty(1),
      columns: 80,
      rows: 24,
      write: function(data) { return Deno.core.ops.op_write_stdout(String(data)); },
      on: function(_event, _cb) { return this; },
      off: function(_event, _cb) { return this; },
      once: function(_event, _cb) { return this; },
      removeListener: function(_event, _cb) { return this; },
      end: function() {},
    };
  }
  if (!globalThis.process.stderr) {
    globalThis.process.stderr = {
      isTTY: Deno.core.ops.op_is_tty(2),
      columns: 80,
      rows: 24,
      write: function(data) { return Deno.core.ops.op_write_stderr(String(data)); },
      on: function(_event, _cb) { return this; },
      off: function(_event, _cb) { return this; },
      once: function(_event, _cb) { return this; },
      removeListener: function(_event, _cb) { return this; },
      end: function() {},
    };
  }
  if (!globalThis.process.stdin) {
    globalThis.process.stdin = {
      isTTY: Deno.core.ops.op_is_tty(0),
      isRaw: false,
      setRawMode: function(_mode) { return this; },
      on: function(_event, _cb) { return this; },
      off: function(_event, _cb) { return this; },
      once: function(_event, _cb) { return this; },
      removeListener: function(_event, _cb) { return this; },
      resume: function() { return this; },
      pause: function() { return this; },
    };
  }
  if (!globalThis.process.binding) {
    var _bindingCache = {};
    globalThis.process.binding = function(name) {
      if (_bindingCache[name]) return _bindingCache[name];
      if (name === 'constants') {
        _bindingCache[name] = { fs: Deno.core.ops.op_fs_constants() };
        return _bindingCache[name];
      }
      if (name === 'buffer') {
        _bindingCache[name] = { kStringMaxLength: 536870888 };
        return _bindingCache[name];
      }
      throw new Error('No such binding: ' + name);
    };
  }
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    #[test]
    fn test_process_env_reads_existing_var() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", "typeof process.env.HOME")
            .unwrap();
        assert_eq!(result, serde_json::json!("string"));
    }

    #[test]
    fn test_process_env_nonexistent_returns_undefined() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                "process.env.VERTZ_NONEXISTENT_VAR_12345 === undefined",
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_process_cwd_is_a_function() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt.execute_script("<test>", "typeof process.cwd").unwrap();
        assert_eq!(result, serde_json::json!("function"));
    }

    #[test]
    fn test_process_cwd_returns_string() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt.execute_script("<test>", "typeof process.cwd()").unwrap();
        assert_eq!(result, serde_json::json!("string"));
    }

    #[test]
    fn test_process_cwd_returns_actual_directory() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt.execute_script("<test>", "process.cwd()").unwrap();
        let expected = std::env::current_dir()
            .unwrap()
            .to_string_lossy()
            .to_string();
        assert_eq!(result, serde_json::json!(expected));
    }

    #[test]
    fn test_process_env_custom_var() {
        std::env::set_var("VERTZ_TEST_ENV_VAR", "hello_vertz");
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", "process.env.VERTZ_TEST_ENV_VAR")
            .unwrap();
        assert_eq!(result, serde_json::json!("hello_vertz"));
        std::env::remove_var("VERTZ_TEST_ENV_VAR");
    }

    #[test]
    fn test_process_env_set_var() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                "process.env.VERTZ_SET_TEST = 'set_value'; process.env.VERTZ_SET_TEST",
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("set_value"));
        std::env::remove_var("VERTZ_SET_TEST");
    }

    #[test]
    fn test_process_chdir_is_a_function() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt.execute_script("<test>", "typeof process.chdir").unwrap();
        assert_eq!(result, serde_json::json!("function"));
    }

    #[test]
    fn test_process_chdir_changes_directory() {
        let original = std::env::current_dir().unwrap();
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const before = process.cwd();
                process.chdir('/tmp');
                const after = process.cwd();
                [before !== '/tmp' && before !== '/private/tmp', after === '/tmp' || after === '/private/tmp']
                "#,
            )
            .unwrap();
        let arr = result.as_array().unwrap();
        assert!(arr[0].as_bool().unwrap(), "Before should not be /tmp");
        assert!(arr[1].as_bool().unwrap(), "After should be /tmp");
        // Restore
        std::env::set_current_dir(&original).unwrap();
    }

    #[test]
    fn test_process_chdir_invalid_directory_throws() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt.execute_script(
            "<test>",
            r#"
            try {
                process.chdir('/nonexistent_vertz_test_dir_12345');
                'no_error'
            } catch (e) {
                e.message.includes('Failed to change directory') ? 'correct_error' : e.message
            }
            "#,
        );
        assert_eq!(result.unwrap(), "correct_error");
    }

    #[test]
    fn test_process_env_delete_var() {
        std::env::set_var("VERTZ_DELETE_TEST", "to_delete");
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                "delete process.env.VERTZ_DELETE_TEST; process.env.VERTZ_DELETE_TEST === undefined",
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_process_env_spread_includes_set_vars() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                "process.env.VERTZ_SPREAD_TEST = 'spread_val'; const copy = {...process.env}; copy.VERTZ_SPREAD_TEST",
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("spread_val"));
        std::env::remove_var("VERTZ_SPREAD_TEST");
    }

    #[test]
    fn test_process_env_object_keys_includes_set_vars() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                "process.env.VERTZ_KEYS_TEST = 'keys_val'; Object.keys(process.env).includes('VERTZ_KEYS_TEST')",
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
        std::env::remove_var("VERTZ_KEYS_TEST");
    }

    #[test]
    fn test_process_env_not_reassignable() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        // Assigning to process.env should silently fail (non-writable),
        // and the proxy should remain functional.
        let result = rt
            .execute_script(
                "<test>",
                "process.env.VERTZ_REASSIGN_TEST = 'before'; process.env = {}; process.env.VERTZ_REASSIGN_TEST",
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("before"));
        std::env::remove_var("VERTZ_REASSIGN_TEST");
    }

    #[test]
    fn test_process_exit_is_a_function() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt.execute_script("<test>", "typeof process.exit").unwrap();
        assert_eq!(result, serde_json::json!("function"));
    }

    #[test]
    fn test_process_stdout_write_is_a_function() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", "typeof process.stdout.write")
            .unwrap();
        assert_eq!(result, serde_json::json!("function"));
    }

    #[test]
    fn test_process_stderr_write_is_a_function() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", "typeof process.stderr.write")
            .unwrap();
        assert_eq!(result, serde_json::json!("function"));
    }

    #[test]
    fn test_process_stdin_has_is_tty() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", "typeof process.stdin.isTTY")
            .unwrap();
        assert_eq!(result, serde_json::json!("boolean"));
    }

    #[test]
    fn test_process_stdout_has_is_tty() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", "typeof process.stdout.isTTY")
            .unwrap();
        assert_eq!(result, serde_json::json!("boolean"));
    }

    #[test]
    fn test_process_next_tick_is_a_function() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", "typeof process.nextTick")
            .unwrap();
        assert_eq!(result, serde_json::json!("function"));
    }

    #[test]
    fn test_process_argv_is_an_array() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", "Array.isArray(process.argv)")
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    fn test_process_arch_is_a_string() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt.execute_script("<test>", "typeof process.arch").unwrap();
        assert_eq!(result, serde_json::json!("string"));
    }

    #[test]
    fn test_process_arch_returns_known_value() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt.execute_script("<test>", "process.arch").unwrap();
        let arch = result.as_str().unwrap();
        assert!(
            ["x64", "arm64", "ia32", "arm"].contains(&arch),
            "Unexpected arch: {}",
            arch
        );
    }

    #[test]
    fn test_process_binding_is_a_function() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", "typeof process.binding")
            .unwrap();
        assert_eq!(result, serde_json::json!("function"));
    }

    #[test]
    fn test_process_binding_constants_returns_object() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", "typeof process.binding('constants')")
            .unwrap();
        assert_eq!(result, serde_json::json!("object"));
    }

    #[test]
    fn test_process_binding_constants_has_fs_open_flags() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const c = process.binding('constants');
                const fs = c.fs || c;
                ({
                    hasAppend: typeof fs.O_APPEND === 'number',
                    hasCreat: typeof fs.O_CREAT === 'number',
                    hasExcl: typeof fs.O_EXCL === 'number',
                    hasRdonly: typeof fs.O_RDONLY === 'number',
                    hasRdwr: typeof fs.O_RDWR === 'number',
                    hasTrunc: typeof fs.O_TRUNC === 'number',
                    hasWronly: typeof fs.O_WRONLY === 'number',
                    hasSync: typeof fs.O_SYNC === 'number',
                    hasNoctty: typeof fs.O_NOCTTY === 'number',
                    hasNofollow: typeof fs.O_NOFOLLOW === 'number',
                })
                "#,
            )
            .unwrap();
        assert_eq!(result["hasAppend"], serde_json::json!(true));
        assert_eq!(result["hasCreat"], serde_json::json!(true));
        assert_eq!(result["hasExcl"], serde_json::json!(true));
        assert_eq!(result["hasRdonly"], serde_json::json!(true));
        assert_eq!(result["hasRdwr"], serde_json::json!(true));
        assert_eq!(result["hasTrunc"], serde_json::json!(true));
        assert_eq!(result["hasWronly"], serde_json::json!(true));
        assert_eq!(result["hasSync"], serde_json::json!(true));
        assert_eq!(result["hasNoctty"], serde_json::json!(true));
        assert_eq!(result["hasNofollow"], serde_json::json!(true));
    }

    #[test]
    fn test_process_binding_constants_fs_rdonly_is_zero() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const c = process.binding('constants');
                const fs = c.fs || c;
                fs.O_RDONLY
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(0));
    }

    #[test]
    fn test_process_binding_unknown_throws() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                try {
                    process.binding('nonexistent_binding');
                    'no_error'
                } catch (e) {
                    e.message.includes('No such binding') ? 'correct_error' : e.message
                }
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("correct_error"));
    }

    #[test]
    fn test_process_binding_buffer_returns_object() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", "typeof process.binding('buffer')")
            .unwrap();
        assert_eq!(result, serde_json::json!("object"));
    }
}
