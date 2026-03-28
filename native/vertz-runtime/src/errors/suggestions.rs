/// Analyze error messages and generate actionable fix suggestions.
///
/// Each suggestion is a short, concrete instruction that tells the developer
/// exactly what to do to fix the error. No vague "check your code" messages.

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
                    "Package '{}' not found. Run `bun add {}` to install it.",
                    name, name
                ));
            }
            return Some(format!(
                "Module '{}' not found. Run `bun add {}` to install it, or check the import path.",
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
                "Package '{}' is not installed. Run `bun add {}` to install it.",
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
        assert!(suggestion.unwrap().contains("bun add"));
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
        assert!(suggestion.unwrap().contains("bun add zod"));
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
