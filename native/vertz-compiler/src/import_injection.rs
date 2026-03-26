use crate::magic_string::MagicString;

/// DOM helper function names that should be imported from @vertz/ui/internals.
const DOM_HELPERS: &[&str] = &[
    "__append",
    "__attr",
    "__child",
    "__classList",
    "__conditional",
    "__discardMountFrame",
    "__element",
    "__enterChildren",
    "__exitChildren",
    "__flushMountFrame",
    "__insert",
    "__list",
    "__listValue",
    "__on",
    "__prop",
    "__pushMountFrame",
    "__show",
    "__spread",
    "__staticText",
    "__styleStr",
];

/// Runtime function names that should be imported from @vertz/ui.
const RUNTIME_FEATURES: &[&str] = &["signal", "computed", "effect", "batch", "untrack"];

/// Scan compiled output for runtime function usage and prepend import statements.
///
/// Uses a simple string-scanning approach: checks if `helperName(` exists in the
/// compiled output. This is resilient to different transform output patterns and
/// naturally picks up any helper that's actually used.
pub fn inject_imports(ms: &mut MagicString, target: &str) {
    let output = ms.to_string();

    let mut runtime_imports: Vec<&str> = Vec::new();
    let mut dom_imports: Vec<&str> = Vec::new();

    // Scan for runtime features
    for &feature in RUNTIME_FEATURES {
        let pattern = format!("{feature}(");
        if output.contains(&pattern) {
            runtime_imports.push(feature);
        }
    }

    // Scan for DOM helpers
    for &helper in DOM_HELPERS {
        let pattern = format!("{helper}(");
        if output.contains(&pattern) {
            dom_imports.push(helper);
        }
    }

    if runtime_imports.is_empty() && dom_imports.is_empty() {
        return;
    }

    // Sort alphabetically
    runtime_imports.sort();
    dom_imports.sort();

    let internals_source = if target == "tui" {
        "@vertz/tui/internals"
    } else {
        "@vertz/ui/internals"
    };

    let mut import_lines: Vec<String> = Vec::new();

    if !runtime_imports.is_empty() {
        import_lines.push(format!(
            "import {{ {} }} from '@vertz/ui';",
            runtime_imports.join(", ")
        ));
    }

    if !dom_imports.is_empty() {
        import_lines.push(format!(
            "import {{ {} }} from '{}';",
            dom_imports.join(", "),
            internals_source
        ));
    }

    let import_block = format!("{}\n", import_lines.join("\n"));
    ms.prepend(&import_block);
}
