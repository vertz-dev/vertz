use deno_core::op2;
use deno_core::OpDecl;

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

/// Get the current working directory.
#[op2]
#[string]
pub fn op_cwd() -> Result<String, deno_core::error::AnyError> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| deno_core::error::type_error(format!("Failed to get current directory: {e}")))
}

/// Get the op declarations for env ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![op_env_get(), op_env_set(), op_env_remove(), op_cwd()]
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
  });

  if (!globalThis.process) {
    globalThis.process = {};
  }
  globalThis.process.env = envProxy;
  if (!globalThis.process.cwd) {
    globalThis.process.cwd = () => Deno.core.ops.op_cwd();
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
}
