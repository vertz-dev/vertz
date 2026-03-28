use deno_core::op2;
use deno_core::OpDecl;

/// Get an environment variable. Returns null if not set.
#[op2]
#[string]
pub fn op_env_get(#[string] key: String) -> Option<String> {
    std::env::var(&key).ok()
}

/// Get the op declarations for env ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![op_env_get()]
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
