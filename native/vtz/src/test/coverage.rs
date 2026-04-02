use std::collections::HashMap;
use std::path::PathBuf;

/// Source map lookup function: given a script URL, returns (original file, line mappings).
/// Each line mapping is (line_number, byte_offset).
pub type SourceMapLookup = dyn Fn(&str) -> Option<(String, Vec<(u32, u32)>)>;

/// Coverage data for a single file.
#[derive(Debug, Clone)]
pub struct FileCoverage {
    /// Absolute path to the source file.
    pub file: PathBuf,
    /// Line coverage: line number (1-indexed) → hit count.
    pub lines: HashMap<u32, u32>,
    /// Total executable lines (lines with code).
    pub total_lines: usize,
    /// Lines that were executed at least once.
    pub covered_lines: usize,
}

impl FileCoverage {
    /// Line coverage percentage (0.0 - 100.0).
    pub fn line_percentage(&self) -> f64 {
        if self.total_lines == 0 {
            return 100.0;
        }
        (self.covered_lines as f64 / self.total_lines as f64) * 100.0
    }

    /// Check if coverage meets the given threshold.
    pub fn meets_threshold(&self, threshold: f64) -> bool {
        self.line_percentage() >= threshold
    }
}

/// Aggregated coverage report for a test run.
#[derive(Debug, Clone)]
pub struct CoverageReport {
    /// Per-file coverage data.
    pub files: Vec<FileCoverage>,
}

impl CoverageReport {
    /// Overall line coverage percentage.
    pub fn total_percentage(&self) -> f64 {
        let total: usize = self.files.iter().map(|f| f.total_lines).sum();
        let covered: usize = self.files.iter().map(|f| f.covered_lines).sum();
        if total == 0 {
            return 100.0;
        }
        (covered as f64 / total as f64) * 100.0
    }

    /// Check if all files meet the given threshold.
    pub fn all_meet_threshold(&self, threshold: f64) -> bool {
        self.files.iter().all(|f| f.meets_threshold(threshold))
    }

    /// Get files that don't meet the threshold.
    pub fn files_below_threshold(&self, threshold: f64) -> Vec<&FileCoverage> {
        self.files
            .iter()
            .filter(|f| !f.meets_threshold(threshold))
            .collect()
    }
}

/// Format a coverage report as LCOV tracefile.
///
/// LCOV format reference: <https://ltp.sourceforge.net/coverage/lcov/geninfo.1.php>
pub fn format_lcov(report: &CoverageReport) -> String {
    let mut output = String::new();

    for file in &report.files {
        // TN: test name (optional, left empty)
        output.push_str("TN:\n");
        // SF: source file path
        output.push_str(&format!("SF:{}\n", file.file.display()));

        // DA: line data (line_number, hit_count)
        let mut lines: Vec<(&u32, &u32)> = file.lines.iter().collect();
        lines.sort_by_key(|&(line, _)| *line);
        for (line, hits) in &lines {
            output.push_str(&format!("DA:{},{}\n", line, hits));
        }

        // LF: lines found (total executable lines)
        output.push_str(&format!("LF:{}\n", file.total_lines));
        // LH: lines hit (covered lines)
        output.push_str(&format!("LH:{}\n", file.covered_lines));
        // end_of_record
        output.push_str("end_of_record\n");
    }

    output
}

/// Format a coverage report for terminal output.
pub fn format_terminal(report: &CoverageReport, threshold: f64) -> String {
    let mut output = String::new();

    output.push_str("\n--- Coverage Report ---\n\n");
    output.push_str(&format!(
        "{:<50} {:>8} {:>8} {:>8}\n",
        "File", "Lines", "Covered", "  %"
    ));
    output.push_str(&format!("{}\n", "-".repeat(78)));

    for file in &report.files {
        let pct = file.line_percentage();
        let indicator = if file.meets_threshold(threshold) {
            "\x1B[32m✓\x1B[0m"
        } else {
            "\x1B[31m✗\x1B[0m"
        };

        let file_display = file
            .file
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("?");

        output.push_str(&format!(
            "{:<50} {:>8} {:>8} {:>6.1}% {}\n",
            file_display, file.total_lines, file.covered_lines, pct, indicator
        ));
    }

    output.push_str(&format!("{}\n", "-".repeat(78)));
    output.push_str(&format!(
        "{:<50} {:>8} {:>8} {:>6.1}%\n",
        "Total",
        report.files.iter().map(|f| f.total_lines).sum::<usize>(),
        report.files.iter().map(|f| f.covered_lines).sum::<usize>(),
        report.total_percentage()
    ));

    let below = report.files_below_threshold(threshold);
    if !below.is_empty() {
        output.push_str(&format!(
            "\n\x1B[31m{} file(s) below {}% threshold:\x1B[0m\n",
            below.len(),
            threshold
        ));
        for f in &below {
            output.push_str(&format!(
                "  {} ({:.1}%)\n",
                f.file.display(),
                f.line_percentage()
            ));
        }
    }

    output
}

/// Parse V8 precise coverage result (from CDP Profiler.takePreciseCoverage) into FileCoverage.
///
/// The CDP result contains `result` array of ScriptCoverage objects:
/// ```json
/// { "result": [
///   { "scriptId": "123", "url": "file:///path/to/file.js",
///     "functions": [
///       { "functionName": "", "ranges": [
///           { "startOffset": 0, "endOffset": 100, "count": 1 },
///           { "startOffset": 50, "endOffset": 80, "count": 0 }
///         ]
///       }
///     ]
///   }
/// ]}
/// ```
pub fn parse_v8_coverage(
    coverage_json: &serde_json::Value,
    source_map_lookup: &SourceMapLookup,
) -> Vec<FileCoverage> {
    let result = match coverage_json.get("result") {
        Some(r) => r,
        None => return vec![],
    };

    let scripts = match result.as_array() {
        Some(a) => a,
        None => return vec![],
    };

    let mut coverages = Vec::new();

    for script in scripts {
        let url = script["url"].as_str().unwrap_or("");
        // Skip internal/harness scripts
        if url.is_empty()
            || url.starts_with("[vertz:")
            || url.contains("node_modules")
            || url.starts_with("ext:")
        {
            continue;
        }

        // Extract file path from URL
        let file_path = if let Some(path) = url.strip_prefix("file://") {
            PathBuf::from(path)
        } else {
            PathBuf::from(url)
        };

        // Collect all ranges with their counts
        let functions = match script["functions"].as_array() {
            Some(f) => f,
            None => continue,
        };

        let mut line_hits: HashMap<u32, u32> = HashMap::new();

        for func in functions {
            let ranges = match func["ranges"].as_array() {
                Some(r) => r,
                None => continue,
            };

            for range in ranges {
                let count = range["count"].as_u64().unwrap_or(0) as u32;
                let start_offset = range["startOffset"].as_u64().unwrap_or(0) as u32;
                let end_offset = range["endOffset"].as_u64().unwrap_or(0) as u32;

                // Use source map to convert byte offsets to line numbers
                if let Some((_, line_mappings)) = source_map_lookup(url) {
                    for (line, offset) in &line_mappings {
                        if *offset >= start_offset && *offset < end_offset {
                            let entry = line_hits.entry(*line).or_insert(0);
                            *entry = (*entry).max(count);
                        }
                    }
                } else {
                    // No source map — use rough line estimate (1 line per ~40 chars)
                    let start_line = start_offset / 40 + 1;
                    let end_line = end_offset / 40 + 1;
                    for line in start_line..=end_line {
                        let entry = line_hits.entry(line).or_insert(0);
                        *entry = (*entry).max(count);
                    }
                }
            }
        }

        let total_lines = line_hits.len();
        let covered_lines = line_hits.values().filter(|&&c| c > 0).count();

        coverages.push(FileCoverage {
            file: file_path,
            lines: line_hits,
            total_lines,
            covered_lines,
        });
    }

    coverages
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_file_coverage(file: &str, total: usize, covered: usize) -> FileCoverage {
        let mut lines = HashMap::new();
        for i in 1..=total as u32 {
            lines.insert(i, if (i as usize) <= covered { 1 } else { 0 });
        }
        FileCoverage {
            file: PathBuf::from(file),
            lines,
            total_lines: total,
            covered_lines: covered,
        }
    }

    #[test]
    fn test_file_coverage_percentage_full() {
        let fc = make_file_coverage("a.ts", 10, 10);
        assert_eq!(fc.line_percentage(), 100.0);
    }

    #[test]
    fn test_file_coverage_percentage_partial() {
        let fc = make_file_coverage("a.ts", 10, 8);
        assert!((fc.line_percentage() - 80.0).abs() < 0.01);
    }

    #[test]
    fn test_file_coverage_percentage_zero_lines() {
        let fc = FileCoverage {
            file: PathBuf::from("empty.ts"),
            lines: HashMap::new(),
            total_lines: 0,
            covered_lines: 0,
        };
        assert_eq!(fc.line_percentage(), 100.0);
    }

    #[test]
    fn test_file_coverage_meets_threshold() {
        let fc = make_file_coverage("a.ts", 100, 95);
        assert!(fc.meets_threshold(95.0));
        assert!(!fc.meets_threshold(96.0));
    }

    #[test]
    fn test_report_total_percentage() {
        let report = CoverageReport {
            files: vec![
                make_file_coverage("a.ts", 10, 10),
                make_file_coverage("b.ts", 10, 5),
            ],
        };
        assert!((report.total_percentage() - 75.0).abs() < 0.01);
    }

    #[test]
    fn test_report_all_meet_threshold() {
        let report = CoverageReport {
            files: vec![
                make_file_coverage("a.ts", 10, 10),
                make_file_coverage("b.ts", 10, 10),
            ],
        };
        assert!(report.all_meet_threshold(95.0));
    }

    #[test]
    fn test_report_not_all_meet_threshold() {
        let report = CoverageReport {
            files: vec![
                make_file_coverage("a.ts", 10, 10),
                make_file_coverage("b.ts", 10, 5),
            ],
        };
        assert!(!report.all_meet_threshold(95.0));
    }

    #[test]
    fn test_files_below_threshold() {
        let report = CoverageReport {
            files: vec![
                make_file_coverage("a.ts", 10, 10),
                make_file_coverage("b.ts", 10, 5),
            ],
        };
        let below = report.files_below_threshold(95.0);
        assert_eq!(below.len(), 1);
        assert_eq!(below[0].file, PathBuf::from("b.ts"));
    }

    #[test]
    fn test_format_lcov_single_file() {
        let mut lines = HashMap::new();
        lines.insert(1, 1);
        lines.insert(2, 1);
        lines.insert(3, 0);
        let report = CoverageReport {
            files: vec![FileCoverage {
                file: PathBuf::from("/src/math.ts"),
                lines,
                total_lines: 3,
                covered_lines: 2,
            }],
        };

        let lcov = format_lcov(&report);

        assert!(lcov.contains("TN:"));
        assert!(lcov.contains("SF:/src/math.ts"));
        assert!(lcov.contains("DA:1,1"));
        assert!(lcov.contains("DA:2,1"));
        assert!(lcov.contains("DA:3,0"));
        assert!(lcov.contains("LF:3"));
        assert!(lcov.contains("LH:2"));
        assert!(lcov.contains("end_of_record"));
    }

    #[test]
    fn test_format_lcov_multiple_files() {
        let report = CoverageReport {
            files: vec![
                make_file_coverage("/src/a.ts", 2, 2),
                make_file_coverage("/src/b.ts", 3, 1),
            ],
        };

        let lcov = format_lcov(&report);

        // Should have two records
        assert_eq!(lcov.matches("end_of_record").count(), 2);
        assert!(lcov.contains("SF:/src/a.ts"));
        assert!(lcov.contains("SF:/src/b.ts"));
    }

    #[test]
    fn test_format_terminal_output() {
        let report = CoverageReport {
            files: vec![
                make_file_coverage("src/math.ts", 10, 10),
                make_file_coverage("src/utils.ts", 10, 7),
            ],
        };

        let output = format_terminal(&report, 95.0);

        assert!(output.contains("Coverage Report"));
        assert!(output.contains("math.ts"));
        assert!(output.contains("utils.ts"));
        assert!(output.contains("100.0%"));
        assert!(output.contains("70.0%"));
        assert!(output.contains("below 95%"));
    }

    #[test]
    fn test_format_terminal_all_passing() {
        let report = CoverageReport {
            files: vec![make_file_coverage("src/math.ts", 10, 10)],
        };

        let output = format_terminal(&report, 95.0);
        assert!(!output.contains("below"));
    }

    #[test]
    fn test_parse_v8_coverage_empty() {
        let json = serde_json::json!({ "result": [] });
        let result = parse_v8_coverage(&json, &|_| None);
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_v8_coverage_skips_internal() {
        let json = serde_json::json!({
            "result": [
                {
                    "scriptId": "1",
                    "url": "[vertz:test-harness]",
                    "functions": []
                },
                {
                    "scriptId": "2",
                    "url": "",
                    "functions": []
                }
            ]
        });
        let result = parse_v8_coverage(&json, &|_| None);
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_v8_coverage_with_ranges() {
        let json = serde_json::json!({
            "result": [
                {
                    "scriptId": "1",
                    "url": "file:///src/math.ts",
                    "functions": [
                        {
                            "functionName": "add",
                            "ranges": [
                                { "startOffset": 0, "endOffset": 120, "count": 1 },
                                { "startOffset": 40, "endOffset": 80, "count": 0 }
                            ]
                        }
                    ]
                }
            ]
        });

        let result = parse_v8_coverage(&json, &|_| None);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].file, PathBuf::from("/src/math.ts"));
        // Without source map, uses rough line estimate
        assert!(result[0].total_lines > 0);
    }

    #[test]
    fn test_parse_v8_coverage_no_result_key() {
        let json = serde_json::json!({});
        let result = parse_v8_coverage(&json, &|_| None);
        assert!(result.is_empty());
    }

    #[test]
    fn test_report_empty() {
        let report = CoverageReport { files: vec![] };
        assert_eq!(report.total_percentage(), 100.0);
        assert!(report.all_meet_threshold(95.0));
    }
}
