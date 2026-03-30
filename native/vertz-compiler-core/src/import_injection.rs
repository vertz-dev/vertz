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

/// Collect binding names that are already declared in the source code.
///
/// Scans for:
/// - `import { name1, name2 } from '...'` — existing imports (single and multi-line)
/// - `export function name(...)` — exported function declarations
/// - `function name(...)` — local function declarations
/// - `const name =` / `let name =` / `var name =` — variable declarations
/// - `export const name =` / `export let name =` / `export var name =`
///
/// This prevents the import injector from creating duplicate bindings when:
/// 1. A test file manually imports helpers from relative paths
/// 2. A source file defines helpers locally (e.g., `export function __on(...)`)
fn collect_existing_bindings(code: &str) -> std::collections::HashSet<String> {
    let mut existing = std::collections::HashSet::new();

    // First, extract all import bindings using a brace-matching approach
    // that handles multi-line imports like:
    //   import {
    //     __append,
    //     __child,
    //   } from '../element';
    let mut pos = 0;

    while pos < code.len() {
        // Find the next 'import ' keyword at the start of a line (or start of string)
        if let Some(import_start) = code[pos..].find("import ") {
            let abs_start = pos + import_start;

            // Verify it's at the start of a line (or start of code)
            let is_line_start = abs_start == 0
                || code.as_bytes().get(abs_start - 1) == Some(&b'\n')
                || code[..abs_start].trim_end().is_empty();

            if !is_line_start {
                pos = abs_start + 7;
                continue;
            }

            let rest = &code[abs_start + 7..];

            // Skip `import type`
            if rest.starts_with("type ") {
                pos = abs_start + 12;
                continue;
            }

            // Find the opening brace
            if let Some(brace_offset) = rest.find('{') {
                let brace_abs = abs_start + 7 + brace_offset;
                // Find the matching closing brace
                if let Some(close_offset) = code[brace_abs + 1..].find('}') {
                    let names_str = &code[brace_abs + 1..brace_abs + 1 + close_offset];

                    // Check that this is actually an import (has `from` after the brace)
                    let after_brace = &code[brace_abs + 1 + close_offset + 1..];
                    let after_trimmed = after_brace.trim_start();
                    if after_trimmed.starts_with("from") {
                        // Extract binding names
                        for name in names_str.split(',') {
                            let name = name.trim();
                            if let Some((_orig, alias)) = name.split_once(" as ") {
                                let alias = alias.trim();
                                if !alias.is_empty() {
                                    existing.insert(alias.to_string());
                                }
                            } else if !name.is_empty() {
                                existing.insert(name.to_string());
                            }
                        }
                    }

                    pos = brace_abs + 1 + close_offset + 1;
                    continue;
                }
            }

            pos = abs_start + 7;
            continue;
        } else {
            break;
        }
    }

    // Second pass: scan for local declarations (function, const, let, var)
    for line in code.lines() {
        let trimmed = line.trim();

        // Skip imports (already handled above)
        if trimmed.starts_with("import ") {
            continue;
        }

        // Strip `export ` prefix for declaration checks
        let decl = trimmed.strip_prefix("export ").unwrap_or(trimmed);

        // Check function declarations: `function name(` or `function name <`
        if let Some(rest) = decl.strip_prefix("function ") {
            let name = rest.split(['(', '<', ' ']).next().unwrap_or("").trim();
            if !name.is_empty() {
                existing.insert(name.to_string());
            }
            continue;
        }

        // Check variable declarations: `const name =`, `let name =`, `var name =`
        for keyword in &["const ", "let ", "var "] {
            if let Some(rest) = decl.strip_prefix(keyword) {
                // Handle destructuring: skip `const { ... }` and `const [ ... ]`
                let first = rest.trim_start().as_bytes().first();
                if first == Some(&b'{') || first == Some(&b'[') {
                    break;
                }
                let name = rest.split(['=', ':', ' ', ';']).next().unwrap_or("").trim();
                if !name.is_empty() {
                    existing.insert(name.to_string());
                }
                break;
            }
        }
    }

    existing
}

/// Strip comments from code for scanning purposes.
///
/// Removes:
/// - Single-line comments: `// ...`
/// - Block comments: `/* ... */` (including multi-line)
/// - JSDoc comments: `/** ... */`
///
/// This prevents false-positive helper detection in comment text.
fn strip_comments(code: &str) -> String {
    let chars: Vec<char> = code.chars().collect();
    let len = chars.len();
    let mut result = String::with_capacity(len);
    let mut i = 0;

    while i < len {
        if i + 1 < len && chars[i] == '/' {
            if chars[i + 1] == '/' {
                // Single-line comment — skip to end of line
                while i < len && chars[i] != '\n' {
                    i += 1;
                }
                continue;
            } else if chars[i + 1] == '*' {
                // Block/JSDoc comment — skip to */
                i += 2;
                while i + 1 < len && !(chars[i] == '*' && chars[i + 1] == '/') {
                    i += 1;
                }
                if i + 1 < len {
                    i += 2; // skip */
                }
                continue;
            }
        }

        // Skip string literals to avoid false matches inside strings
        if chars[i] == '\'' || chars[i] == '"' || chars[i] == '`' {
            let quote = chars[i];
            result.push(chars[i]);
            i += 1;
            while i < len && chars[i] != quote {
                if chars[i] == '\\' && i + 1 < len {
                    result.push(chars[i]);
                    i += 1;
                }
                result.push(chars[i]);
                i += 1;
            }
            if i < len {
                result.push(chars[i]);
                i += 1;
            }
            continue;
        }

        result.push(chars[i]);
        i += 1;
    }

    result
}

/// Scan compiled output for runtime function usage and prepend import statements.
///
/// Uses a simple string-scanning approach: checks if `helperName(` exists in the
/// compiled output (excluding comments and strings). This is resilient to different
/// transform output patterns and naturally picks up any helper that's actually used.
///
/// Skips injection of any binding that is already declared (imported or locally defined),
/// preventing "Identifier already declared" errors.
pub fn inject_imports(ms: &mut MagicString, target: &str) {
    let output = ms.to_string();

    // Collect names already declared (imports + local functions/variables)
    // to avoid duplicate bindings
    let existing = collect_existing_bindings(&output);

    // Strip comments before scanning for helper usage patterns.
    // This prevents false matches like `__child()` in JSDoc comments
    // from triggering spurious import injection.
    let code_only = strip_comments(&output);

    let mut runtime_imports: Vec<&str> = Vec::new();
    let mut dom_imports: Vec<&str> = Vec::new();

    // Scan for runtime features (in code only, not comments)
    for &feature in RUNTIME_FEATURES {
        if existing.contains(feature) {
            continue;
        }
        let pattern = format!("{feature}(");
        if code_only.contains(&pattern) {
            runtime_imports.push(feature);
        }
    }

    // Scan for DOM helpers (in code only, not comments)
    for &helper in DOM_HELPERS {
        if existing.contains(helper) {
            continue;
        }
        let pattern = format!("{helper}(");
        if code_only.contains(&pattern) {
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
