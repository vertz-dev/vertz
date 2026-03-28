use deno_core::op2;
use deno_core::OpDecl;

#[op2]
#[string]
pub fn op_crypto_random_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Get the op declarations for crypto ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![op_crypto_random_uuid()]
}

/// JavaScript bootstrap code for crypto.randomUUID().
pub const CRYPTO_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  if (!globalThis.crypto) {
    globalThis.crypto = {};
  }
  globalThis.crypto.randomUUID = () => Deno.core.ops.op_crypto_random_uuid();
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    #[test]
    fn test_crypto_random_uuid_format() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt.execute_script("<test>", "crypto.randomUUID()").unwrap();
        let uuid_str = result.as_str().unwrap();
        assert_eq!(uuid_str.len(), 36);
        let parts: Vec<&str> = uuid_str.split('-').collect();
        assert_eq!(parts.len(), 5);
        assert_eq!(parts[0].len(), 8);
        assert_eq!(parts[1].len(), 4);
        assert_eq!(parts[2].len(), 4);
        assert_eq!(parts[3].len(), 4);
        assert_eq!(parts[4].len(), 12);
        assert!(parts[2].starts_with('4'));
    }

    #[test]
    fn test_crypto_random_uuid_unique() {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
            const a = crypto.randomUUID();
            const b = crypto.randomUUID();
            [a, b, a !== b]
        "#,
            )
            .unwrap();
        let arr = result.as_array().unwrap();
        assert!(arr[2].as_bool().unwrap(), "UUIDs should be unique");
    }
}
