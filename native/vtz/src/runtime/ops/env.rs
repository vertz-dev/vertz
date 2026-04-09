use deno_core::op2;
use deno_core::OpDecl;

/// Get an environment variable. Returns null if not set.
#[op2]
#[string]
pub fn op_env_get(#[string] key: String) -> Option<String> {
    std::env::var(&key).ok()
}

/// Get the current working directory.
#[op2]
#[string]
pub fn op_cwd() -> String {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "/".to_string())
}

/// Get the op declarations for env ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![op_env_get(), op_cwd()]
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
}
