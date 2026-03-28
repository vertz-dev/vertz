use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use crate::magic_string::MagicString;
use crate::ComponentInfoOutput;

/// Inject Fast Refresh preamble and epilogue for HMR support.
///
/// Generates:
/// 1. Preamble — module-level runtime destructuring from globalThis
/// 2. Per-component wrappers — scope capture + registration
/// 3. Epilogue — perform call to trigger DOM replacement
pub fn inject_fast_refresh(
    ms: &mut MagicString,
    components: &[ComponentInfoOutput],
    source: &str,
    module_id: &str,
) {
    if components.is_empty() {
        return;
    }

    let escaped_id = module_id.replace('\\', "\\\\").replace('\'', "\\'");
    let preamble = generate_preamble(&escaped_id);
    ms.prepend(&preamble);

    let mut epilogue = String::new();
    for comp in components {
        let body = &source[comp.body_start as usize..comp.body_end as usize];
        let hash = hash_component_body(body);
        epilogue.push_str(&generate_wrapper(&comp.name, &hash));
    }
    epilogue.push_str(&generate_perform());
    ms.append(&epilogue);
}

/// Generate the Fast Refresh preamble injected at the top of a module.
fn generate_preamble(escaped_module_id: &str) -> String {
    let noop = "() => {}";
    let noop_arr = "() => []";
    let noop_null = "() => null";
    let noop_passthrough = "(_m, _n, el) => el";

    format!(
        concat!(
            "const __$fr = globalThis[Symbol.for('vertz:fast-refresh')] ?? {{}};\n",
            "const {{ ",
            "__$refreshReg = {noop}, ",
            "__$refreshTrack = {noop_passthrough}, ",
            "__$refreshPerform = {noop}, ",
            "pushScope: __$pushScope = {noop_arr}, ",
            "popScope: __$popScope = {noop}, ",
            "_tryOnCleanup: __$tryCleanup = {noop}, ",
            "runCleanups: __$runCleanups = {noop}, ",
            "getContextScope: __$getCtx = {noop_null}, ",
            "setContextScope: __$setCtx = {noop_null}, ",
            "startSignalCollection: __$startSigCol = {noop}, ",
            "stopSignalCollection: __$stopSigCol = {noop_arr} }} = __$fr;\n",
            "const __$moduleId = '{module_id}';\n",
        ),
        noop = noop,
        noop_passthrough = noop_passthrough,
        noop_arr = noop_arr,
        noop_null = noop_null,
        module_id = escaped_module_id,
    )
}

/// Generate the wrapper and registration code for a single component.
fn generate_wrapper(component_name: &str, component_hash: &str) -> String {
    format!(
        concat!(
            "\nconst __$orig_{name} = {name};\n",
            "{name} = function(...__$args) {{\n",
            "  const __$scope = __$pushScope();\n",
            "  const __$ctx = __$getCtx();\n",
            "  __$startSigCol();\n",
            "  const __$ret = __$orig_{name}.apply(this, __$args);\n",
            "  const __$sigs = __$stopSigCol();\n",
            "  __$popScope();\n",
            "  if (__$scope.length > 0) {{\n",
            "    __$tryCleanup(() => __$runCleanups(__$scope));\n",
            "  }}\n",
            "  return __$refreshTrack(__$moduleId, '{name}', __$ret, __$args, __$scope, __$ctx, __$sigs);\n",
            "}};\n",
            "__$refreshReg(__$moduleId, '{name}', {name}, '{hash}');\n",
        ),
        name = component_name,
        hash = component_hash,
    )
}

/// Generate the perform call (module epilogue).
fn generate_perform() -> String {
    "__$refreshPerform(__$moduleId);\n".to_string()
}

/// Hash a component body to produce a deterministic string.
/// Uses the same approach as Bun.hash but via Rust's default hasher.
fn hash_component_body(body: &str) -> String {
    let mut hasher = DefaultHasher::new();
    body.hash(&mut hasher);
    let hash = hasher.finish();
    // Convert to base36 like the TS version (Bun.hash().toString(36))
    to_base36(hash)
}

fn to_base36(mut n: u64) -> String {
    if n == 0 {
        return "0".to_string();
    }
    const CHARS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    let mut result = Vec::new();
    while n > 0 {
        result.push(CHARS[(n % 36) as usize]);
        n /= 36;
    }
    result.reverse();
    String::from_utf8(result).unwrap()
}
