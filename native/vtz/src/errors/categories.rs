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

/// Parse line and column from error messages containing "at file:line:col" or ":line:col".
///
/// Scans backwards for a `:<digits>:<digits>` pattern (or a single `:<digits>` for
/// line-only). Used as a fallback when the compiler returns a diagnostic without
/// structured line/column info but encodes the location in the message string.
pub fn parse_location_from_message(message: &str) -> (Option<u32>, Option<u32>) {
    let bytes = message.as_bytes();
    let len = bytes.len();
    let mut i = len;

    while i > 0 {
        i -= 1;
        if bytes[i] == b':' {
            let col_start = i + 1;
            let mut j = col_start;
            while j < len && bytes[j].is_ascii_digit() {
                j += 1;
            }
            if j > col_start {
                let col: u32 = message[col_start..j].parse().unwrap_or(0);
                if col > 0 {
                    if i > 0 {
                        let mut k = i - 1;
                        while k > 0 && bytes[k].is_ascii_digit() {
                            k -= 1;
                        }
                        if bytes[k] == b':' && k + 1 < i {
                            let line: u32 = message[k + 1..i].parse().unwrap_or(0);
                            if line > 0 {
                                return (Some(line), Some(col));
                            }
                        }
                    }
                    return (Some(col), None);
                }
            }
        }
    }

    (None, None)
}

/// Build a `DevError` (build category) from compiler diagnostics.
///
/// Takes the first entry in `errors`, extracts message + line/column, and attaches
/// a code snippet and fix suggestion. Falls back to parsing the location from the
/// message text, then to a line-1 snippet, when the diagnostic lacks structured
/// location info.
///
/// Returns `None` when `errors` is empty.
pub fn build_compile_error(
    errors: &[crate::compiler::pipeline::CompileError],
    file_path: &str,
    source: &str,
) -> Option<DevError> {
    let primary = errors.first()?;
    let message = &primary.message;
    let suggestion = crate::errors::suggestions::suggest_build_fix(message);

    let mut error = DevError::build(message).with_file(file_path);

    if let (Some(line), Some(col)) = (primary.line, primary.column) {
        error = error.with_location(line, col);
        if !source.is_empty() {
            error = error.with_snippet(extract_snippet(source, line, 3));
        }
    } else if !source.is_empty() {
        let (parsed_line, parsed_col) = parse_location_from_message(message);
        if let Some(line) = parsed_line {
            error = error.with_location(line, parsed_col.unwrap_or(1));
            error = error.with_snippet(extract_snippet(source, line, 3));
        } else {
            error = error.with_snippet(extract_snippet(source, 1, 3));
        }
    }

    if let Some(s) = suggestion {
        error = error.with_suggestion(s);
    }

    Some(error)
}

/// Refine an approximate source line by searching for the error text.
///
/// When source map resolution returns a nearby line (not exact), this function
/// searches the original source for a line containing a distinctive part of the
/// error message (e.g., the string inside `throw new Error('...')`). It searches
/// within ±`range` lines of the `approx_line` and returns the best match.
/// Falls back to `approx_line` if no match is found.
pub fn refine_error_line(source: &str, approx_line: u32, error_message: &str) -> u32 {
    // Extract a distinctive substring from the error message.
    // Error messages are often "Error: <text>" or just "<text>".
    let search_text = error_message
        .strip_prefix("Error: ")
        .or_else(|| error_message.strip_prefix("Uncaught Error: "))
        .unwrap_or(error_message)
        .trim();

    if search_text.is_empty() {
        return approx_line;
    }

    let lines: Vec<&str> = source.lines().collect();
    if lines.is_empty() || approx_line == 0 {
        return approx_line;
    }

    let approx_idx = (approx_line - 1) as usize;
    let range: usize = 10;
    let start = approx_idx.saturating_sub(range);
    let end = (approx_idx + range + 1).min(lines.len());

    // Search for the error text in nearby lines.
    for (i, line) in lines.iter().enumerate().take(end).skip(start) {
        if line.contains(search_text) {
            return (i + 1) as u32;
        }
    }

    approx_line
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

    // ── parse_location_from_message tests ──

    #[test]
    fn test_parse_location_line_and_column() {
        let (line, col) = parse_location_from_message("Unexpected token at /src/app.tsx:10:5");
        assert_eq!(line, Some(10));
        assert_eq!(col, Some(5));
    }

    #[test]
    fn test_parse_location_no_location() {
        let (line, col) = parse_location_from_message("Unexpected token");
        assert_eq!(line, None);
        assert_eq!(col, None);
    }

    #[test]
    fn test_parse_location_line_only() {
        let (line, col) = parse_location_from_message("Error at line :42");
        assert_eq!(line, Some(42));
        assert_eq!(col, None);
    }

    #[test]
    fn test_parse_location_large_numbers() {
        let (line, col) = parse_location_from_message("error:150:23");
        assert_eq!(line, Some(150));
        assert_eq!(col, Some(23));
    }

    #[test]
    fn test_parse_location_multiple_colons() {
        let (line, col) = parse_location_from_message("Error in file.tsx:5:10 and more text");
        assert_eq!(line, Some(5));
        assert_eq!(col, Some(10));
    }

    #[test]
    fn test_parse_location_colon_no_digits() {
        let (line, col) = parse_location_from_message("Error: something went wrong");
        assert_eq!(line, None);
        assert_eq!(col, None);
    }

    #[test]
    fn test_parse_location_empty() {
        let (line, col) = parse_location_from_message("");
        assert_eq!(line, None);
        assert_eq!(col, None);
    }

    #[test]
    fn test_parse_location_only_colon_zero() {
        let (line, col) = parse_location_from_message("at :0");
        assert_eq!(line, None);
        assert_eq!(col, None);
    }

    // ── build_compile_error tests ──

    use crate::compiler::pipeline::CompileError;

    #[test]
    fn test_build_compile_error_empty_returns_none() {
        let result = build_compile_error(&[], "/src/app.tsx", "");
        assert!(result.is_none());
    }

    #[test]
    fn test_build_compile_error_uses_structured_line_column() {
        let errors = vec![CompileError {
            message: "Unexpected token".into(),
            line: Some(3),
            column: Some(7),
        }];
        let source = "line1\nline2\nconst x = ;\nline4\nline5";
        let err = build_compile_error(&errors, "/src/app.tsx", source).unwrap();

        assert_eq!(err.category, ErrorCategory::Build);
        assert_eq!(err.message, "Unexpected token");
        assert_eq!(err.file.as_deref(), Some("/src/app.tsx"));
        assert_eq!(err.line, Some(3));
        assert_eq!(err.column, Some(7));
        let snippet = err.code_snippet.expect("snippet present");
        assert!(
            snippet.contains(">    3 | const x = ;"),
            "snippet should mark line 3: {}",
            snippet,
        );
    }

    #[test]
    fn test_build_compile_error_falls_back_to_parsed_location() {
        let errors = vec![CompileError {
            message: "Error in app.tsx:2:4".into(),
            line: None,
            column: None,
        }];
        let source = "line1\nbad line here\nline3";
        let err = build_compile_error(&errors, "/src/app.tsx", source).unwrap();

        assert_eq!(err.line, Some(2));
        assert_eq!(err.column, Some(4));
        let snippet = err.code_snippet.expect("snippet present");
        assert!(snippet.contains(">    2 | bad line here"));
    }

    #[test]
    fn test_build_compile_error_falls_back_to_line_one_snippet() {
        let errors = vec![CompileError {
            message: "Syntax error".into(),
            line: None,
            column: None,
        }];
        let source = "line1\nline2\nline3";
        let err = build_compile_error(&errors, "/src/app.tsx", source).unwrap();

        assert_eq!(err.line, None);
        assert_eq!(err.column, None);
        let snippet = err.code_snippet.expect("snippet present");
        assert!(snippet.contains(">    1 | line1"));
    }

    #[test]
    fn test_build_compile_error_skips_snippet_when_source_empty() {
        let errors = vec![CompileError {
            message: "Syntax error".into(),
            line: None,
            column: None,
        }];
        let err = build_compile_error(&errors, "/src/app.tsx", "").unwrap();
        assert!(err.code_snippet.is_none());
    }

    #[test]
    fn test_build_compile_error_attaches_suggestion_when_available() {
        // "Cannot find module" triggers a suggestion from suggestions::suggest_build_fix
        let errors = vec![CompileError {
            message: "Cannot find module './missing'".into(),
            line: Some(1),
            column: Some(1),
        }];
        let err = build_compile_error(&errors, "/src/app.tsx", "import './missing';").unwrap();
        assert!(err.suggestion.is_some(), "expected a fix suggestion");
    }
}
