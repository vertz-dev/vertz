/// Analyze error messages and generate actionable fix suggestions.
///
/// Each suggestion is a short, concrete instruction that tells the developer
/// exactly what to do to fix the error. No vague "check your code" messages.
///
/// Generate a fix suggestion for a compilation/build error.
pub fn suggest_build_fix(message: &str) -> Option<String> {
    // Unexpected token / syntax errors
    if message.contains("Unexpected token") || message.contains("Expected") {
        if message.contains("')'") || message.contains("'}'") || message.contains("']'") {
            return Some("Check for mismatched brackets or missing closing delimiters.".into());
        }
        if message.contains("';'") {
            return Some("Add a semicolon at the end of the statement.".into());
        }
        return Some("Check for syntax errors near the highlighted line. Common causes: missing comma, extra bracket, or unclosed string.".into());
    }

    // JSX errors
    if message.contains("JSX") && message.contains("closing tag") {
        return Some("A JSX element is missing its closing tag. Ensure every <Component> has a matching </Component> or use self-closing <Component />.".into());
    }

    // Import errors from compiler
    if message.contains("Cannot find module") || message.contains("Could not resolve") {
        let module = extract_module_name(message);
        if let Some(name) = module {
            if name.starts_with('.') {
                return Some(format!(
                    "The relative import '{}' could not be resolved. Check:\n  1. The file exists at the expected path\n  2. The file extension is correct (.ts, .tsx, .js)",
                    name
                ));
            }
            if name.starts_with('@') {
                return Some(format!(
                    "Package '{}' not found. Run `vertz add {}` to install it.",
                    name, name
                ));
            }
            return Some(format!(
                "Module '{}' not found. Run `vertz add {}` to install it, or check the import path.",
                name, name
            ));
        }
    }

    // Type annotation leftovers
    if message.contains("Unexpected ':' ") || message.contains("type annotation") {
        return Some("A TypeScript type annotation wasn't stripped by the compiler. This is a compiler bug — try restarting the dev server.".into());
    }

    // Duplicate identifier
    if message.contains("has already been declared") || message.contains("Duplicate") {
        let ident = extract_identifier(message);
        if let Some(name) = ident {
            return Some(format!(
                "'{}' is declared multiple times. Check if it's imported and also defined locally. Remove the duplicate.",
                name
            ));
        }
        return Some(
            "A variable or import is declared more than once. Remove the duplicate declaration."
                .into(),
        );
    }

    None
}

/// Generate a fix suggestion for a module resolution error.
pub fn suggest_resolve_fix(message: &str, specifier: &str) -> Option<String> {
    // Missing export
    if message.contains("does not provide an export named") {
        let export_name = extract_quoted(message, "export named '", "'");
        if let Some(name) = &export_name {
            // Known internal APIs
            if name == "domEffect"
                || name == "lifecycleEffect"
                || name == "startSignalCollection"
                || name == "stopSignalCollection"
            {
                return Some(format!(
                    "'{}' is an internal API. Import it from '@vertz/ui/internals' instead of '@vertz/ui'.",
                    name
                ));
            }
            return Some(format!(
                "'{}' is not exported from '{}'. Check the package's documentation for available exports, or verify the spelling.",
                name, specifier
            ));
        }
    }

    // Package not found at all
    if message.contains("not found") || message.contains("404") {
        if specifier.starts_with('@') {
            let (pkg, _) = crate::deps::resolve::split_package_specifier(specifier);
            return Some(format!(
                "Package '{}' is not installed. Run `vertz add {}` to install it.",
                pkg, pkg
            ));
        }
        return Some(format!(
            "Module '{}' could not be found. Verify the import path or install the package.",
            specifier
        ));
    }

    None
}

/// Generate a fix suggestion for an SSR error.
pub fn suggest_ssr_fix(message: &str) -> Option<String> {
    // Window/document not available
    if message.contains("window is not defined") || message.contains("document is not defined") {
        return Some(
            "Browser APIs (window, document) are not available during SSR. \
             Wrap browser-only code in a `domEffect()` or check `typeof window !== 'undefined'`."
                .into(),
        );
    }

    // localStorage/sessionStorage
    if message.contains("localStorage") || message.contains("sessionStorage") {
        return Some(
            "Storage APIs are not available during SSR. \
             Move storage access into `domEffect()` or a client-only effect."
                .into(),
        );
    }

    // Context errors during SSR
    if message.contains("must be called within") && message.contains("Provider") {
        return Some(
            "A useContext() call ran outside its Provider during SSR. \
             Ensure the Provider wraps the component tree in both client and SSR entry points."
                .into(),
        );
    }

    None
}

/// Generate a fix suggestion for a runtime error.
pub fn suggest_runtime_fix(message: &str) -> Option<String> {
    // Cannot read properties of undefined/null
    if message.contains("Cannot read properties of undefined")
        || message.contains("Cannot read properties of null")
    {
        let prop = extract_quoted(message, "reading '", "'");
        if let Some(name) = prop {
            return Some(format!(
                "Tried to access '.{}' on undefined/null. Check that the object exists before accessing its properties. \
                 Use optional chaining (obj?.{}) or verify the value is defined.",
                name, name
            ));
        }
    }

    // X is not a function
    if message.contains("is not a function") {
        let fn_name = extract_before(message, " is not a function");
        if let Some(name) = fn_name {
            return Some(format!(
                "'{}' is not a function. Check that:\n  1. The import is correct\n  2. The module exports '{}' as a function\n  3. The value isn't undefined (missing export?)",
                name, name
            ));
        }
    }

    // X is not defined
    if message.contains("is not defined") {
        let var_name = extract_before(message, " is not defined");
        if let Some(name) = var_name {
            return Some(format!(
                "'{}' is not defined. Add an import for it or declare it in the current scope.",
                name
            ));
        }
    }

    None
}

/// Generate a fix suggestion for a TypeScript type-check error.
///
/// Only provides suggestions for errors where the fix is NOT obvious from the
/// error message itself. Self-explanatory errors (e.g., TS2322 "type X is not
/// assignable to type Y") get no suggestion — the error message is sufficient.
pub fn suggest_typecheck_fix(ts_code: u32) -> Option<String> {
    match ts_code {
        // TS2307: Cannot find module 'X' or its corresponding type declarations.
        2307 => Some(
            "Check the import path and ensure the package is installed. \
             For untyped packages, install @types/<package>."
                .into(),
        ),
        // TS2304: Cannot find name 'X'.
        2304 => Some(
            "Check that the variable is imported or declared. \
             If it's a global (e.g., `process`, `Buffer`), install the appropriate @types package."
                .into(),
        ),
        // TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'.
        2345 => Some(
            "Check the function signature and verify the argument types match. \
             The function may expect a more specific type than what's being passed."
                .into(),
        ),
        // TS7006: Parameter 'x' implicitly has an 'any' type.
        7006 => Some("Add an explicit type annotation to this parameter.".into()),
        // TS2339: Property 'X' does not exist on type 'Y'.
        2339 => Some(
            "The property doesn't exist on this type. Check spelling, \
             or verify the object's type is what you expect."
                .into(),
        ),
        // TS2551: Property 'X' does not exist on type 'Y'. Did you mean 'Z'?
        2551 => Some(
            "Check the property name — TypeScript suggests a similar name in the error.".into(),
        ),
        // TS1259: Module '"X"' can only be default-imported using the 'esModuleInterop' flag.
        1259 => Some(
            "Add `\"esModuleInterop\": true` to your tsconfig.json compilerOptions, \
             or use `import * as X from 'X'` instead."
                .into(),
        ),
        // Self-explanatory errors (TS2322, etc.) — no suggestion
        _ => None,
    }
}

// ── Helpers ──────────────────────────────────────────────────────

/// Extract a module name from error messages like "Cannot find module './foo'"
fn extract_module_name(message: &str) -> Option<String> {
    extract_quoted(message, "'", "'").or_else(|| extract_quoted(message, "\"", "\""))
}

/// Extract text between delimiters.
fn extract_quoted(message: &str, open: &str, close: &str) -> Option<String> {
    let start = message.find(open)? + open.len();
    let rest = &message[start..];
    let end = rest.find(close)?;
    Some(rest[..end].to_string())
}

/// Extract the word before a pattern.
fn extract_before(message: &str, pattern: &str) -> Option<String> {
    let idx = message.find(pattern)?;
    let before = message[..idx].trim();
    let word_start = before.rfind(|c: char| !c.is_alphanumeric() && c != '_' && c != '$');
    let word = match word_start {
        Some(pos) => &before[pos + 1..],
        None => before,
    };
    if word.is_empty() {
        None
    } else {
        Some(word.to_string())
    }
}

/// Extract an identifier from messages like "'foo' has already been declared"
fn extract_identifier(message: &str) -> Option<String> {
    extract_quoted(message, "'", "'").or_else(|| extract_quoted(message, "\"", "\""))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_suggest_missing_module() {
        let suggestion = suggest_build_fix("Cannot find module './missing-file'");
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("relative import"));
    }

    #[test]
    fn test_suggest_install_package() {
        let suggestion = suggest_build_fix("Cannot find module '@vertz/fetch'");
        assert!(suggestion.is_some());
        let s = suggestion.unwrap();
        assert!(
            s.contains("vertz add"),
            "expected 'vertz add' but got: {}",
            s
        );
        assert!(
            !s.contains("bun add"),
            "should not contain 'bun add' but got: {}",
            s
        );
    }

    #[test]
    fn test_suggest_duplicate_identifier() {
        let suggestion = suggest_build_fix("Identifier 'signal' has already been declared");
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("signal"));
    }

    #[test]
    fn test_suggest_missing_export() {
        let suggestion =
            suggest_resolve_fix("does not provide an export named 'domEffect'", "@vertz/ui");
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("@vertz/ui/internals"));
    }

    #[test]
    fn test_suggest_window_in_ssr() {
        let suggestion = suggest_ssr_fix("ReferenceError: window is not defined");
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("domEffect"));
    }

    #[test]
    fn test_suggest_undefined_property() {
        let suggestion = suggest_runtime_fix("Cannot read properties of undefined (reading 'map')");
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("map"));
    }

    #[test]
    fn test_suggest_not_a_function() {
        let suggestion = suggest_runtime_fix("foo is not a function");
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("foo"));
    }

    #[test]
    fn test_suggest_not_defined() {
        let suggestion = suggest_runtime_fix("myVar is not defined");
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("myVar"));
    }

    #[test]
    fn test_no_suggestion_for_unknown_error() {
        assert!(suggest_build_fix("some random error").is_none());
        assert!(suggest_runtime_fix("some random error").is_none());
        assert!(suggest_ssr_fix("some random error").is_none());
    }

    #[test]
    fn test_suggest_unscoped_package() {
        let suggestion = suggest_build_fix("Cannot find module 'zod'");
        assert!(suggestion.is_some());
        let s = suggestion.unwrap();
        assert!(
            s.contains("vertz add zod"),
            "expected 'vertz add zod' but got: {}",
            s
        );
        assert!(
            !s.contains("bun add"),
            "should not contain 'bun add' but got: {}",
            s
        );
    }

    #[test]
    fn test_suggest_resolve_fix_vertz_add() {
        let suggestion = suggest_resolve_fix("Package not found 404", "@vertz/fetch");
        assert!(suggestion.is_some());
        let s = suggestion.unwrap();
        assert!(
            s.contains("vertz add"),
            "expected 'vertz add' but got: {}",
            s
        );
        assert!(
            !s.contains("bun add"),
            "should not contain 'bun add' but got: {}",
            s
        );
    }

    #[test]
    fn test_suggest_context_provider_ssr() {
        let suggestion =
            suggest_ssr_fix("useSettings must be called within SettingsContext.Provider");
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("Provider"));
    }

    #[test]
    fn test_extract_quoted() {
        assert_eq!(
            extract_quoted("Cannot find module './foo'", "'", "'"),
            Some("./foo".to_string())
        );
        assert_eq!(extract_quoted("no quotes here", "'", "'"), None);
    }

    // ── TypeCheck suggestions ──

    #[test]
    fn test_suggest_typecheck_ts2307_cannot_find_module() {
        let suggestion = suggest_typecheck_fix(2307);
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("import path"));
    }

    #[test]
    fn test_suggest_typecheck_ts2304_cannot_find_name() {
        let suggestion = suggest_typecheck_fix(2304);
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("imported or declared"));
    }

    #[test]
    fn test_suggest_typecheck_ts2345_argument_type_mismatch() {
        let suggestion = suggest_typecheck_fix(2345);
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("function signature"));
    }

    #[test]
    fn test_suggest_typecheck_ts7006_implicit_any() {
        let suggestion = suggest_typecheck_fix(7006);
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("type annotation"));
    }

    #[test]
    fn test_suggest_typecheck_ts2339_property_not_exist() {
        let suggestion = suggest_typecheck_fix(2339);
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("property"));
    }

    #[test]
    fn test_suggest_typecheck_ts2551_did_you_mean() {
        let suggestion = suggest_typecheck_fix(2551);
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("similar name"));
    }

    #[test]
    fn test_suggest_typecheck_ts1259_esmodule_interop() {
        let suggestion = suggest_typecheck_fix(1259);
        assert!(suggestion.is_some());
        assert!(suggestion.unwrap().contains("esModuleInterop"));
    }

    #[test]
    fn test_suggest_typecheck_self_explanatory_returns_none() {
        // TS2322: Type 'X' is not assignable to type 'Y' — self-explanatory
        assert!(suggest_typecheck_fix(2322).is_none());
        // Unknown codes
        assert!(suggest_typecheck_fix(9999).is_none());
    }

    #[test]
    fn test_extract_before() {
        assert_eq!(
            extract_before("foo is not a function", " is not a function"),
            Some("foo".to_string())
        );
        assert_eq!(
            extract_before("myObj.bar is not a function", " is not a function"),
            Some("bar".to_string())
        );
    }
}
