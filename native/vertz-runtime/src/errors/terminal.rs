use owo_colors::OwoColorize;
use std::path::Path;

use super::categories::DevError;

/// Format a `DevError` as a rich ANSI-colored terminal diagnostic.
///
/// Produces output like:
/// ```text
///  ERROR  src/components/task-card.tsx:12:5
///
///   10 │ import { Task } from '../types';
///   11 │
/// > 12 │ export function TaskCard({ task }: TaskCardProps) {
///      │     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
///   13 │   return (
///   14 │     <div className="task-card">
///
///  Unexpected token ':'
///
///  Suggestion: Check for unclosed quotes or brackets on previous lines
/// ```
pub fn format_error(error: &DevError, root_dir: Option<&Path>) -> String {
    let mut out = String::new();

    // Header: category badge + file location
    let badge = match error.category {
        super::categories::ErrorCategory::Build => " BUILD ERROR ",
        super::categories::ErrorCategory::Resolve => " RESOLVE ERROR ",
        super::categories::ErrorCategory::TypeCheck => " TYPECHECK ERROR ",
        super::categories::ErrorCategory::Ssr => " SSR ERROR ",
        super::categories::ErrorCategory::Runtime => " RUNTIME ERROR ",
    };

    out.push_str(&format!("\n{}", badge.white().on_red().bold()));

    if let Some(ref file) = error.file {
        let display_path = make_relative(file, root_dir);
        let location = match (error.line, error.column) {
            (Some(line), Some(col)) => format!("{}:{}:{}", display_path, line, col),
            (Some(line), None) => format!("{}:{}", display_path, line),
            _ => display_path,
        };
        out.push_str(&format!(" {}\n", location.cyan()));
    }
    out.push('\n');

    // Code frame with ANSI colors
    if let Some(ref file) = error.file {
        if let Some(code_frame) = render_code_frame(file, error.line, error.column, root_dir) {
            out.push_str(&code_frame);
            out.push('\n');
        }
    }

    // Error message
    out.push_str(&format!(" {}\n", error.message.red().bold()));

    // Suggestion
    if let Some(ref suggestion) = error.suggestion {
        out.push_str(&format!(
            "\n {} {}\n",
            "Suggestion:".yellow().bold(),
            suggestion
        ));
    }

    out.push('\n');
    out
}

/// Render an ANSI-colored code frame from the source file.
///
/// Reads the source file directly (not from the pre-built snippet)
/// so we get full control over formatting, gutter alignment, and
/// column-accurate error markers.
fn render_code_frame(
    file_path: &str,
    error_line: Option<u32>,
    error_column: Option<u32>,
    _root_dir: Option<&Path>,
) -> Option<String> {
    let source = std::fs::read_to_string(file_path).ok()?;
    let lines: Vec<&str> = source.lines().collect();

    let error_line = error_line?;
    if error_line == 0 || lines.is_empty() {
        return None;
    }

    let line_idx = (error_line - 1) as usize;
    let context = 3usize;
    let start = line_idx.saturating_sub(context);
    let end = (line_idx + context + 1).min(lines.len());

    // Gutter width based on the largest line number
    let gutter_width = format!("{}", end).len();

    let mut out = String::new();

    for (i, line_content) in lines.iter().enumerate().take(end).skip(start) {
        let line_num = i + 1;
        let is_error_line = line_num == error_line as usize;

        if is_error_line {
            // Error line: red marker, highlighted
            out.push_str(&format!(
                " {} {} {} {}\n",
                ">".red().bold(),
                format!("{:>width$}", line_num, width = gutter_width)
                    .red()
                    .bold(),
                "│".dimmed(),
                line_content.white().bold(),
            ));

            // Column marker line
            if let Some(col) = error_column {
                let col_idx = (col as usize).saturating_sub(1);
                // Calculate the underline: from column to end of meaningful content
                let underline_len = if col_idx < line_content.len() {
                    // Underline to end of line (trimmed) or at least 1 char
                    let remaining = line_content[col_idx..].trim_end().len();
                    remaining.max(1)
                } else {
                    1
                };

                let padding = " ".repeat(col_idx);
                let marker = "^".repeat(underline_len);

                out.push_str(&format!(
                    "   {} {} {}{}\n",
                    " ".repeat(gutter_width),
                    "│".dimmed(),
                    padding,
                    marker.red().bold(),
                ));
            }
        } else {
            // Context line: dimmed
            out.push_str(&format!(
                "   {} {} {}\n",
                format!("{:>width$}", line_num, width = gutter_width).dimmed(),
                "│".dimmed(),
                line_content.dimmed(),
            ));
        }
    }

    Some(out)
}

/// Make a file path relative to the root dir for display.
fn make_relative(file_path: &str, root_dir: Option<&Path>) -> String {
    if let Some(root) = root_dir {
        let root_str = root.to_string_lossy();
        if let Some(rel) = file_path.strip_prefix(root_str.as_ref()) {
            return rel.trim_start_matches('/').to_string();
        }
    }
    file_path.to_string()
}

/// Format a list of errors for terminal output.
pub fn format_errors(errors: &[&DevError], root_dir: Option<&Path>) -> String {
    let mut out = String::new();
    for error in errors {
        out.push_str(&format_error(error, root_dir));
    }

    if errors.len() > 1 {
        out.push_str(&format!(
            " {} {}\n\n",
            format!("{} errors", errors.len()).red().bold(),
            "found".dimmed(),
        ));
    }

    out
}

/// Write errors to the `.vertz/dev/errors.json` file for LLM consumption.
///
/// This file is atomically updated whenever the error state changes,
/// making it easy for Claude or other LLMs to read the current errors.
pub fn write_error_log(errors: &[DevError], root_dir: &Path) {
    let vertz_dir = root_dir.join(".vertz").join("dev");
    if std::fs::create_dir_all(&vertz_dir).is_err() {
        return;
    }

    let log_path = vertz_dir.join("errors.json");

    let output = serde_json::json!({
        "errors": errors,
        "count": errors.len(),
        "timestamp": chrono_now(),
    });

    let json = serde_json::to_string_pretty(&output).unwrap_or_else(|_| "{}".to_string());

    // Atomic write: write to tmp file then rename
    let tmp_path = vertz_dir.join("errors.json.tmp");
    if std::fs::write(&tmp_path, &json).is_ok() {
        let _ = std::fs::rename(&tmp_path, &log_path);
    }
}

/// Simple ISO-ish timestamp without pulling in chrono.
fn chrono_now() -> String {
    // Use std::time for a Unix timestamp — good enough for LLM consumption
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::categories::DevError;

    #[test]
    fn test_make_relative_strips_root() {
        let root = Path::new("/Users/dev/project");
        assert_eq!(
            make_relative("/Users/dev/project/src/app.tsx", Some(root)),
            "src/app.tsx"
        );
    }

    #[test]
    fn test_make_relative_without_root() {
        assert_eq!(
            make_relative("/Users/dev/project/src/app.tsx", None),
            "/Users/dev/project/src/app.tsx"
        );
    }

    #[test]
    fn test_make_relative_non_matching_root() {
        let root = Path::new("/other/path");
        assert_eq!(
            make_relative("/Users/dev/project/src/app.tsx", Some(root)),
            "/Users/dev/project/src/app.tsx"
        );
    }

    #[test]
    fn test_format_error_contains_badge() {
        let error = DevError::build("Unexpected token");
        let output = format_error(&error, None);
        // ANSI stripped for content check
        assert!(output.contains("BUILD ERROR"));
    }

    #[test]
    fn test_format_error_contains_message() {
        let error = DevError::build("Unexpected token ':'");
        let output = format_error(&error, None);
        assert!(output.contains("Unexpected token ':'"));
    }

    #[test]
    fn test_format_error_with_file_location() {
        let error = DevError::build("Syntax error")
            .with_file("/project/src/app.tsx")
            .with_location(10, 5);
        let root = Path::new("/project");
        let output = format_error(&error, Some(root));
        assert!(output.contains("src/app.tsx:10:5"));
    }

    #[test]
    fn test_format_error_with_suggestion() {
        let error = DevError::build("Missing semicolon")
            .with_suggestion("Add a semicolon at the end of the statement");
        let output = format_error(&error, None);
        assert!(output.contains("Suggestion:"));
        assert!(output.contains("Add a semicolon"));
    }

    #[test]
    fn test_format_errors_multiple() {
        let e1 = DevError::build("Error 1");
        let e2 = DevError::build("Error 2");
        let refs: Vec<&DevError> = vec![&e1, &e2];
        let output = format_errors(&refs, None);
        assert!(output.contains("2 errors"));
    }

    #[test]
    fn test_format_errors_single_no_count() {
        let e1 = DevError::build("Error 1");
        let refs: Vec<&DevError> = vec![&e1];
        let output = format_errors(&refs, None);
        assert!(!output.contains("errors"));
    }

    #[test]
    fn test_render_code_frame_nonexistent_file() {
        let result = render_code_frame("/nonexistent/file.tsx", Some(5), Some(1), None);
        assert!(result.is_none());
    }

    #[test]
    fn test_render_code_frame_zero_line() {
        // Create a temp file
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), "line 1\nline 2\n").unwrap();
        let result = render_code_frame(tmp.path().to_str().unwrap(), Some(0), Some(1), None);
        assert!(result.is_none());
    }

    #[test]
    fn test_render_code_frame_produces_output() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), "const a = 1;\nconst b = ;\nconst c = 3;\n").unwrap();
        let result = render_code_frame(tmp.path().to_str().unwrap(), Some(2), Some(11), None);
        assert!(result.is_some());
        let frame = result.unwrap();
        // Should contain the error line marker
        assert!(frame.contains(">"));
        // Should contain line numbers
        assert!(frame.contains("2"));
    }

    #[test]
    fn test_write_error_log_creates_file() {
        let tmp = tempfile::tempdir().unwrap();
        let errors = vec![DevError::build("test error")];
        write_error_log(&errors, tmp.path());

        let log_path = tmp.path().join(".vertz/dev/errors.json");
        assert!(log_path.exists());

        let content = std::fs::read_to_string(&log_path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed["count"], 1);
        assert_eq!(parsed["errors"][0]["message"], "test error");
    }

    #[test]
    fn test_write_error_log_empty_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let errors: Vec<DevError> = vec![];
        write_error_log(&errors, tmp.path());

        let log_path = tmp.path().join(".vertz/dev/errors.json");
        assert!(log_path.exists());

        let content = std::fs::read_to_string(&log_path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed["count"], 0);
    }

    #[test]
    fn test_chrono_now_returns_nonzero() {
        let ts = chrono_now();
        let num: u64 = ts.parse().unwrap();
        assert!(num > 0);
    }

    #[test]
    fn test_category_badges() {
        let build = DevError::build("err");
        let resolve = DevError::resolve("err");
        let typecheck = DevError::typecheck("err");
        let ssr = DevError::ssr("err");
        let runtime = DevError::runtime("err");

        assert!(format_error(&build, None).contains("BUILD ERROR"));
        assert!(format_error(&resolve, None).contains("RESOLVE ERROR"));
        assert!(format_error(&typecheck, None).contains("TYPECHECK ERROR"));
        assert!(format_error(&ssr, None).contains("SSR ERROR"));
        assert!(format_error(&runtime, None).contains("RUNTIME ERROR"));
    }
}
