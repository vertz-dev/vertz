use std::collections::HashMap;
use std::path::PathBuf;

/// Source map resolver: given a script URL and byte offset, returns
/// (original_file, original_line) or None if unmapped.
pub type SourceMapResolver = dyn Fn(&str, u32) -> Option<(String, u32)>;

/// Convert a byte offset to (line, column) using a precomputed newline index.
///
/// Returns 1-indexed (line, column). The newline index is a sorted list of byte
/// offsets where newline characters occur in the source.
pub fn byte_offset_to_line_col(newline_index: &[u32], offset: u32) -> (u32, u32) {
    let line = newline_index.partition_point(|&nl| nl < offset);
    let col = if line == 0 {
        offset
    } else {
        offset - newline_index[line - 1] - 1
    };
    (line as u32 + 1, col + 1)
}

/// Coverage data for a single branch point.
#[derive(Debug, Clone)]
pub struct BranchCoverage {
    /// Line number of the branch point in original source (1-indexed).
    pub line: u32,
    /// Block number (groups related branches, e.g., both sides of an if/else share a block).
    pub block_number: u32,
    /// Branch number within the block (0 = first branch, 1 = second, etc.).
    pub branch_number: u32,
    /// Execution count.
    pub count: u32,
}

/// Coverage data for a single function.
#[derive(Debug, Clone)]
pub struct FunctionCoverage {
    /// Function name. Anonymous functions use "(anonymous_N)" with per-file counter.
    pub name: String,
    /// Start line in original source (1-indexed).
    pub start_line: u32,
    /// Execution count.
    pub count: u32,
}

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
    /// Function coverage data.
    pub functions: Vec<FunctionCoverage>,
    /// Branch coverage data.
    pub branches: Vec<BranchCoverage>,
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

    /// Total number of functions found.
    pub fn total_functions(&self) -> usize {
        self.functions.len()
    }

    /// Number of functions executed at least once.
    pub fn covered_functions(&self) -> usize {
        self.functions.iter().filter(|f| f.count > 0).count()
    }

    /// Function coverage percentage (0.0 - 100.0).
    pub fn function_percentage(&self) -> f64 {
        if self.functions.is_empty() {
            return 100.0;
        }
        (self.covered_functions() as f64 / self.total_functions() as f64) * 100.0
    }

    /// Total number of branches found.
    pub fn total_branches(&self) -> usize {
        self.branches.len()
    }

    /// Number of branches executed at least once.
    pub fn covered_branches(&self) -> usize {
        self.branches.iter().filter(|b| b.count > 0).count()
    }

    /// Branch coverage percentage (0.0 - 100.0).
    pub fn branch_percentage(&self) -> f64 {
        if self.branches.is_empty() {
            return 100.0;
        }
        (self.covered_branches() as f64 / self.total_branches() as f64) * 100.0
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

    /// Overall function coverage percentage across all files.
    pub fn total_function_percentage(&self) -> f64 {
        let total: usize = self.files.iter().map(|f| f.total_functions()).sum();
        let covered: usize = self.files.iter().map(|f| f.covered_functions()).sum();
        if total == 0 {
            return 100.0;
        }
        (covered as f64 / total as f64) * 100.0
    }

    /// Overall branch coverage percentage across all files.
    pub fn total_branch_percentage(&self) -> f64 {
        let total: usize = self.files.iter().map(|f| f.total_branches()).sum();
        let covered: usize = self.files.iter().map(|f| f.covered_branches()).sum();
        if total == 0 {
            return 100.0;
        }
        (covered as f64 / total as f64) * 100.0
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

        // FN: function declarations (start_line,name)
        for func in &file.functions {
            output.push_str(&format!("FN:{},{}\n", func.start_line, func.name));
        }
        // FNDA: function execution data (count,name)
        for func in &file.functions {
            output.push_str(&format!("FNDA:{},{}\n", func.count, func.name));
        }
        // FNF: functions found
        output.push_str(&format!("FNF:{}\n", file.total_functions()));
        // FNH: functions hit
        output.push_str(&format!("FNH:{}\n", file.covered_functions()));

        // BRDA: branch data (line,block_number,branch_number,count)
        let mut sorted_branches: Vec<&BranchCoverage> = file.branches.iter().collect();
        sorted_branches.sort_by_key(|b| (b.line, b.block_number, b.branch_number));
        for branch in &sorted_branches {
            output.push_str(&format!(
                "BRDA:{},{},{},{}\n",
                branch.line, branch.block_number, branch.branch_number, branch.count
            ));
        }
        // BRF: branches found
        output.push_str(&format!("BRF:{}\n", file.total_branches()));
        // BRH: branches hit
        output.push_str(&format!("BRH:{}\n", file.covered_branches()));

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
        "{:<50} {:>8} {:>8} {:>8} {:>8} {:>8}\n",
        "File", "Lines", "Covered", "Line%", "Branch%", "Fn%"
    ));
    output.push_str(&format!("{}\n", "-".repeat(98)));

    for file in &report.files {
        let pct = file.line_percentage();
        let br_pct = file.branch_percentage();
        let fn_pct = file.function_percentage();
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
            "{:<50} {:>8} {:>8} {:>6.1}% {:>6.1}% {:>6.1}% {}\n",
            file_display, file.total_lines, file.covered_lines, pct, br_pct, fn_pct, indicator
        ));
    }

    output.push_str(&format!("{}\n", "-".repeat(98)));
    output.push_str(&format!(
        "{:<50} {:>8} {:>8} {:>6.1}% {:>6.1}% {:>6.1}%\n",
        "Total",
        report.files.iter().map(|f| f.total_lines).sum::<usize>(),
        report.files.iter().map(|f| f.covered_lines).sum::<usize>(),
        report.total_percentage(),
        report.total_branch_percentage(),
        report.total_function_percentage()
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
    source_map_resolver: &SourceMapResolver,
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
        let mut resolved_file: Option<String> = None;
        let mut func_coverages: Vec<FunctionCoverage> = Vec::new();
        let mut branch_coverages: Vec<BranchCoverage> = Vec::new();
        let mut block_counter: u32 = 0;
        let mut anon_counter: u32 = 0;

        for func in functions {
            let ranges = match func["ranges"].as_array() {
                Some(r) => r,
                None => continue,
            };

            // Extract function-level coverage from the first range
            if let Some(first_range) = ranges.first() {
                let func_name = func["functionName"].as_str().unwrap_or("");
                let func_count = first_range["count"].as_u64().unwrap_or(0) as u32;
                let func_start = first_range["startOffset"].as_u64().unwrap_or(0) as u32;
                let func_end = first_range["endOffset"].as_u64().unwrap_or(0) as u32;

                // Skip the module-level wrapper (startOffset==0, covers entire script)
                // V8 always includes a top-level wrapper function with empty name
                let is_module_wrapper =
                    func_name.is_empty() && func_start == 0 && ranges.len() == 1;
                // Also skip if the range covers a very large chunk with empty name (likely module wrapper)
                let is_likely_wrapper =
                    func_name.is_empty() && func_start == 0 && func_end > 100 && !ranges.is_empty();

                if !is_module_wrapper && !is_likely_wrapper {
                    let name = if func_name.is_empty() {
                        anon_counter += 1;
                        format!("(anonymous_{})", anon_counter)
                    } else {
                        func_name.to_string()
                    };

                    let start_line = if let Some((_, line)) = source_map_resolver(url, func_start) {
                        line
                    } else {
                        func_start / 40 + 1
                    };

                    func_coverages.push(FunctionCoverage {
                        name,
                        start_line,
                        count: func_count,
                    });
                }
            }

            // Branch extraction: ranges beyond the first represent blocks within the function.
            // When multiple sub-ranges have different counts, they represent branch points.
            if ranges.len() > 1 {
                let parent_count = ranges[0]["count"].as_u64().unwrap_or(0) as u32;
                // Only analyze branches for functions that were actually called
                if parent_count > 0 {
                    let sub_ranges = &ranges[1..];
                    // Group consecutive ranges into branch groups.
                    // Two or more sub-ranges with different counts from parent = branch point.
                    let mut i = 0;
                    while i < sub_ranges.len() {
                        let r = &sub_ranges[i];
                        let r_count = r["count"].as_u64().unwrap_or(0) as u32;
                        let r_start = r["startOffset"].as_u64().unwrap_or(0) as u32;

                        // Check if this range differs from parent — indicates a branch
                        if r_count != parent_count {
                            let branch_line =
                                if let Some((_, line)) = source_map_resolver(url, r_start) {
                                    line
                                } else {
                                    r_start / 40 + 1
                                };

                            block_counter += 1;
                            let current_block = block_counter;

                            // This is the "taken" branch (the block with different count)
                            branch_coverages.push(BranchCoverage {
                                line: branch_line,
                                block_number: current_block,
                                branch_number: 0,
                                count: r_count,
                            });

                            // The "not-taken" / else branch: parent_count - child_count
                            let else_count = parent_count - r_count;
                            branch_coverages.push(BranchCoverage {
                                line: branch_line,
                                block_number: current_block,
                                branch_number: 1,
                                count: else_count,
                            });
                        }

                        i += 1;
                    }
                }
            }

            for range in ranges {
                let count = range["count"].as_u64().unwrap_or(0) as u32;
                let start_offset = range["startOffset"].as_u64().unwrap_or(0) as u32;
                let end_offset = range["endOffset"].as_u64().unwrap_or(0) as u32;

                // Try source map resolution for the start offset
                if let Some((orig_file, orig_line)) = source_map_resolver(url, start_offset) {
                    if resolved_file.is_none() {
                        resolved_file = Some(orig_file);
                    }
                    let entry = line_hits.entry(orig_line).or_insert(0);
                    *entry = (*entry).max(count);

                    // Also resolve end offset to cover intermediate lines
                    if end_offset > start_offset {
                        if let Some((_, end_line)) =
                            source_map_resolver(url, end_offset.saturating_sub(1))
                        {
                            // Fill in lines between start and end
                            if end_line > orig_line {
                                for line in (orig_line + 1)..=end_line {
                                    let entry = line_hits.entry(line).or_insert(0);
                                    *entry = (*entry).max(count);
                                }
                            }
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

        // Use resolved original file path if source map was available
        let final_path = match resolved_file {
            Some(ref orig) => PathBuf::from(orig),
            None => file_path,
        };

        let total_lines = line_hits.len();
        let covered_lines = line_hits.values().filter(|&&c| c > 0).count();

        coverages.push(FileCoverage {
            file: final_path,
            lines: line_hits,
            total_lines,
            covered_lines,
            functions: func_coverages,
            branches: branch_coverages,
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
            functions: vec![],
            branches: vec![],
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
            functions: vec![],
            branches: vec![],
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
                functions: vec![],
                branches: vec![],
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
        let result = parse_v8_coverage(&json, &|_, _| None);
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
        let result = parse_v8_coverage(&json, &|_, _| None);
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

        let result = parse_v8_coverage(&json, &|_, _| None);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].file, PathBuf::from("/src/math.ts"));
        // Without source map, uses rough line estimate
        assert!(result[0].total_lines > 0);
    }

    #[test]
    fn test_parse_v8_coverage_no_result_key() {
        let json = serde_json::json!({});
        let result = parse_v8_coverage(&json, &|_, _| None);
        assert!(result.is_empty());
    }

    #[test]
    fn test_report_empty() {
        let report = CoverageReport { files: vec![] };
        assert_eq!(report.total_percentage(), 100.0);
        assert!(report.all_meet_threshold(95.0));
    }

    // ── byte_offset_to_line_col tests ──

    #[test]
    fn test_byte_offset_to_line_col_first_char() {
        // "abc\ndef\nghi" → newlines at [3, 7]
        assert_eq!(byte_offset_to_line_col(&[3, 7], 0), (1, 1));
    }

    #[test]
    fn test_byte_offset_to_line_col_second_line() {
        // Byte 4 is 'd' on line 2 (after newline at 3)
        assert_eq!(byte_offset_to_line_col(&[3, 7], 4), (2, 1));
    }

    #[test]
    fn test_byte_offset_to_line_col_third_line() {
        // Byte 8 is 'g' on line 3 (after newline at 7)
        assert_eq!(byte_offset_to_line_col(&[3, 7], 8), (3, 1));
    }

    #[test]
    fn test_byte_offset_to_line_col_single_line() {
        // No newlines — everything is line 1
        assert_eq!(byte_offset_to_line_col(&[], 5), (1, 6));
    }

    #[test]
    fn test_byte_offset_to_line_col_mid_line() {
        // Byte 5 in "abc\ndef\nghi" is 'e' on line 2, column 2
        assert_eq!(byte_offset_to_line_col(&[3, 7], 5), (2, 2));
    }

    // ── Source map resolver integration test ──

    #[test]
    fn test_parse_v8_coverage_with_source_map_resolver() {
        let json = serde_json::json!({
            "result": [
                {
                    "scriptId": "1",
                    "url": "file:///project/dist/math.js",
                    "functions": [
                        {
                            "functionName": "add",
                            "ranges": [
                                { "startOffset": 0, "endOffset": 60, "count": 1 }
                            ]
                        }
                    ]
                }
            ]
        });

        // Resolver maps compiled byte offsets to original source positions
        let resolver = |url: &str, offset: u32| -> Option<(String, u32)> {
            if url == "file:///project/dist/math.js" {
                // Map byte offsets to original lines in src/math.ts
                let line = match offset {
                    0..=19 => 1,
                    20..=39 => 2,
                    40..=59 => 3,
                    _ => return None,
                };
                Some(("src/math.ts".to_string(), line))
            } else {
                None
            }
        };

        let result = parse_v8_coverage(&json, &resolver);
        assert_eq!(result.len(), 1);
        // File path should be the original source (from resolver)
        assert_eq!(result[0].file, PathBuf::from("src/math.ts"));
        // Lines should be original source lines, not byte-offset estimates
        assert!(result[0].lines.contains_key(&1));
        assert!(result[0].lines.contains_key(&3));
    }

    #[test]
    fn test_parse_v8_coverage_resolver_none_falls_back() {
        let json = serde_json::json!({
            "result": [
                {
                    "scriptId": "1",
                    "url": "file:///plain.js",
                    "functions": [
                        {
                            "functionName": "",
                            "ranges": [
                                { "startOffset": 0, "endOffset": 80, "count": 1 }
                            ]
                        }
                    ]
                }
            ]
        });

        // Resolver returns None → fallback to 40-char estimation
        let result = parse_v8_coverage(&json, &|_, _| None);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].file, PathBuf::from("/plain.js"));
        // 80 bytes / 40 chars per line = lines 1 and 2
        assert!(result[0].total_lines > 0);
    }

    // ── Function coverage tests ──

    #[test]
    fn test_function_coverage_percentage_full() {
        let fc = FileCoverage {
            file: PathBuf::from("a.ts"),
            lines: HashMap::new(),
            total_lines: 0,
            covered_lines: 0,
            functions: vec![
                FunctionCoverage {
                    name: "add".into(),
                    start_line: 1,
                    count: 5,
                },
                FunctionCoverage {
                    name: "sub".into(),
                    start_line: 3,
                    count: 2,
                },
            ],
            branches: vec![],
        };
        assert_eq!(fc.function_percentage(), 100.0);
        assert_eq!(fc.total_functions(), 2);
        assert_eq!(fc.covered_functions(), 2);
    }

    #[test]
    fn test_function_coverage_percentage_partial() {
        let fc = FileCoverage {
            file: PathBuf::from("a.ts"),
            lines: HashMap::new(),
            total_lines: 0,
            covered_lines: 0,
            functions: vec![
                FunctionCoverage {
                    name: "add".into(),
                    start_line: 1,
                    count: 5,
                },
                FunctionCoverage {
                    name: "sub".into(),
                    start_line: 3,
                    count: 0,
                },
            ],
            branches: vec![],
        };
        assert_eq!(fc.function_percentage(), 50.0);
        assert_eq!(fc.covered_functions(), 1);
    }

    #[test]
    fn test_function_coverage_percentage_empty() {
        let fc = FileCoverage {
            file: PathBuf::from("a.ts"),
            lines: HashMap::new(),
            total_lines: 0,
            covered_lines: 0,
            functions: vec![],
            branches: vec![],
        };
        assert_eq!(fc.function_percentage(), 100.0);
    }

    #[test]
    fn test_report_total_function_percentage() {
        let report = CoverageReport {
            files: vec![
                FileCoverage {
                    file: PathBuf::from("a.ts"),
                    lines: HashMap::new(),
                    total_lines: 0,
                    covered_lines: 0,
                    functions: vec![
                        FunctionCoverage {
                            name: "a".into(),
                            start_line: 1,
                            count: 1,
                        },
                        FunctionCoverage {
                            name: "b".into(),
                            start_line: 2,
                            count: 0,
                        },
                    ],
                    branches: vec![],
                },
                FileCoverage {
                    file: PathBuf::from("b.ts"),
                    lines: HashMap::new(),
                    total_lines: 0,
                    covered_lines: 0,
                    functions: vec![
                        FunctionCoverage {
                            name: "c".into(),
                            start_line: 1,
                            count: 1,
                        },
                        FunctionCoverage {
                            name: "d".into(),
                            start_line: 2,
                            count: 1,
                        },
                    ],
                    branches: vec![],
                },
            ],
        };
        // 3 of 4 covered = 75%
        assert!((report.total_function_percentage() - 75.0).abs() < 0.01);
    }

    #[test]
    fn test_parse_v8_extracts_named_functions() {
        let json = serde_json::json!({
            "result": [{
                "scriptId": "1",
                "url": "file:///src/math.ts",
                "functions": [
                    {
                        "functionName": "",
                        "ranges": [{ "startOffset": 0, "endOffset": 200, "count": 1 }]
                    },
                    {
                        "functionName": "add",
                        "ranges": [{ "startOffset": 10, "endOffset": 60, "count": 3 }]
                    },
                    {
                        "functionName": "subtract",
                        "ranges": [{ "startOffset": 70, "endOffset": 120, "count": 0 }]
                    }
                ]
            }]
        });

        let result = parse_v8_coverage(&json, &|_, _| None);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].functions.len(), 2);
        assert_eq!(result[0].functions[0].name, "add");
        assert_eq!(result[0].functions[0].count, 3);
        assert_eq!(result[0].functions[1].name, "subtract");
        assert_eq!(result[0].functions[1].count, 0);
    }

    #[test]
    fn test_parse_v8_anonymous_functions_get_numbered_names() {
        let json = serde_json::json!({
            "result": [{
                "scriptId": "1",
                "url": "file:///src/app.ts",
                "functions": [
                    {
                        "functionName": "",
                        "ranges": [{ "startOffset": 0, "endOffset": 300, "count": 1 }]
                    },
                    {
                        "functionName": "",
                        "ranges": [{ "startOffset": 10, "endOffset": 50, "count": 1 }]
                    },
                    {
                        "functionName": "named",
                        "ranges": [{ "startOffset": 60, "endOffset": 100, "count": 1 }]
                    },
                    {
                        "functionName": "",
                        "ranges": [{ "startOffset": 110, "endOffset": 150, "count": 0 }]
                    }
                ]
            }]
        });

        let result = parse_v8_coverage(&json, &|_, _| None);
        assert_eq!(result.len(), 1);
        // Module wrapper (offset 0, end>100, empty name) is skipped
        // Two anonymous + one named
        assert_eq!(result[0].functions.len(), 3);
        assert_eq!(result[0].functions[0].name, "(anonymous_1)");
        assert_eq!(result[0].functions[1].name, "named");
        assert_eq!(result[0].functions[2].name, "(anonymous_2)");
    }

    #[test]
    fn test_parse_v8_skips_module_wrapper() {
        let json = serde_json::json!({
            "result": [{
                "scriptId": "1",
                "url": "file:///src/lib.ts",
                "functions": [
                    {
                        "functionName": "",
                        "ranges": [{ "startOffset": 0, "endOffset": 500, "count": 1 }]
                    },
                    {
                        "functionName": "hello",
                        "ranges": [{ "startOffset": 20, "endOffset": 80, "count": 2 }]
                    }
                ]
            }]
        });

        let result = parse_v8_coverage(&json, &|_, _| None);
        assert_eq!(result.len(), 1);
        // Only "hello" — module wrapper skipped
        assert_eq!(result[0].functions.len(), 1);
        assert_eq!(result[0].functions[0].name, "hello");
    }

    #[test]
    fn test_parse_v8_function_start_line_from_source_map() {
        let json = serde_json::json!({
            "result": [{
                "scriptId": "1",
                "url": "file:///dist/math.js",
                "functions": [
                    {
                        "functionName": "",
                        "ranges": [{ "startOffset": 0, "endOffset": 200, "count": 1 }]
                    },
                    {
                        "functionName": "multiply",
                        "ranges": [{ "startOffset": 50, "endOffset": 100, "count": 1 }]
                    }
                ]
            }]
        });

        let resolver = |url: &str, offset: u32| -> Option<(String, u32)> {
            if url == "file:///dist/math.js" {
                let line = match offset {
                    0..=49 => 1,
                    50..=99 => 7,
                    _ => 10,
                };
                Some(("src/math.ts".to_string(), line))
            } else {
                None
            }
        };

        let result = parse_v8_coverage(&json, &resolver);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].functions.len(), 1);
        assert_eq!(result[0].functions[0].name, "multiply");
        // Source map resolves offset 50 → line 7
        assert_eq!(result[0].functions[0].start_line, 7);
    }

    // ── LCOV function record tests ──

    #[test]
    fn test_format_lcov_with_function_records() {
        let mut lines = HashMap::new();
        lines.insert(1, 1);
        lines.insert(5, 1);
        lines.insert(10, 0);
        let report = CoverageReport {
            files: vec![FileCoverage {
                file: PathBuf::from("/src/math.ts"),
                lines,
                total_lines: 3,
                covered_lines: 2,
                functions: vec![
                    FunctionCoverage {
                        name: "add".into(),
                        start_line: 1,
                        count: 3,
                    },
                    FunctionCoverage {
                        name: "subtract".into(),
                        start_line: 5,
                        count: 0,
                    },
                ],
                branches: vec![],
            }],
        };

        let lcov = format_lcov(&report);

        // FN: function declarations (line,name)
        assert!(lcov.contains("FN:1,add"));
        assert!(lcov.contains("FN:5,subtract"));
        // FNDA: function data (count,name)
        assert!(lcov.contains("FNDA:3,add"));
        assert!(lcov.contains("FNDA:0,subtract"));
        // FNF: functions found
        assert!(lcov.contains("FNF:2"));
        // FNH: functions hit
        assert!(lcov.contains("FNH:1"));
        // Verify order: FN/FNDA before DA lines
        let fn_pos = lcov.find("FN:").unwrap();
        let da_pos = lcov.find("DA:").unwrap();
        assert!(
            fn_pos < da_pos,
            "FN records should appear before DA records"
        );
    }

    #[test]
    fn test_format_terminal_shows_function_percentage() {
        let report = CoverageReport {
            files: vec![FileCoverage {
                file: PathBuf::from("src/math.ts"),
                lines: HashMap::new(),
                total_lines: 10,
                covered_lines: 10,
                functions: vec![
                    FunctionCoverage {
                        name: "add".into(),
                        start_line: 1,
                        count: 5,
                    },
                    FunctionCoverage {
                        name: "sub".into(),
                        start_line: 5,
                        count: 0,
                    },
                ],
                branches: vec![],
            }],
        };

        let output = format_terminal(&report, 95.0);

        // Should show Fn% column header
        assert!(output.contains("Fn%"), "Should contain Fn% header");
        // Should show 50.0% function coverage for math.ts (1 of 2 functions covered)
        assert!(
            output.contains("50.0%"),
            "Should show 50.0% function coverage"
        );
    }

    #[test]
    fn test_format_lcov_no_functions_omits_fn_records() {
        let report = CoverageReport {
            files: vec![make_file_coverage("/src/a.ts", 2, 2)],
        };

        let lcov = format_lcov(&report);

        // No FN records when functions is empty
        assert!(!lcov.contains("FN:"));
        assert!(!lcov.contains("FNDA:"));
        // But FNF/FNH should still appear with 0
        assert!(lcov.contains("FNF:0"));
        assert!(lcov.contains("FNH:0"));
    }

    // ── LCOV branch record tests ──

    #[test]
    fn test_format_lcov_with_branch_records() {
        let report = CoverageReport {
            files: vec![FileCoverage {
                file: PathBuf::from("/src/logic.ts"),
                lines: HashMap::new(),
                total_lines: 0,
                covered_lines: 0,
                functions: vec![],
                branches: vec![
                    BranchCoverage {
                        line: 5,
                        block_number: 1,
                        branch_number: 0,
                        count: 3,
                    },
                    BranchCoverage {
                        line: 5,
                        block_number: 1,
                        branch_number: 1,
                        count: 0,
                    },
                ],
            }],
        };

        let lcov = format_lcov(&report);

        // BRDA records
        assert!(lcov.contains("BRDA:5,1,0,3"));
        assert!(lcov.contains("BRDA:5,1,1,0"));
        // BRF/BRH summaries
        assert!(lcov.contains("BRF:2"));
        assert!(lcov.contains("BRH:1"));
        // Verify order: BRDA after FNH, before DA
        let brda_pos = lcov.find("BRDA:").unwrap();
        let brf_pos = lcov.find("BRF:").unwrap();
        assert!(brda_pos < brf_pos);
    }

    #[test]
    fn test_format_terminal_shows_branch_percentage() {
        let report = CoverageReport {
            files: vec![FileCoverage {
                file: PathBuf::from("src/logic.ts"),
                lines: HashMap::new(),
                total_lines: 10,
                covered_lines: 10,
                functions: vec![],
                branches: vec![
                    BranchCoverage {
                        line: 5,
                        block_number: 1,
                        branch_number: 0,
                        count: 3,
                    },
                    BranchCoverage {
                        line: 5,
                        block_number: 1,
                        branch_number: 1,
                        count: 0,
                    },
                ],
            }],
        };

        let output = format_terminal(&report, 95.0);

        assert!(output.contains("Branch%"), "Should contain Branch% header");
        // 1 of 2 branches covered = 50.0%
        assert!(
            output.contains("50.0%"),
            "Should show 50.0% branch coverage"
        );
    }

    #[test]
    fn test_format_lcov_no_branches_shows_zero_summary() {
        let report = CoverageReport {
            files: vec![make_file_coverage("/src/a.ts", 2, 2)],
        };

        let lcov = format_lcov(&report);

        assert!(!lcov.contains("BRDA:"));
        assert!(lcov.contains("BRF:0"));
        assert!(lcov.contains("BRH:0"));
    }

    // ── Branch coverage tests ──

    #[test]
    fn test_branch_percentage_empty() {
        let fc = FileCoverage {
            file: PathBuf::from("a.ts"),
            lines: HashMap::new(),
            total_lines: 0,
            covered_lines: 0,
            functions: vec![],
            branches: vec![],
        };
        assert_eq!(fc.branch_percentage(), 100.0);
        assert_eq!(fc.total_branches(), 0);
        assert_eq!(fc.covered_branches(), 0);
    }

    #[test]
    fn test_branch_percentage_partial() {
        let fc = FileCoverage {
            file: PathBuf::from("a.ts"),
            lines: HashMap::new(),
            total_lines: 0,
            covered_lines: 0,
            functions: vec![],
            branches: vec![
                BranchCoverage {
                    line: 5,
                    block_number: 1,
                    branch_number: 0,
                    count: 3,
                },
                BranchCoverage {
                    line: 5,
                    block_number: 1,
                    branch_number: 1,
                    count: 0,
                },
            ],
        };
        assert_eq!(fc.branch_percentage(), 50.0);
        assert_eq!(fc.total_branches(), 2);
        assert_eq!(fc.covered_branches(), 1);
    }

    #[test]
    fn test_report_total_branch_percentage() {
        let report = CoverageReport {
            files: vec![
                FileCoverage {
                    file: PathBuf::from("a.ts"),
                    lines: HashMap::new(),
                    total_lines: 0,
                    covered_lines: 0,
                    functions: vec![],
                    branches: vec![
                        BranchCoverage {
                            line: 5,
                            block_number: 1,
                            branch_number: 0,
                            count: 1,
                        },
                        BranchCoverage {
                            line: 5,
                            block_number: 1,
                            branch_number: 1,
                            count: 0,
                        },
                    ],
                },
                FileCoverage {
                    file: PathBuf::from("b.ts"),
                    lines: HashMap::new(),
                    total_lines: 0,
                    covered_lines: 0,
                    functions: vec![],
                    branches: vec![
                        BranchCoverage {
                            line: 3,
                            block_number: 1,
                            branch_number: 0,
                            count: 2,
                        },
                        BranchCoverage {
                            line: 3,
                            block_number: 1,
                            branch_number: 1,
                            count: 2,
                        },
                    ],
                },
            ],
        };
        // 3 of 4 branches covered = 75%
        assert!((report.total_branch_percentage() - 75.0).abs() < 0.01);
    }

    #[test]
    fn test_parse_v8_if_else_branches() {
        // Function with if/else: parent count=5, one block count=3 (if taken 3 times),
        // else branch = 5-3 = 2 times
        let json = serde_json::json!({
            "result": [{
                "scriptId": "1",
                "url": "file:///src/math.ts",
                "functions": [
                    {
                        "functionName": "",
                        "ranges": [{ "startOffset": 0, "endOffset": 200, "count": 1 }]
                    },
                    {
                        "functionName": "check",
                        "ranges": [
                            { "startOffset": 10, "endOffset": 100, "count": 5 },
                            { "startOffset": 30, "endOffset": 60, "count": 3 }
                        ]
                    }
                ]
            }]
        });

        let result = parse_v8_coverage(&json, &|_, _| None);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].branches.len(), 2);
        // First branch: the if-block (count=3)
        assert_eq!(result[0].branches[0].count, 3);
        assert_eq!(result[0].branches[0].branch_number, 0);
        // Second branch: the else-block (count=5-3=2)
        assert_eq!(result[0].branches[1].count, 2);
        assert_eq!(result[0].branches[1].branch_number, 1);
        // Same block number
        assert_eq!(
            result[0].branches[0].block_number,
            result[0].branches[1].block_number
        );
    }

    #[test]
    fn test_parse_v8_no_branches_single_range() {
        // Function with single range = no branches
        let json = serde_json::json!({
            "result": [{
                "scriptId": "1",
                "url": "file:///src/simple.ts",
                "functions": [
                    {
                        "functionName": "",
                        "ranges": [{ "startOffset": 0, "endOffset": 200, "count": 1 }]
                    },
                    {
                        "functionName": "greet",
                        "ranges": [
                            { "startOffset": 10, "endOffset": 50, "count": 1 }
                        ]
                    }
                ]
            }]
        });

        let result = parse_v8_coverage(&json, &|_, _| None);
        assert_eq!(result.len(), 1);
        assert!(result[0].branches.is_empty());
    }

    #[test]
    fn test_parse_v8_uncalled_function_no_branches() {
        // Uncalled function (count=0) — no branch analysis
        let json = serde_json::json!({
            "result": [{
                "scriptId": "1",
                "url": "file:///src/unused.ts",
                "functions": [
                    {
                        "functionName": "",
                        "ranges": [{ "startOffset": 0, "endOffset": 200, "count": 1 }]
                    },
                    {
                        "functionName": "unused",
                        "ranges": [
                            { "startOffset": 10, "endOffset": 80, "count": 0 },
                            { "startOffset": 30, "endOffset": 60, "count": 0 }
                        ]
                    }
                ]
            }]
        });

        let result = parse_v8_coverage(&json, &|_, _| None);
        assert_eq!(result.len(), 1);
        // No branches for uncalled function
        assert!(result[0].branches.is_empty());
    }

    #[test]
    fn test_parse_v8_ternary_branches() {
        // Ternary: parent count=10, true branch=7, false branch=3
        let json = serde_json::json!({
            "result": [{
                "scriptId": "1",
                "url": "file:///src/ternary.ts",
                "functions": [
                    {
                        "functionName": "",
                        "ranges": [{ "startOffset": 0, "endOffset": 200, "count": 1 }]
                    },
                    {
                        "functionName": "pick",
                        "ranges": [
                            { "startOffset": 10, "endOffset": 80, "count": 10 },
                            { "startOffset": 20, "endOffset": 40, "count": 7 },
                            { "startOffset": 40, "endOffset": 60, "count": 3 }
                        ]
                    }
                ]
            }]
        });

        let result = parse_v8_coverage(&json, &|_, _| None);
        assert_eq!(result.len(), 1);
        // Two branch points: offset 20 (count 7 vs parent 10) and offset 40 (count 3 vs parent 10)
        assert_eq!(result[0].branches.len(), 4);
        // Block 1 (offset 20): branch 0=7, branch 1=3 (10-7)
        assert_eq!(result[0].branches[0].count, 7);
        assert_eq!(result[0].branches[1].count, 3);
        // Block 2 (offset 40): branch 0=3, branch 1=7 (10-3)
        assert_eq!(result[0].branches[2].count, 3);
        assert_eq!(result[0].branches[3].count, 7);
    }

    #[test]
    fn test_parse_v8_multiple_functions_sequential_block_numbers() {
        // Two functions with branches → block numbers should be sequential per file
        let json = serde_json::json!({
            "result": [{
                "scriptId": "1",
                "url": "file:///src/multi.ts",
                "functions": [
                    {
                        "functionName": "",
                        "ranges": [{ "startOffset": 0, "endOffset": 300, "count": 1 }]
                    },
                    {
                        "functionName": "funcA",
                        "ranges": [
                            { "startOffset": 10, "endOffset": 100, "count": 4 },
                            { "startOffset": 30, "endOffset": 60, "count": 2 }
                        ]
                    },
                    {
                        "functionName": "funcB",
                        "ranges": [
                            { "startOffset": 110, "endOffset": 200, "count": 6 },
                            { "startOffset": 130, "endOffset": 160, "count": 1 }
                        ]
                    }
                ]
            }]
        });

        let result = parse_v8_coverage(&json, &|_, _| None);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].branches.len(), 4);
        // funcA branch block = 1
        assert_eq!(result[0].branches[0].block_number, 1);
        assert_eq!(result[0].branches[1].block_number, 1);
        // funcB branch block = 2
        assert_eq!(result[0].branches[2].block_number, 2);
        assert_eq!(result[0].branches[3].block_number, 2);
    }

    #[test]
    fn test_parse_v8_branch_with_source_map() {
        let json = serde_json::json!({
            "result": [{
                "scriptId": "1",
                "url": "file:///dist/app.js",
                "functions": [
                    {
                        "functionName": "",
                        "ranges": [{ "startOffset": 0, "endOffset": 300, "count": 1 }]
                    },
                    {
                        "functionName": "validate",
                        "ranges": [
                            { "startOffset": 50, "endOffset": 150, "count": 8 },
                            { "startOffset": 70, "endOffset": 100, "count": 5 }
                        ]
                    }
                ]
            }]
        });

        let resolver = |url: &str, offset: u32| -> Option<(String, u32)> {
            if url == "file:///dist/app.js" {
                let line = match offset {
                    0..=49 => 1,
                    50..=69 => 5,
                    70..=99 => 8,
                    100..=149 => 12,
                    _ => 15,
                };
                Some(("src/app.ts".to_string(), line))
            } else {
                None
            }
        };

        let result = parse_v8_coverage(&json, &resolver);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].branches.len(), 2);
        // Branch line should be resolved via source map (offset 70 → line 8)
        assert_eq!(result[0].branches[0].line, 8);
    }
}
