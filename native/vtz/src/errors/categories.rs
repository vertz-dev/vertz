use serde::{Deserialize, Serialize};

/// Severity level for a diagnostic.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    #[default]
    Error,
    Warning,
}

/// Error category with priority ordering.
///
/// Higher-priority errors suppress lower-priority ones.
/// Order: Build > Resolve > TypeCheck > Ssr > Runtime
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ErrorCategory {
    /// Client runtime errors (lowest priority, debounced 100ms).
    Runtime = 0,
    /// SSR render errors.
    Ssr = 1,
    /// TypeScript type-check errors (tsc/tsgo output).
    TypeCheck = 2,
    /// Module resolution failures.
    Resolve = 3,
    /// Compilation/parse errors (highest priority).
    Build = 4,
}

impl ErrorCategory {
    /// Return the priority level (higher = more important).
    pub fn priority(self) -> u8 {
        self as u8
    }

    /// Check if this category suppresses another.
    pub fn suppresses(self, other: ErrorCategory) -> bool {
        self.priority() > other.priority()
    }
}

impl std::fmt::Display for ErrorCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ErrorCategory::Build => write!(f, "build"),
            ErrorCategory::Resolve => write!(f, "resolve"),
            ErrorCategory::TypeCheck => write!(f, "typecheck"),
            ErrorCategory::Ssr => write!(f, "ssr"),
            ErrorCategory::Runtime => write!(f, "runtime"),
        }
    }
}

/// A structured dev server error with source location and context.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DevError {
    /// Error category (build, resolve, typecheck, ssr, runtime).
    pub category: ErrorCategory,
    /// Severity level (error or warning).
    #[serde(default)]
    pub severity: Severity,
    /// Human-readable error message.
    pub message: String,
    /// Absolute file path where the error occurred.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    /// Line number (1-indexed).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    /// Column number (1-indexed).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub column: Option<u32>,
    /// Code snippet around the error (a few lines of context).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_snippet: Option<String>,
    /// Actionable suggestion for how to fix the error.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
}

impl DevError {
    /// Create a build error from compilation diagnostics.
    pub fn build(message: impl Into<String>) -> Self {
        Self {
            category: ErrorCategory::Build,
            severity: Severity::Error,
            message: message.into(),
            file: None,
            line: None,
            column: None,
            code_snippet: None,
            suggestion: None,
        }
    }

    /// Create a resolve error (missing module).
    pub fn resolve(message: impl Into<String>) -> Self {
        Self {
            category: ErrorCategory::Resolve,
            severity: Severity::Error,
            message: message.into(),
            file: None,
            line: None,
            column: None,
            code_snippet: None,
            suggestion: None,
        }
    }

    /// Create an SSR error.
    pub fn ssr(message: impl Into<String>) -> Self {
        Self {
            category: ErrorCategory::Ssr,
            severity: Severity::Error,
            message: message.into(),
            file: None,
            line: None,
            column: None,
            code_snippet: None,
            suggestion: None,
        }
    }

    /// Create a typecheck error (from tsc/tsgo output).
    pub fn typecheck(message: impl Into<String>) -> Self {
        Self {
            category: ErrorCategory::TypeCheck,
            severity: Severity::Error,
            message: message.into(),
            file: None,
            line: None,
            column: None,
            code_snippet: None,
            suggestion: None,
        }
    }

    /// Create a runtime error.
    pub fn runtime(message: impl Into<String>) -> Self {
        Self {
            category: ErrorCategory::Runtime,
            severity: Severity::Error,
            message: message.into(),
            file: None,
            line: None,
            column: None,
            code_snippet: None,
            suggestion: None,
        }
    }

    /// Downgrade this diagnostic to a warning.
    pub fn as_warning(mut self) -> Self {
        self.severity = Severity::Warning;
        self
    }

    /// Set the file location.
    pub fn with_file(mut self, file: impl Into<String>) -> Self {
        self.file = Some(file.into());
        self
    }

    /// Set the line and column.
    pub fn with_location(mut self, line: u32, column: u32) -> Self {
        self.line = Some(line);
        self.column = Some(column);
        self
    }

    /// Set the code snippet.
    pub fn with_snippet(mut self, snippet: impl Into<String>) -> Self {
        self.code_snippet = Some(snippet.into());
        self
    }

    /// Set an actionable suggestion for fixing the error.
    pub fn with_suggestion(mut self, suggestion: impl Into<String>) -> Self {
        self.suggestion = Some(suggestion.into());
        self
    }
}

/// Extract a code snippet from source around a given line.
///
/// Returns up to `context_lines` lines before and after the error line.
pub fn extract_snippet(source: &str, error_line: u32, context_lines: u32) -> String {
    let lines: Vec<&str> = source.lines().collect();
    if lines.is_empty() || error_line == 0 {
        return String::new();
    }

    let line_idx = (error_line - 1) as usize;
    if line_idx >= lines.len() {
        return String::new();
    }
    let start = line_idx.saturating_sub(context_lines as usize);
    let end = (line_idx + context_lines as usize + 1).min(lines.len());

    let mut snippet = String::new();
    for (i, line) in lines[start..end].iter().enumerate() {
        let line_num = start + i + 1;
        let marker = if line_num == error_line as usize {
            ">"
        } else {
            " "
        };
        snippet.push_str(&format!("{} {:>4} | {}\n", marker, line_num, line));
    }

    snippet
}

/// Active error state tracker.
///
/// Tracks errors by category with priority-based suppression.
/// Higher-priority errors suppress lower-priority ones from
/// being surfaced to the client.
#[derive(Debug, Clone, Default)]
pub struct ErrorState {
    /// Active errors by category.
    errors: std::collections::HashMap<ErrorCategory, Vec<DevError>>,
}

impl ErrorState {
    pub fn new() -> Self {
        Self {
            errors: std::collections::HashMap::new(),
        }
    }

    /// Add an error. Returns true if the error should be surfaced
    /// (not suppressed by a higher-priority category).
    /// Deduplicates by message + file — same error for the same file is not added twice.
    pub fn add(&mut self, error: DevError) -> bool {
        let category = error.category;
        let errors = self.errors.entry(category).or_default();
        // Deduplicate: don't add if same message+file already exists
        let is_dup = errors
            .iter()
            .any(|e| e.message == error.message && e.file == error.file);
        if !is_dup {
            errors.push(error);
        }
        !self.is_suppressed(category)
    }

    /// Clear all errors of a given category. Returns true if errors
    /// of a lower-priority category should now be surfaced.
    pub fn clear(&mut self, category: ErrorCategory) -> bool {
        self.errors.remove(&category);
        // If a higher-priority category still has errors, return false
        !self.has_higher_priority_errors(category)
    }

    /// Clear all errors for a specific file in a specific category.
    pub fn clear_file(&mut self, category: ErrorCategory, file: &str) {
        if let Some(errors) = self.errors.get_mut(&category) {
            errors.retain(|e| e.file.as_deref() != Some(file));
            if errors.is_empty() {
                self.errors.remove(&category);
            }
        }
    }

    /// Get the current highest-priority errors to display.
    pub fn active_errors(&self) -> Vec<&DevError> {
        // Find the highest-priority category that has errors
        let highest = [
            ErrorCategory::Build,
            ErrorCategory::Resolve,
            ErrorCategory::TypeCheck,
            ErrorCategory::Ssr,
            ErrorCategory::Runtime,
        ]
        .into_iter()
        .find(|cat| self.errors.contains_key(cat));

        match highest {
            Some(cat) => self
                .errors
                .get(&cat)
                .map(|v| v.iter().collect())
                .unwrap_or_default(),
            None => vec![],
        }
    }

    /// Atomically replace all errors for a category. Returns true if the
    /// new errors should be surfaced (not suppressed by a higher-priority category).
    pub fn replace_category(&mut self, category: ErrorCategory, errors: Vec<DevError>) -> bool {
        if errors.is_empty() {
            self.errors.remove(&category);
        } else {
            self.errors.insert(category, errors);
        }
        !self.is_suppressed(category)
    }

    /// Get all errors regardless of suppression.
    pub fn all_errors(&self) -> Vec<&DevError> {
        self.errors.values().flat_map(|v| v.iter()).collect()
    }

    /// Check if there are any active errors.
    pub fn has_errors(&self) -> bool {
        !self.errors.is_empty()
    }

    /// Check if a category is suppressed by a higher-priority one.
    fn is_suppressed(&self, category: ErrorCategory) -> bool {
        self.errors.keys().any(|&cat| cat.suppresses(category))
    }

    /// Check if there are errors with higher priority than the given category.
    fn has_higher_priority_errors(&self, category: ErrorCategory) -> bool {
        self.errors
            .keys()
            .any(|&cat| cat != category && cat.suppresses(category))
    }

    /// Get all errors of a specific category.
    pub fn errors_for(&self, category: ErrorCategory) -> &[DevError] {
        self.errors
            .get(&category)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── ErrorCategory tests ──

    #[test]
    fn test_category_priority_ordering() {
        assert!(ErrorCategory::Build.priority() > ErrorCategory::Resolve.priority());
        assert!(ErrorCategory::Resolve.priority() > ErrorCategory::Ssr.priority());
        assert!(ErrorCategory::Ssr.priority() > ErrorCategory::Runtime.priority());
    }

    #[test]
    fn test_build_suppresses_runtime() {
        assert!(ErrorCategory::Build.suppresses(ErrorCategory::Runtime));
        assert!(ErrorCategory::Build.suppresses(ErrorCategory::Ssr));
        assert!(ErrorCategory::Build.suppresses(ErrorCategory::Resolve));
    }

    #[test]
    fn test_runtime_does_not_suppress_build() {
        assert!(!ErrorCategory::Runtime.suppresses(ErrorCategory::Build));
        assert!(!ErrorCategory::Runtime.suppresses(ErrorCategory::Resolve));
        assert!(!ErrorCategory::Runtime.suppresses(ErrorCategory::Ssr));
    }

    #[test]
    fn test_same_category_does_not_suppress() {
        assert!(!ErrorCategory::Build.suppresses(ErrorCategory::Build));
        assert!(!ErrorCategory::Runtime.suppresses(ErrorCategory::Runtime));
    }

    #[test]
    fn test_category_display() {
        assert_eq!(format!("{}", ErrorCategory::Build), "build");
        assert_eq!(format!("{}", ErrorCategory::Resolve), "resolve");
        assert_eq!(format!("{}", ErrorCategory::Ssr), "ssr");
        assert_eq!(format!("{}", ErrorCategory::Runtime), "runtime");
    }

    #[test]
    fn test_category_serialization() {
        let json = serde_json::to_string(&ErrorCategory::Build).unwrap();
        assert_eq!(json, r#""build""#);

        let deserialized: ErrorCategory = serde_json::from_str(r#""runtime""#).unwrap();
        assert_eq!(deserialized, ErrorCategory::Runtime);
    }

    #[test]
    fn test_typecheck_serialization() {
        let json = serde_json::to_string(&ErrorCategory::TypeCheck).unwrap();
        assert_eq!(json, r#""typecheck""#);

        let deserialized: ErrorCategory = serde_json::from_str(r#""typecheck""#).unwrap();
        assert_eq!(deserialized, ErrorCategory::TypeCheck);
    }

    #[test]
    fn test_typecheck_display() {
        assert_eq!(format!("{}", ErrorCategory::TypeCheck), "typecheck");
    }

    #[test]
    fn test_typecheck_priority_ordering() {
        assert!(ErrorCategory::Build.priority() > ErrorCategory::TypeCheck.priority());
        assert!(ErrorCategory::Resolve.priority() > ErrorCategory::TypeCheck.priority());
        assert!(ErrorCategory::TypeCheck.priority() > ErrorCategory::Ssr.priority());
        assert!(ErrorCategory::TypeCheck.priority() > ErrorCategory::Runtime.priority());
    }

    #[test]
    fn test_build_suppresses_typecheck() {
        assert!(ErrorCategory::Build.suppresses(ErrorCategory::TypeCheck));
        assert!(ErrorCategory::Resolve.suppresses(ErrorCategory::TypeCheck));
    }

    #[test]
    fn test_typecheck_suppresses_lower() {
        assert!(ErrorCategory::TypeCheck.suppresses(ErrorCategory::Ssr));
        assert!(ErrorCategory::TypeCheck.suppresses(ErrorCategory::Runtime));
    }

    #[test]
    fn test_typecheck_does_not_suppress_higher() {
        assert!(!ErrorCategory::TypeCheck.suppresses(ErrorCategory::Build));
        assert!(!ErrorCategory::TypeCheck.suppresses(ErrorCategory::Resolve));
        assert!(!ErrorCategory::TypeCheck.suppresses(ErrorCategory::TypeCheck));
    }

    // ── DevError tests ──

    #[test]
    fn test_build_error_constructor() {
        let err = DevError::build("Unexpected token");
        assert_eq!(err.category, ErrorCategory::Build);
        assert_eq!(err.message, "Unexpected token");
        assert!(err.file.is_none());
    }

    #[test]
    fn test_error_builder_chain() {
        let err = DevError::build("Syntax error")
            .with_file("/src/app.tsx")
            .with_location(10, 5)
            .with_snippet("> 10 | const x = ;");

        assert_eq!(err.file.as_deref(), Some("/src/app.tsx"));
        assert_eq!(err.line, Some(10));
        assert_eq!(err.column, Some(5));
        assert!(err.code_snippet.is_some());
    }

    #[test]
    fn test_error_serialization() {
        let err = DevError::build("Unexpected token")
            .with_file("/src/app.tsx")
            .with_location(10, 5);

        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("\"category\":\"build\""));
        assert!(json.contains("\"message\":\"Unexpected token\""));
        assert!(json.contains("\"file\":\"/src/app.tsx\""));
        assert!(json.contains("\"line\":10"));
        assert!(json.contains("\"column\":5"));
        // code_snippet is None, so it should be omitted
        assert!(!json.contains("code_snippet"));
    }

    #[test]
    fn test_error_deserialization() {
        let json = r#"{"category":"resolve","message":"Cannot find module './missing'"}"#;
        let err: DevError = serde_json::from_str(json).unwrap();
        assert_eq!(err.category, ErrorCategory::Resolve);
        assert_eq!(err.message, "Cannot find module './missing'");
    }

    // ── extract_snippet tests ──

    #[test]
    fn test_extract_snippet_middle_of_file() {
        let source = "line1\nline2\nline3\nline4\nline5\nline6\nline7";
        let snippet = extract_snippet(source, 4, 2);
        assert!(snippet.contains(">    4 | line4"));
        assert!(snippet.contains("     2 | line2"));
        assert!(snippet.contains("     6 | line6"));
    }

    #[test]
    fn test_extract_snippet_start_of_file() {
        let source = "line1\nline2\nline3";
        let snippet = extract_snippet(source, 1, 2);
        assert!(snippet.contains(">    1 | line1"));
        assert!(snippet.contains("     2 | line2"));
        assert!(snippet.contains("     3 | line3"));
    }

    #[test]
    fn test_extract_snippet_end_of_file() {
        let source = "line1\nline2\nline3";
        let snippet = extract_snippet(source, 3, 2);
        assert!(snippet.contains("     1 | line1"));
        assert!(snippet.contains(">    3 | line3"));
    }

    #[test]
    fn test_extract_snippet_empty_source() {
        assert_eq!(extract_snippet("", 1, 2), "");
    }

    #[test]
    fn test_extract_snippet_zero_line() {
        assert_eq!(extract_snippet("line1", 0, 2), "");
    }

    #[test]
    fn test_extract_snippet_line_beyond_file_length() {
        // tsc may report stale line numbers after a save race
        let source = "line1\nline2\nline3";
        assert_eq!(extract_snippet(source, 100, 2), "");
    }

    // ── ErrorState tests ──

    #[test]
    fn test_error_state_empty() {
        let state = ErrorState::new();
        assert!(!state.has_errors());
        assert!(state.active_errors().is_empty());
    }

    #[test]
    fn test_add_error_surfaces_when_no_higher_priority() {
        let mut state = ErrorState::new();
        let should_surface = state.add(DevError::runtime("oops"));
        assert!(should_surface);
        assert!(state.has_errors());
    }

    #[test]
    fn test_build_error_suppresses_runtime() {
        let mut state = ErrorState::new();

        // Add runtime error first
        state.add(DevError::runtime("runtime oops"));

        // Add build error — runtime should be suppressed
        state.add(DevError::build("syntax error"));

        let active = state.active_errors();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].category, ErrorCategory::Build);
    }

    #[test]
    fn test_clearing_build_error_allows_runtime_to_surface() {
        let mut state = ErrorState::new();

        state.add(DevError::runtime("runtime oops"));
        state.add(DevError::build("syntax error"));

        // Active should be the build error
        assert_eq!(state.active_errors()[0].category, ErrorCategory::Build);

        // Clear build errors
        let should_surface_lower = state.clear(ErrorCategory::Build);
        assert!(should_surface_lower);

        // Now runtime error should surface
        let active = state.active_errors();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].category, ErrorCategory::Runtime);
    }

    #[test]
    fn test_runtime_error_suppressed_when_build_error_present() {
        let mut state = ErrorState::new();

        state.add(DevError::build("syntax error"));
        let should_surface = state.add(DevError::runtime("runtime oops"));

        assert!(!should_surface);
    }

    #[test]
    fn test_clear_file_specific_errors() {
        let mut state = ErrorState::new();

        state.add(DevError::build("error in a").with_file("/src/a.tsx"));
        state.add(DevError::build("error in b").with_file("/src/b.tsx"));

        state.clear_file(ErrorCategory::Build, "/src/a.tsx");

        let active = state.active_errors();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].file.as_deref(), Some("/src/b.tsx"));
    }

    #[test]
    fn test_clear_file_removes_category_when_empty() {
        let mut state = ErrorState::new();

        state.add(DevError::build("error").with_file("/src/a.tsx"));
        state.clear_file(ErrorCategory::Build, "/src/a.tsx");

        assert!(!state.has_errors());
    }

    #[test]
    fn test_all_errors_includes_suppressed() {
        let mut state = ErrorState::new();

        state.add(DevError::runtime("runtime oops"));
        state.add(DevError::build("build error"));

        let all = state.all_errors();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_typecheck_error_constructor() {
        let err = DevError::typecheck("Type 'string' is not assignable to type 'number'");
        assert_eq!(err.category, ErrorCategory::TypeCheck);
        assert_eq!(
            err.message,
            "Type 'string' is not assignable to type 'number'"
        );
        assert!(err.file.is_none());
    }

    #[test]
    fn test_typecheck_error_builder_chain() {
        let err = DevError::typecheck("TS2322: Type mismatch")
            .with_file("src/app.tsx")
            .with_location(10, 5)
            .with_snippet("> 10 | const x: number = \"hello\"");
        assert_eq!(err.category, ErrorCategory::TypeCheck);
        assert_eq!(err.file.as_deref(), Some("src/app.tsx"));
        assert_eq!(err.line, Some(10));
        assert_eq!(err.column, Some(5));
        assert!(err.code_snippet.is_some());
    }

    #[test]
    fn test_active_errors_returns_typecheck_when_highest() {
        let mut state = ErrorState::new();
        state.add(DevError::typecheck("type error"));
        let active = state.active_errors();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].category, ErrorCategory::TypeCheck);
    }

    #[test]
    fn test_active_errors_returns_build_over_typecheck() {
        let mut state = ErrorState::new();
        state.add(DevError::typecheck("type error"));
        state.add(DevError::build("syntax error"));
        let active = state.active_errors();
        assert_eq!(active[0].category, ErrorCategory::Build);
    }

    #[test]
    fn test_replace_category_swaps_all_errors() {
        let mut state = ErrorState::new();
        state.add(DevError::typecheck("old err 1"));
        state.add(DevError::typecheck("old err 2"));
        state.replace_category(
            ErrorCategory::TypeCheck,
            vec![DevError::typecheck("new err")],
        );
        assert_eq!(state.errors_for(ErrorCategory::TypeCheck).len(), 1);
        assert_eq!(
            state.errors_for(ErrorCategory::TypeCheck)[0].message,
            "new err"
        );
    }

    #[test]
    fn test_replace_category_empty_clears() {
        let mut state = ErrorState::new();
        state.add(DevError::typecheck("err"));
        state.replace_category(ErrorCategory::TypeCheck, vec![]);
        assert!(!state.has_errors());
    }

    #[test]
    fn test_replace_category_does_not_affect_other_categories() {
        let mut state = ErrorState::new();
        state.add(DevError::runtime("runtime err"));
        state.add(DevError::typecheck("type err"));
        state.replace_category(
            ErrorCategory::TypeCheck,
            vec![DevError::typecheck("new type err")],
        );
        assert_eq!(state.errors_for(ErrorCategory::Runtime).len(), 1);
        assert_eq!(state.errors_for(ErrorCategory::TypeCheck).len(), 1);
    }

    #[test]
    fn test_errors_for_category() {
        let mut state = ErrorState::new();

        state.add(DevError::build("err1"));
        state.add(DevError::build("err2"));
        state.add(DevError::runtime("rt err"));

        assert_eq!(state.errors_for(ErrorCategory::Build).len(), 2);
        assert_eq!(state.errors_for(ErrorCategory::Runtime).len(), 1);
        assert_eq!(state.errors_for(ErrorCategory::Resolve).len(), 0);
    }
}
