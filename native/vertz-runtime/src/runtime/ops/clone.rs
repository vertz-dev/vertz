use deno_core::v8;
use deno_core::v8::ValueDeserializerHelper;
use deno_core::v8::ValueSerializerHelper;
use deno_core::OpDecl;

struct SerializerDelegate;

impl v8::ValueSerializerImpl for SerializerDelegate {
    fn throw_data_clone_error(
        &self,
        scope: &mut v8::HandleScope<'_>,
        message: v8::Local<'_, v8::String>,
    ) {
        let error = v8::Exception::type_error(scope, message);
        scope.throw_exception(error);
    }
}

struct DeserializerDelegate;

impl v8::ValueDeserializerImpl for DeserializerDelegate {}

/// No native ops — structuredClone is registered as a v8 function in bootstrap.
pub fn op_decls() -> Vec<OpDecl> {
    vec![]
}

/// Performs V8 structured clone: serialize then deserialize.
/// Called from the bootstrap JS binding.
fn structured_clone_callback(
    scope: &mut v8::HandleScope,
    args: v8::FunctionCallbackArguments,
    mut rv: v8::ReturnValue,
) {
    let value = args.get(0);

    // Serialize
    let serializer = v8::ValueSerializer::new(scope, Box::new(SerializerDelegate));
    serializer.write_header();
    let context = scope.get_current_context();
    match serializer.write_value(context, value) {
        Some(true) => {}
        _ => {
            // Exception was already thrown by the delegate
            return;
        }
    }
    let data = serializer.release();

    // Deserialize
    let deserializer = v8::ValueDeserializer::new(scope, Box::new(DeserializerDelegate), &data);
    let context = scope.get_current_context();
    match deserializer.read_header(context) {
        Some(true) => {}
        _ => {
            let msg =
                v8::String::new(scope, "DataCloneError: Failed to read serialized data.").unwrap();
            let error = v8::Exception::type_error(scope, msg);
            scope.throw_exception(error);
            return;
        }
    }
    match deserializer.read_value(context) {
        Some(val) => rv.set(val),
        None => {
            let msg = v8::String::new(scope, "DataCloneError: Failed to deserialize cloned data.")
                .unwrap();
            let error = v8::Exception::type_error(scope, msg);
            scope.throw_exception(error);
        }
    }
}

/// Register the structuredClone function on the given JsRuntime.
/// Must be called after runtime creation.
pub fn register_structured_clone(runtime: &mut deno_core::JsRuntime) {
    let context = runtime.main_context();
    let scope = &mut runtime.handle_scope();
    let context_local = v8::Local::new(scope, context);
    let global = context_local.global(scope);

    let name = v8::String::new(scope, "structuredClone").unwrap();
    let func = v8::Function::new(scope, structured_clone_callback).unwrap();
    global.set(scope, name.into(), func.into());
}

/// No bootstrap JS — registration is done via `register_structured_clone`.
pub const CLONE_BOOTSTRAP_JS: &str = "";

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap()
    }

    #[test]
    fn test_structured_clone_plain_object() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const original = { a: 1, b: 'hello', c: true };
                const clone = structuredClone(original);
                clone.a === 1 && clone.b === 'hello' && clone.c === true
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_structured_clone_creates_deep_copy() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const original = { nested: { x: 42 } };
                const clone = structuredClone(original);
                clone.nested.x = 99;
                original.nested.x === 42 && clone.nested.x === 99
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_structured_clone_preserves_date() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const date = new Date('2025-01-01');
                const clone = structuredClone({ d: date });
                clone.d instanceof Date && clone.d.getTime() === date.getTime()
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_structured_clone_preserves_map() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const map = new Map([['key', 'value']]);
                const clone = structuredClone({ m: map });
                clone.m instanceof Map && clone.m.get('key') === 'value'
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_structured_clone_preserves_set() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const set = new Set([1, 2, 3]);
                const clone = structuredClone({ s: set });
                clone.s instanceof Set && clone.s.has(1) && clone.s.has(2) && clone.s.has(3) && clone.s.size === 3
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_structured_clone_preserves_regexp() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const re = /hello/gi;
                const clone = structuredClone({ r: re });
                clone.r instanceof RegExp && clone.r.source === 'hello' && clone.r.flags === 'gi'
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_structured_clone_preserves_arraybuffer() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const buf = new Uint8Array([1, 2, 3]).buffer;
                const clone = structuredClone(buf);
                clone instanceof ArrayBuffer &&
                clone.byteLength === 3 &&
                new Uint8Array(clone)[0] === 1 &&
                new Uint8Array(clone)[1] === 2 &&
                new Uint8Array(clone)[2] === 3
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_structured_clone_handles_circular_reference() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const obj = { a: 1 };
                obj.self = obj;
                const clone = structuredClone(obj);
                clone.a === 1 && clone.self === clone && clone !== obj
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_structured_clone_array() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const arr = [1, 'two', { three: 3 }];
                const clone = structuredClone(arr);
                Array.isArray(clone) &&
                clone.length === 3 &&
                clone[0] === 1 &&
                clone[1] === 'two' &&
                clone[2].three === 3 &&
                clone !== arr &&
                clone[2] !== arr[2]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_structured_clone_null_and_primitives() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                [
                    structuredClone(null) === null,
                    structuredClone(42) === 42,
                    structuredClone('hello') === 'hello',
                    structuredClone(true) === true,
                    structuredClone(undefined) === undefined,
                ]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([true, true, true, true, true]));
    }
}
