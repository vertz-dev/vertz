use std::time::Instant;

use deno_core::op2;
use deno_core::OpDecl;
use deno_core::OpState;

/// State for performance operations -- tracks when the runtime started.
pub struct PerformanceState {
    pub start_time: Instant,
}

/// Get high-resolution timestamp in milliseconds since runtime start.
#[op2(fast)]
pub fn op_performance_now(state: &mut OpState) -> f64 {
    let perf_state = state.borrow::<PerformanceState>();
    perf_state.start_time.elapsed().as_secs_f64() * 1000.0
}

/// Get the op declarations for performance ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![op_performance_now()]
}

/// JavaScript bootstrap code for performance.now().
pub const PERFORMANCE_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  if (!globalThis.performance) {
    globalThis.performance = {};
  }
  globalThis.performance.now = () => Deno.core.ops.op_performance_now();
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    #[test]
    fn test_performance_now_returns_number() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", "typeof performance.now()")
            .unwrap();
        assert_eq!(result, serde_json::json!("number"));
    }

    #[test]
    fn test_performance_now_is_positive() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script("<test>", "performance.now() >= 0")
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_performance_now_monotonically_increases() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
            const a = performance.now();
            let x = 0; for (let i = 0; i < 100000; i++) x += i;
            const b = performance.now();
            b > a;
        "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }
}
