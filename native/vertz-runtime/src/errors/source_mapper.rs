use crate::compiler::cache::CompilationCache;
use serde::Deserialize;
use std::path::Path;

/// A source-mapped position: original file, line, and column.
#[derive(Debug, Clone, PartialEq)]
pub struct MappedPosition {
    /// Original source file path.
    pub file: String,
    /// Original line number (1-indexed).
    pub line: u32,
    /// Original column number (1-indexed).
    pub column: u32,
}

/// Minimal VLQ source map parser for resolving compiled positions
/// back to original source positions.
///
/// Parses the standard Source Map V3 format and provides position lookup.
pub struct SourceMapper<'a> {
    cache: &'a CompilationCache,
}

impl<'a> SourceMapper<'a> {
    pub fn new(cache: &'a CompilationCache) -> Self {
        Self { cache }
    }

    /// Resolve a compiled position back to the original source.
    ///
    /// Given a compiled file path and position, looks up the source map
    /// from the compilation cache and maps back to the original position.
    pub fn resolve(
        &self,
        compiled_file: &Path,
        compiled_line: u32,
        compiled_column: u32,
    ) -> Option<MappedPosition> {
        // Get the source map from cache
        let cached = self.cache.get_unchecked(compiled_file)?;
        let source_map_json = cached.source_map.as_ref()?;

        // Parse the source map
        let sm: SourceMapV3 = serde_json::from_str(source_map_json).ok()?;

        // Decode mappings and find the position
        resolve_from_source_map(&sm, compiled_line, compiled_column)
    }

    /// Map a stack trace line like "at functionName (file:line:col)" to original positions.
    ///
    /// Returns the stack trace with original file/line/col where possible.
    pub fn map_stack_trace(&self, stack_trace: &str) -> String {
        let mut result = String::new();

        for line in stack_trace.lines() {
            if let Some(mapped) = self.try_map_stack_line(line) {
                result.push_str(&mapped);
            } else {
                result.push_str(line);
            }
            result.push('\n');
        }

        result
    }

    /// Attempt to map a single stack trace line to original positions.
    fn try_map_stack_line(&self, line: &str) -> Option<String> {
        // Pattern: "    at functionName (file:line:col)"
        // or:      "    at file:line:col"
        let trimmed = line.trim();

        if !trimmed.starts_with("at ") {
            return None;
        }

        // Try to extract file:line:col from the line
        let (prefix, file, compiled_line, compiled_col) = parse_stack_frame(trimmed)?;

        let path = Path::new(&file);
        let mapped = self.resolve(path, compiled_line, compiled_col)?;

        Some(format!(
            "    at {} ({}:{}:{})",
            prefix, mapped.file, mapped.line, mapped.column
        ))
    }
}

/// Parse a stack frame line to extract the function name (or empty), file, line, col.
fn parse_stack_frame(line: &str) -> Option<(String, String, u32, u32)> {
    let rest = line.strip_prefix("at ")?;

    // Try "funcName (file:line:col)" pattern
    if let Some(paren_start) = rest.find('(') {
        let func_name = rest[..paren_start].trim().to_string();
        let inside = rest
            .get(paren_start + 1..rest.len().saturating_sub(1))?
            .trim();
        let (file, line, col) = parse_file_line_col(inside)?;
        return Some((func_name, file, line, col));
    }

    // Try "file:line:col" pattern (no function name)
    let (file, line, col) = parse_file_line_col(rest)?;
    Some(("<anonymous>".to_string(), file, line, col))
}

/// Parse "file:line:col" into (file, line, col).
fn parse_file_line_col(s: &str) -> Option<(String, u32, u32)> {
    // Find the last two colons to split file:line:col
    let last_colon = s.rfind(':')?;
    let col_str = &s[last_colon + 1..];

    let before_last = &s[..last_colon];
    let second_colon = before_last.rfind(':')?;
    let line_str = &before_last[second_colon + 1..];
    let file = &before_last[..second_colon];

    let line: u32 = line_str.parse().ok()?;
    let col: u32 = col_str.parse().ok()?;

    Some((file.to_string(), line, col))
}

/// Minimal Source Map V3 structure.
#[derive(Debug, Deserialize)]
struct SourceMapV3 {
    /// Source file paths referenced by the mappings.
    sources: Vec<String>,
    /// VLQ-encoded mappings string.
    mappings: String,
}

/// A decoded mapping segment.
#[derive(Debug, Clone)]
struct MappingSegment {
    /// Generated column (0-indexed).
    gen_column: u32,
    /// Source file index.
    source_idx: u32,
    /// Original line (0-indexed).
    orig_line: u32,
    /// Original column (0-indexed).
    orig_column: u32,
}

/// Decode VLQ mappings and find the original position for a given compiled position.
fn resolve_from_source_map(
    sm: &SourceMapV3,
    compiled_line: u32,
    compiled_column: u32,
) -> Option<MappedPosition> {
    let segments = decode_mappings(&sm.mappings);

    // Find the line group for compiled_line (1-indexed → 0-indexed)
    let target_line = compiled_line.saturating_sub(1);
    let target_col = compiled_column.saturating_sub(1);

    // Group segments by generated line
    let mut current_line: u32 = 0;
    let mut best_match: Option<&MappingSegment> = None;

    for seg in &segments {
        if seg.gen_column == u32::MAX {
            // Line separator marker
            current_line += 1;
            continue;
        }

        if current_line == target_line {
            match best_match {
                None => best_match = Some(seg),
                Some(prev) if seg.gen_column <= target_col && seg.gen_column >= prev.gen_column => {
                    best_match = Some(seg);
                }
                _ => {}
            }
        }
    }

    let seg = best_match?;
    let source = sm.sources.get(seg.source_idx as usize)?;

    Some(MappedPosition {
        file: source.clone(),
        line: seg.orig_line + 1,     // back to 1-indexed
        column: seg.orig_column + 1, // back to 1-indexed
    })
}

/// Decode VLQ-encoded source map mappings into segments.
///
/// The mappings string uses:
/// - `;` to separate generated lines
/// - `,` to separate segments within a line
/// - VLQ-encoded integers for each segment field
fn decode_mappings(mappings: &str) -> Vec<MappingSegment> {
    let mut segments = Vec::new();
    let mut source_idx: i64 = 0;
    let mut orig_line: i64 = 0;
    let mut orig_column: i64 = 0;

    for group in mappings.split(';') {
        let mut gen_column: i64 = 0; // Reset column for each line

        if group.is_empty() {
            // Empty group = line with no mappings
            segments.push(MappingSegment {
                gen_column: u32::MAX, // sentinel for line separator
                source_idx: 0,
                orig_line: 0,
                orig_column: 0,
            });
            continue;
        }

        for segment_str in group.split(',') {
            let values = decode_vlq(segment_str);
            if values.is_empty() {
                continue;
            }

            gen_column += values[0];

            if values.len() >= 4 {
                source_idx += values[1];
                orig_line += values[2];
                orig_column += values[3];

                segments.push(MappingSegment {
                    gen_column: gen_column as u32,
                    source_idx: source_idx as u32,
                    orig_line: orig_line as u32,
                    orig_column: orig_column as u32,
                });
            }
        }

        // Add line separator
        segments.push(MappingSegment {
            gen_column: u32::MAX,
            source_idx: 0,
            orig_line: 0,
            orig_column: 0,
        });
    }

    segments
}

/// Decode a VLQ-encoded string into a list of integers.
fn decode_vlq(s: &str) -> Vec<i64> {
    const VLQ_BASE_SHIFT: u32 = 5;
    const VLQ_BASE: i64 = 1 << VLQ_BASE_SHIFT;
    const VLQ_BASE_MASK: i64 = VLQ_BASE - 1;
    const VLQ_CONTINUATION_BIT: i64 = VLQ_BASE;

    let mut result = Vec::new();
    let mut shift: u32 = 0;
    let mut value: i64 = 0;

    for ch in s.chars() {
        let digit = vlq_char_to_int(ch);
        if digit < 0 {
            continue;
        }
        let digit = digit as i64;

        value += (digit & VLQ_BASE_MASK) << shift;
        shift += VLQ_BASE_SHIFT;

        if (digit & VLQ_CONTINUATION_BIT) == 0 {
            // Lowest bit is sign
            let is_negative = (value & 1) == 1;
            let abs_value = value >> 1;
            result.push(if is_negative { -abs_value } else { abs_value });
            value = 0;
            shift = 0;
        }
    }

    result
}

/// Convert a Base64-VLQ character to its integer value.
fn vlq_char_to_int(ch: char) -> i32 {
    match ch {
        'A'..='Z' => (ch as i32) - ('A' as i32),
        'a'..='z' => (ch as i32) - ('a' as i32) + 26,
        '0'..='9' => (ch as i32) - ('0' as i32) + 52,
        '+' => 62,
        '/' => 63,
        _ => -1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compiler::cache::{CachedModule, CompilationCache};
    use std::path::PathBuf;
    use std::time::SystemTime;

    // ── VLQ decoding tests ──

    #[test]
    fn test_vlq_char_to_int() {
        assert_eq!(vlq_char_to_int('A'), 0);
        assert_eq!(vlq_char_to_int('Z'), 25);
        assert_eq!(vlq_char_to_int('a'), 26);
        assert_eq!(vlq_char_to_int('z'), 51);
        assert_eq!(vlq_char_to_int('0'), 52);
        assert_eq!(vlq_char_to_int('9'), 61);
        assert_eq!(vlq_char_to_int('+'), 62);
        assert_eq!(vlq_char_to_int('/'), 63);
        assert_eq!(vlq_char_to_int('!'), -1);
    }

    #[test]
    fn test_decode_vlq_simple() {
        // "AAAA" encodes [0, 0, 0, 0]
        assert_eq!(decode_vlq("AAAA"), vec![0, 0, 0, 0]);
    }

    #[test]
    fn test_decode_vlq_positive() {
        // "CAAC" encodes [1, 0, 0, 1]
        assert_eq!(decode_vlq("CAAC"), vec![1, 0, 0, 1]);
    }

    #[test]
    fn test_decode_vlq_negative() {
        // "D" encodes [-1]
        assert_eq!(decode_vlq("D"), vec![-1]);
    }

    // ── parse_file_line_col tests ──

    #[test]
    fn test_parse_file_line_col_basic() {
        let result = parse_file_line_col("/src/app.tsx:10:5");
        assert_eq!(result, Some(("/src/app.tsx".to_string(), 10, 5)));
    }

    #[test]
    fn test_parse_file_line_col_windows_path() {
        let result = parse_file_line_col("C:\\project\\src\\app.tsx:10:5");
        assert_eq!(
            result,
            Some(("C:\\project\\src\\app.tsx".to_string(), 10, 5))
        );
    }

    // ── parse_stack_frame tests ──

    #[test]
    fn test_parse_stack_frame_with_func() {
        let result = parse_stack_frame("at render (/src/app.tsx:10:5)");
        assert!(result.is_some());
        let (func, file, line, col) = result.unwrap();
        assert_eq!(func, "render");
        assert_eq!(file, "/src/app.tsx");
        assert_eq!(line, 10);
        assert_eq!(col, 5);
    }

    #[test]
    fn test_parse_stack_frame_anonymous() {
        let result = parse_stack_frame("at /src/app.tsx:10:5");
        assert!(result.is_some());
        let (func, _, _, _) = result.unwrap();
        assert_eq!(func, "<anonymous>");
    }

    // ── Source map resolution tests ──

    #[test]
    fn test_resolve_from_simple_source_map() {
        let sm = SourceMapV3 {
            sources: vec!["src/app.tsx".to_string()],
            // "AAAA" on the first line means gen_col=0, source=0, orig_line=0, orig_col=0
            mappings: "AAAA".to_string(),
        };

        let result = resolve_from_source_map(&sm, 1, 1);
        assert!(result.is_some());
        let pos = result.unwrap();
        assert_eq!(pos.file, "src/app.tsx");
        assert_eq!(pos.line, 1);
        assert_eq!(pos.column, 1);
    }

    #[test]
    fn test_resolve_returns_none_for_empty_mappings() {
        let sm = SourceMapV3 {
            sources: vec!["src/app.tsx".to_string()],
            mappings: "".to_string(),
        };

        let result = resolve_from_source_map(&sm, 1, 1);
        assert!(result.is_none());
    }

    // ── SourceMapper with cache tests ──

    #[test]
    fn test_source_mapper_resolve_from_cache() {
        let cache = CompilationCache::new();

        let source_map = serde_json::json!({
            "version": 3,
            "sources": ["src/Button.tsx"],
            "mappings": "AAAA"
        })
        .to_string();

        let path = PathBuf::from("/project/src/Button.tsx");
        cache.insert(
            path.clone(),
            CachedModule {
                code: "compiled".to_string(),
                source_map: Some(source_map),
                css: None,
                mtime: SystemTime::UNIX_EPOCH,
            },
        );

        let mapper = SourceMapper::new(&cache);
        let result = mapper.resolve(&path, 1, 1);
        assert!(result.is_some());
        assert_eq!(result.unwrap().file, "src/Button.tsx");
    }

    #[test]
    fn test_source_mapper_returns_none_without_source_map() {
        let cache = CompilationCache::new();

        let path = PathBuf::from("/project/src/app.tsx");
        cache.insert(
            path.clone(),
            CachedModule {
                code: "compiled".to_string(),
                source_map: None,
                css: None,
                mtime: SystemTime::UNIX_EPOCH,
            },
        );

        let mapper = SourceMapper::new(&cache);
        assert!(mapper.resolve(&path, 1, 1).is_none());
    }

    #[test]
    fn test_source_mapper_returns_none_for_uncached() {
        let cache = CompilationCache::new();
        let mapper = SourceMapper::new(&cache);

        assert!(mapper.resolve(Path::new("/nonexistent"), 1, 1).is_none());
    }

    // ── Stack trace mapping tests ──

    #[test]
    fn test_map_stack_trace_preserves_unmapped_lines() {
        let cache = CompilationCache::new();
        let mapper = SourceMapper::new(&cache);

        let trace = "Error: oops\n    at something\n    at other thing";
        let result = mapper.map_stack_trace(trace);

        // Non-parseable lines are preserved as-is
        assert!(result.contains("Error: oops"));
    }
}
