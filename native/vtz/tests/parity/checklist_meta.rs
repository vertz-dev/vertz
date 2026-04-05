/// Meta-test: validates that every checklist row in PARITY_REPORT.md
/// maps to a test. Fails if the report structure is malformed or incomplete.
#[test]
fn every_checklist_row_has_test_coverage() {
    let report = include_str!("PARITY_REPORT.md");

    // Count Included rows (lines in the Included table with a | # | pattern)
    let included_rows: Vec<&str> = report
        .lines()
        .filter(|line| {
            line.starts_with("| ")
                && !line.starts_with("| #")
                && !line.starts_with("| -")
                && !line.contains("DEFERRED")
                && line.contains("|")
                // Skip header separators
                && !line.contains("---")
        })
        .collect();

    // Count Deferred rows
    let deferred_rows: Vec<&str> = report
        .lines()
        .filter(|line| line.contains("DEFERRED"))
        .collect();

    // Verify counts
    assert_eq!(
        included_rows.len(),
        55,
        "Expected 55 Included rows, found {}. Rows:\n{}",
        included_rows.len(),
        included_rows.join("\n")
    );
    assert_eq!(
        deferred_rows.len(),
        12,
        "Expected 12 Deferred rows, found {}",
        deferred_rows.len()
    );

    // Verify every Included row has a non-empty test location
    for row in &included_rows {
        let columns: Vec<&str> = row.split('|').collect();
        // Columns: ["", " # ", " Feature ", " Test Location ", " Status ", ""]
        assert!(
            columns.len() >= 5,
            "Malformed row (expected 5+ columns): {}",
            row
        );
        let test_location = columns[3].trim();
        assert!(
            !test_location.is_empty(),
            "Empty test location in row: {}",
            row
        );
    }

    // Verify every Deferred row has a reference
    for row in &deferred_rows {
        let columns: Vec<&str> = row.split('|').collect();
        assert!(columns.len() >= 5, "Malformed deferred row: {}", row);
        let reference = columns[4].trim();
        assert!(
            !reference.is_empty(),
            "Empty reference in deferred row: {}",
            row
        );
    }
}
