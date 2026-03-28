use crate::errors::categories::DevError;
use crate::errors::suggestions;

/// Parsed result from a single line of tsc/tsgo `--pretty false --watch` output.
#[derive(Debug, Clone, PartialEq)]
pub enum TscParsed {
    /// A diagnostic line: `file(line,col): error TSxxxx: message`
    Diagnostic(TscDiagnostic),
    /// A continuation line (indented, appended to the previous diagnostic).
    Continuation(String),
    /// Watch-mode sentinel: `[HH:MM:SS] Found N errors. Watching for file changes.`
    Sentinel { count: u32 },
    /// Non-diagnostic output (watch-mode status lines, blank lines, etc.).
    Ignored,
}

/// A single TypeScript diagnostic parsed from tsc output.
#[derive(Debug, Clone, PartialEq)]
pub struct TscDiagnostic {
    /// Source file path (as reported by tsc, may be relative).
    pub file: String,
    /// Line number (1-indexed).
    pub line: u32,
    /// Column number (1-indexed).
    pub col: u32,
    /// TS error code (e.g., 2322).
    pub code: u32,
    /// Error message (without the TSxxxx prefix).
    pub message: String,
    /// Severity: "error" or "warning".
    pub severity: String,
}

impl TscDiagnostic {
    /// Convert this diagnostic into a `DevError`.
    ///
    /// Attaches an actionable suggestion if one is available for this TS error code.
    /// Optionally enriches with a code snippet if `root_dir` is provided and the
    /// source file can be read.
    pub fn to_dev_error(&self) -> DevError {
        let msg = format!("TS{}: {}", self.code, self.message);
        let mut error = DevError::typecheck(msg)
            .with_file(&self.file)
            .with_location(self.line, self.col);

        if let Some(suggestion) = suggestions::suggest_typecheck_fix(self.code) {
            error = error.with_suggestion(suggestion);
        }

        error
    }
}

/// Parse a single line of tsc `--pretty false --watch` output.
///
/// Handles:
/// - Diagnostic lines: `file(line,col): error TSxxxx: message`
/// - Continuation lines: indented text following a diagnostic
/// - Sentinel lines: `[timestamp] Found N error(s). Watching for file changes.`
/// - Everything else is ignored
pub fn parse_tsc_line(line: &str) -> TscParsed {
    // Check for sentinel line: "[HH:MM:SS AM/PM] Found N error(s)."
    if let Some(parsed) = try_parse_sentinel(line) {
        return parsed;
    }

    // Check for diagnostic line: file(line,col): error TSxxxx: message
    if let Some(parsed) = try_parse_diagnostic(line) {
        return parsed;
    }

    // Check for continuation line (indented, starts with whitespace)
    if line.starts_with("  ") && !line.trim().is_empty() {
        return TscParsed::Continuation(line.trim().to_string());
    }

    TscParsed::Ignored
}

/// Try to parse a sentinel line like:
/// `[12:34:56 PM] Found 3 errors. Watching for file changes.`
/// `[12:34:56 PM] Found 1 error. Watching for file changes.`
/// `[12:34:56 PM] Found 0 errors. Watching for file changes.`
fn try_parse_sentinel(line: &str) -> Option<TscParsed> {
    // Strip optional timestamp prefix: [anything]<space>
    let content = if line.starts_with('[') {
        match line.find("] ") {
            Some(idx) => &line[idx + 2..],
            None => line,
        }
    } else {
        line
    };

    // Match "Found N error(s). Watching for file changes."
    let rest = content.strip_prefix("Found ")?;
    let space_idx = rest.find(' ')?;
    let count_str = &rest[..space_idx];
    let count: u32 = count_str.parse().ok()?;

    // Verify the rest matches "error(s). Watching for file changes."
    let after_count = &rest[space_idx + 1..];
    if after_count.starts_with("error") {
        Some(TscParsed::Sentinel { count })
    } else {
        None
    }
}

/// Try to parse a diagnostic line like:
/// `src/app.tsx(10,5): error TS2322: Type 'string' is not assignable to type 'number'.`
/// `src/app.tsx(10,5): warning TS6133: 'x' is declared but its value is never read.`
fn try_parse_diagnostic(line: &str) -> Option<TscParsed> {
    // Find the (line,col) part
    let paren_open = line.find('(')?;
    let paren_close = line[paren_open..].find(')')? + paren_open;

    let file = &line[..paren_open];
    let coords = &line[paren_open + 1..paren_close];

    // Parse line,col
    let comma = coords.find(',')?;
    let line_num: u32 = coords[..comma].parse().ok()?;
    let col_num: u32 = coords[comma + 1..].parse().ok()?;

    // After "): " comes "error TSxxxx: message" or "warning TSxxxx: message"
    let after_paren = &line[paren_close + 1..];
    let after_colon_space = after_paren.strip_prefix(": ")?;

    // Parse severity (error/warning)
    let severity_end = after_colon_space.find(' ')?;
    let severity = &after_colon_space[..severity_end];
    if severity != "error" && severity != "warning" {
        return None;
    }

    // Parse TSxxxx
    let after_severity = &after_colon_space[severity_end + 1..];
    let ts_prefix = after_severity.strip_prefix("TS")?;
    let code_end = ts_prefix.find(':')?;
    let code: u32 = ts_prefix[..code_end].parse().ok()?;

    // Message is after "TSxxxx: "
    let message = ts_prefix[code_end + 1..].trim().to_string();

    Some(TscParsed::Diagnostic(TscDiagnostic {
        file: file.to_string(),
        line: line_num,
        col: col_num,
        code,
        message,
        severity: severity.to_string(),
    }))
}

/// Accumulate parsed lines into a batch of DevErrors.
///
/// Buffers diagnostics and their continuation lines. Call `flush()` when
/// a sentinel line is received to get the complete error set.
#[derive(Debug, Default)]
pub struct DiagnosticBuffer {
    /// Accumulated diagnostics for the current compilation pass.
    diagnostics: Vec<TscDiagnostic>,
    /// Whether we have seen any diagnostic since the last flush.
    has_content: bool,
}

impl DiagnosticBuffer {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feed a parsed line into the buffer.
    /// Returns `Some(Vec<DevError>)` when a sentinel line flushes the buffer.
    pub fn feed(&mut self, parsed: TscParsed) -> Option<Vec<DevError>> {
        match parsed {
            TscParsed::Diagnostic(diag) => {
                self.diagnostics.push(diag);
                self.has_content = true;
                None
            }
            TscParsed::Continuation(text) => {
                // Append to the last diagnostic's message
                if let Some(last) = self.diagnostics.last_mut() {
                    last.message.push('\n');
                    last.message.push_str(&text);
                }
                None
            }
            TscParsed::Sentinel { count: _ } => Some(self.flush()),
            TscParsed::Ignored => None,
        }
    }

    /// Flush the buffer and return all accumulated errors as DevErrors.
    pub fn flush(&mut self) -> Vec<DevError> {
        let errors: Vec<DevError> = self
            .diagnostics
            .drain(..)
            .map(|d| d.to_dev_error())
            .collect();
        self.has_content = false;
        errors
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── parse_tsc_line: diagnostic lines ──

    #[test]
    fn test_parse_standard_error_diagnostic() {
        let line =
            "src/app.tsx(10,5): error TS2322: Type 'string' is not assignable to type 'number'.";
        let result = parse_tsc_line(line);
        match result {
            TscParsed::Diagnostic(d) => {
                assert_eq!(d.file, "src/app.tsx");
                assert_eq!(d.line, 10);
                assert_eq!(d.col, 5);
                assert_eq!(d.code, 2322);
                assert_eq!(
                    d.message,
                    "Type 'string' is not assignable to type 'number'."
                );
                assert_eq!(d.severity, "error");
            }
            other => panic!("Expected Diagnostic, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_warning_diagnostic() {
        let line =
            "src/utils.ts(3,7): warning TS6133: 'x' is declared but its value is never read.";
        let result = parse_tsc_line(line);
        match result {
            TscParsed::Diagnostic(d) => {
                assert_eq!(d.severity, "warning");
                assert_eq!(d.code, 6133);
                assert_eq!(d.message, "'x' is declared but its value is never read.");
            }
            other => panic!("Expected Diagnostic, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_diagnostic_with_windows_path() {
        let line = "src\\components\\button.tsx(42,10): error TS2345: Argument of type 'string' is not assignable.";
        let result = parse_tsc_line(line);
        match result {
            TscParsed::Diagnostic(d) => {
                assert_eq!(d.file, "src\\components\\button.tsx");
                assert_eq!(d.line, 42);
                assert_eq!(d.col, 10);
                assert_eq!(d.code, 2345);
            }
            other => panic!("Expected Diagnostic, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_diagnostic_high_line_column() {
        let line = "src/long-file.ts(1234,56): error TS2304: Cannot find name 'foo'.";
        let result = parse_tsc_line(line);
        match result {
            TscParsed::Diagnostic(d) => {
                assert_eq!(d.line, 1234);
                assert_eq!(d.col, 56);
            }
            other => panic!("Expected Diagnostic, got {:?}", other),
        }
    }

    // ── parse_tsc_line: continuation lines ──

    #[test]
    fn test_parse_continuation_line() {
        let line = "  Property 'id' is missing in type '{ name: string; }'.";
        let result = parse_tsc_line(line);
        match result {
            TscParsed::Continuation(text) => {
                assert_eq!(
                    text,
                    "Property 'id' is missing in type '{ name: string; }'."
                );
            }
            other => panic!("Expected Continuation, got {:?}", other),
        }
    }

    #[test]
    fn test_parse_deeply_indented_continuation() {
        let line = "    Type '{ a: number; }' is not assignable to type 'B'.";
        let result = parse_tsc_line(line);
        assert!(matches!(result, TscParsed::Continuation(_)));
    }

    // ── parse_tsc_line: sentinel lines ──

    #[test]
    fn test_parse_sentinel_with_timestamp_plural() {
        let line = "[12:34:56 PM] Found 3 errors. Watching for file changes.";
        let result = parse_tsc_line(line);
        assert_eq!(result, TscParsed::Sentinel { count: 3 });
    }

    #[test]
    fn test_parse_sentinel_with_timestamp_singular() {
        let line = "[12:34:56 PM] Found 1 error. Watching for file changes.";
        let result = parse_tsc_line(line);
        assert_eq!(result, TscParsed::Sentinel { count: 1 });
    }

    #[test]
    fn test_parse_sentinel_zero_errors() {
        let line = "[12:34:56 PM] Found 0 errors. Watching for file changes.";
        let result = parse_tsc_line(line);
        assert_eq!(result, TscParsed::Sentinel { count: 0 });
    }

    #[test]
    fn test_parse_sentinel_24h_format() {
        let line = "[14:22:01] Found 5 errors. Watching for file changes.";
        let result = parse_tsc_line(line);
        assert_eq!(result, TscParsed::Sentinel { count: 5 });
    }

    #[test]
    fn test_parse_sentinel_large_count() {
        let line = "[10:00:00 AM] Found 142 errors. Watching for file changes.";
        let result = parse_tsc_line(line);
        assert_eq!(result, TscParsed::Sentinel { count: 142 });
    }

    // ── parse_tsc_line: ignored lines ──

    #[test]
    fn test_parse_starting_compilation() {
        let line = "[12:34:56 PM] Starting compilation in watch mode...";
        assert_eq!(parse_tsc_line(line), TscParsed::Ignored);
    }

    #[test]
    fn test_parse_file_change_detected() {
        let line = "[12:34:56 PM] File change detected. Starting incremental compilation...";
        assert_eq!(parse_tsc_line(line), TscParsed::Ignored);
    }

    #[test]
    fn test_parse_empty_line() {
        assert_eq!(parse_tsc_line(""), TscParsed::Ignored);
    }

    #[test]
    fn test_parse_whitespace_only_line() {
        assert_eq!(parse_tsc_line("   "), TscParsed::Ignored);
    }

    // ── TscDiagnostic::to_dev_error ──

    #[test]
    fn test_diagnostic_to_dev_error() {
        let diag = TscDiagnostic {
            file: "src/app.tsx".to_string(),
            line: 10,
            col: 5,
            code: 2322,
            message: "Type 'string' is not assignable to type 'number'.".to_string(),
            severity: "error".to_string(),
        };

        let err = diag.to_dev_error();
        assert_eq!(
            err.category,
            crate::errors::categories::ErrorCategory::TypeCheck
        );
        assert_eq!(
            err.message,
            "TS2322: Type 'string' is not assignable to type 'number'."
        );
        assert_eq!(err.file.as_deref(), Some("src/app.tsx"));
        assert_eq!(err.line, Some(10));
        assert_eq!(err.column, Some(5));
    }

    #[test]
    fn test_diagnostic_to_dev_error_with_suggestion() {
        let diag = TscDiagnostic {
            file: "src/app.tsx".to_string(),
            line: 5,
            col: 1,
            code: 2307, // Cannot find module
            message: "Cannot find module './missing'.".to_string(),
            severity: "error".to_string(),
        };

        let err = diag.to_dev_error();
        assert!(err.suggestion.is_some());
        assert!(err.suggestion.unwrap().contains("import path"));
    }

    #[test]
    fn test_diagnostic_to_dev_error_no_suggestion_for_self_explanatory() {
        let diag = TscDiagnostic {
            file: "src/app.tsx".to_string(),
            line: 10,
            col: 5,
            code: 2322, // Type assignment — self-explanatory
            message: "Type 'string' is not assignable to type 'number'.".to_string(),
            severity: "error".to_string(),
        };

        let err = diag.to_dev_error();
        assert!(err.suggestion.is_none());
    }

    // ── DiagnosticBuffer ──

    #[test]
    fn test_buffer_accumulates_diagnostics() {
        let mut buf = DiagnosticBuffer::new();
        let parsed = parse_tsc_line(
            "src/a.tsx(1,1): error TS2322: Type 'string' is not assignable to type 'number'.",
        );
        assert!(buf.feed(parsed).is_none());

        let parsed = parse_tsc_line("src/b.tsx(5,3): error TS2304: Cannot find name 'foo'.");
        assert!(buf.feed(parsed).is_none());

        // Sentinel flushes
        let parsed = parse_tsc_line("[12:00:00 PM] Found 2 errors. Watching for file changes.");
        let errors = buf.feed(parsed).expect("sentinel should flush");
        assert_eq!(errors.len(), 2);
        assert_eq!(
            errors[0].message,
            "TS2322: Type 'string' is not assignable to type 'number'."
        );
        assert_eq!(errors[1].message, "TS2304: Cannot find name 'foo'.");
    }

    #[test]
    fn test_buffer_continuation_appends_to_last_diagnostic() {
        let mut buf = DiagnosticBuffer::new();
        buf.feed(parse_tsc_line(
            "src/a.tsx(1,1): error TS2345: Argument of type '{ name: string; }' is not assignable.",
        ));
        buf.feed(parse_tsc_line(
            "  Property 'id' is missing in type '{ name: string; }'.",
        ));

        let parsed = parse_tsc_line("[12:00:00 PM] Found 1 error. Watching for file changes.");
        let errors = buf.feed(parsed).unwrap();
        assert_eq!(errors.len(), 1);
        assert!(errors[0].message.contains("Property 'id' is missing"));
    }

    #[test]
    fn test_buffer_zero_errors_sentinel_flushes_empty() {
        let mut buf = DiagnosticBuffer::new();
        let parsed = parse_tsc_line("[12:00:00 PM] Found 0 errors. Watching for file changes.");
        let errors = buf.feed(parsed).unwrap();
        assert!(errors.is_empty());
    }

    #[test]
    fn test_buffer_ignored_lines_do_not_flush() {
        let mut buf = DiagnosticBuffer::new();
        assert!(buf.feed(parse_tsc_line("")).is_none());
        assert!(buf
            .feed(parse_tsc_line(
                "[12:00:00] Starting compilation in watch mode..."
            ))
            .is_none());
    }

    #[test]
    fn test_buffer_multiple_compilation_passes() {
        let mut buf = DiagnosticBuffer::new();

        // First pass: 1 error
        buf.feed(parse_tsc_line(
            "src/a.tsx(1,1): error TS2322: Type mismatch.",
        ));
        let errors = buf
            .feed(parse_tsc_line(
                "[12:00:00] Found 1 error. Watching for file changes.",
            ))
            .unwrap();
        assert_eq!(errors.len(), 1);

        // Second pass: 0 errors (fixed)
        let errors = buf
            .feed(parse_tsc_line(
                "[12:00:05] Found 0 errors. Watching for file changes.",
            ))
            .unwrap();
        assert!(errors.is_empty());
    }
}
