use std::collections::BTreeMap;

/// A single override rule parsed from package.json "overrides" field
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OverrideRule {
    /// Path from root: ["express", "body-parser"] for "express>body-parser>qs"
    pub parent_path: Vec<String>,
    /// Target package name: "qs"
    pub target: String,
    /// Forced version: "6.11.0" (already resolved from $name if applicable)
    pub version: String,
}

/// Collection of parsed override rules, ordered by specificity
#[derive(Debug, Clone, Default)]
pub struct OverrideMap {
    /// All parsed override rules, ordered by specificity (longer path = more specific)
    pub rules: Vec<OverrideRule>,
}

impl OverrideMap {
    pub fn is_empty(&self) -> bool {
        self.rules.is_empty()
    }

    /// Find the most specific override for a package given the current parent chain.
    /// Returns the forced version string if an override matches.
    pub fn find_override(&self, dep_name: &str, parent_chain: &[String]) -> Option<&str> {
        let mut best: Option<&OverrideRule> = None;

        for rule in &self.rules {
            if rule.target != dep_name {
                continue;
            }

            // Global override (no parent_path) matches everything
            if rule.parent_path.is_empty() {
                if best.is_none() || best.unwrap().parent_path.is_empty() {
                    best = Some(rule);
                }
                continue;
            }

            // Scoped override: parent_path must be a suffix of the current parent_chain
            if is_suffix_match(&rule.parent_path, parent_chain) {
                match best {
                    None => best = Some(rule),
                    Some(current_best) => {
                        if rule.parent_path.len() > current_best.parent_path.len() {
                            best = Some(rule);
                        }
                    }
                }
            }
        }

        best.map(|r| r.version.as_str())
    }
}

/// Check if `path` is a suffix of `chain`.
/// e.g., ["body-parser"] is a suffix of ["express", "body-parser"]
/// e.g., ["express", "body-parser"] is a suffix of ["express", "body-parser"]
fn is_suffix_match(path: &[String], chain: &[String]) -> bool {
    if path.len() > chain.len() {
        return false;
    }
    let offset = chain.len() - path.len();
    chain[offset..] == *path
}

/// Parse the "overrides" field from package.json into an OverrideMap.
///
/// Resolves `$name` references against root dependencies.
/// Validates pattern syntax and emits errors for invalid patterns.
pub fn parse_overrides(
    overrides: &BTreeMap<String, String>,
    root_deps: &BTreeMap<String, String>,
    root_dev_deps: &BTreeMap<String, String>,
) -> Result<OverrideMap, String> {
    let mut rules = Vec::new();

    for (pattern, version) in overrides {
        // Validate: no yarn-style glob patterns
        if pattern.starts_with("**/") || pattern.contains("**") {
            return Err(
                "error: yarn-style resolution patterns not supported — use \"parent>child\" npm override syntax".to_string()
            );
        }

        // Validate: no yarn-style `/` separator (check per-segment after splitting)
        if !pattern.starts_with('@') && !pattern.contains('>') && pattern.contains('/') {
            return Err(format!(
                "error: invalid override pattern \"{}\" — use \">\" as the path separator. Did you mean \"{}\"?",
                pattern,
                pattern.replace('/', ">")
            ));
        }

        // Validate: no empty segments (e.g., "express>>qs")
        if pattern.contains(">>") {
            return Err(format!(
                "error: invalid override pattern \"{}\" — use \"parent>child\" format",
                pattern
            ));
        }

        // Resolve $name references
        let resolved_version = if let Some(ref_name) = version.strip_prefix('$') {
            if let Some(v) = root_deps
                .get(ref_name)
                .or_else(|| root_dev_deps.get(ref_name))
            {
                v.clone()
            } else {
                return Err(format!(
                    "error: override \"{}\" references root dependency \"{}\", but \"{}\" is not in dependencies or devDependencies",
                    version, ref_name, ref_name
                ));
            }
        } else {
            version.clone()
        };

        // Parse the pattern into parent_path + target
        let (parent_path, target) = parse_override_pattern(pattern)?;

        rules.push(OverrideRule {
            parent_path,
            target,
            version: resolved_version,
        });
    }

    // Sort by specificity: longer parent_path first (more specific wins during matching)
    rules.sort_by(|a, b| b.parent_path.len().cmp(&a.parent_path.len()));

    Ok(OverrideMap { rules })
}

/// Parse an override pattern like "express>body-parser>qs" into
/// (parent_path: ["express", "body-parser"], target: "qs")
fn parse_override_pattern(pattern: &str) -> Result<(Vec<String>, String), String> {
    // Split on '>' but be careful with scoped packages like @org/foo
    let segments = split_override_segments(pattern);

    if segments.is_empty() {
        return Err(format!(
            "error: invalid override pattern \"{}\" — use \"parent>child\" format",
            pattern
        ));
    }

    // Validate no empty segments and no invalid `/` in non-scoped segments
    for seg in &segments {
        if seg.is_empty() {
            return Err(format!(
                "error: invalid override pattern \"{}\" — use \"parent>child\" format",
                pattern
            ));
        }
        // A segment containing '/' must be a scoped package (starts with '@')
        if seg.contains('/') && !seg.starts_with('@') {
            return Err(format!(
                "error: invalid override pattern \"{}\" — segment \"{}\" contains \"/\". Use \">\" as the path separator",
                pattern, seg
            ));
        }
    }

    let target = segments.last().unwrap().clone();
    let parent_path = segments[..segments.len() - 1].to_vec();

    Ok((parent_path, target))
}

/// Split a pattern on '>' while respecting scoped packages.
/// "express>@org/parser>qs" → ["express", "@org/parser", "qs"]
fn split_override_segments(pattern: &str) -> Vec<String> {
    let mut segments = Vec::new();
    let mut current = String::new();
    let mut chars = pattern.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '>' {
            if !current.is_empty() {
                segments.push(current.clone());
                current.clear();
            }
        } else {
            current.push(ch);
            // Handle scoped package: if current starts with '@' and we haven't seen '/' yet,
            // keep consuming until we've captured the full @scope/name
            if ch == '@' && current.len() == 1 {
                // consume until next '>' or end
                for next_ch in chars.by_ref() {
                    if next_ch == '>' {
                        segments.push(current.clone());
                        current.clear();
                        break;
                    }
                    current.push(next_ch);
                }
            }
        }
    }

    if !current.is_empty() {
        segments.push(current);
    }

    segments
}

/// Check for "resolutions" in raw package.json and return overrides + warnings.
/// If both "overrides" and "resolutions" exist, use "overrides" with warning.
/// If only "resolutions" exists, use it as overrides with migration warning.
pub fn extract_overrides_from_raw(
    raw: &serde_json::Value,
) -> (BTreeMap<String, String>, Vec<String>) {
    let mut warnings = Vec::new();
    let obj = match raw.as_object() {
        Some(o) => o,
        None => return (BTreeMap::new(), warnings),
    };

    let has_overrides = obj.contains_key("overrides");
    let has_resolutions = obj.contains_key("resolutions");

    if has_overrides && has_resolutions {
        warnings.push(
            "warning: both \"overrides\" and \"resolutions\" found — using \"overrides\" (Vertz uses npm-style overrides)".to_string()
        );
    } else if has_resolutions && !has_overrides {
        warnings.push(
            "warning: \"resolutions\" field found — did you mean \"overrides\"? Vertz uses npm-style overrides. Reading as overrides.".to_string()
        );
    }

    // Read overrides (priority) or resolutions (fallback)
    let field = if has_overrides {
        "overrides"
    } else if has_resolutions {
        "resolutions"
    } else {
        return (BTreeMap::new(), warnings);
    };

    let overrides_value = &obj[field];
    let mut result = BTreeMap::new();

    if let Some(map) = overrides_value.as_object() {
        for (k, v) in map {
            if let Some(vs) = v.as_str() {
                // Validate yarn-style patterns in resolutions
                if has_resolutions && !has_overrides && k.contains('/') && !k.starts_with('@') {
                    warnings.push(format!(
                        "skipping invalid resolution pattern \"{}\" — use \">\" as the path separator. Did you mean \"{}\"?",
                        k,
                        k.replace('/', ">")
                    ));
                    continue;
                }
                result.insert(k.clone(), vs.to_string());
            }
        }
    }

    (result, warnings)
}

/// Check for stale overrides — overrides that are no longer needed because
/// all original ranges in the dependency tree already satisfy the override version.
/// Returns a list of warning messages for stale overrides.
pub fn detect_stale_overrides(
    override_map: &OverrideMap,
    original_ranges: &[(String, String, String)], // (target_name, original_range, matched_pattern) triples
) -> Vec<String> {
    use node_semver::{Range, Version};

    let mut warnings = Vec::new();

    for rule in &override_map.rules {
        let rule_pattern = if rule.parent_path.is_empty() {
            rule.target.clone()
        } else {
            format!("{}>{}", rule.parent_path.join(">"), rule.target)
        };

        // Collect original ranges that THIS specific rule matched
        let ranges_for_rule: Vec<&str> = original_ranges
            .iter()
            .filter(|(name, _, pattern)| *name == rule.target && *pattern == rule_pattern)
            .map(|(_, range, _)| range.as_str())
            .collect();

        if ranges_for_rule.is_empty() {
            continue;
        }

        // Check if the override version satisfies ALL original ranges
        if let Ok(override_ver) = Version::parse(&rule.version) {
            let all_satisfied = ranges_for_rule.iter().all(|range_str| {
                Range::parse(range_str)
                    .map(|r| r.satisfies(&override_ver))
                    .unwrap_or(false)
            });

            if all_satisfied {
                let pattern = if rule.parent_path.is_empty() {
                    rule.target.clone()
                } else {
                    format!("{}>{}", rule.parent_path.join(">"), rule.target)
                };
                warnings.push(format!(
                    "override \"{}\": \"{}\" is satisfied without override — consider removing",
                    pattern, rule.version
                ));
            }
        }
    }

    warnings
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- Pattern parsing tests ----

    #[test]
    fn test_parse_global_override() {
        let mut overrides = BTreeMap::new();
        overrides.insert("qs".to_string(), "6.11.0".to_string());

        let map = parse_overrides(&overrides, &BTreeMap::new(), &BTreeMap::new()).unwrap();
        assert_eq!(map.rules.len(), 1);
        assert_eq!(map.rules[0].target, "qs");
        assert_eq!(map.rules[0].version, "6.11.0");
        assert!(map.rules[0].parent_path.is_empty());
    }

    #[test]
    fn test_parse_scoped_override_depth_1() {
        let mut overrides = BTreeMap::new();
        overrides.insert("express>qs".to_string(), "6.11.0".to_string());

        let map = parse_overrides(&overrides, &BTreeMap::new(), &BTreeMap::new()).unwrap();
        assert_eq!(map.rules.len(), 1);
        assert_eq!(map.rules[0].target, "qs");
        assert_eq!(map.rules[0].parent_path, vec!["express"]);
    }

    #[test]
    fn test_parse_deep_nested_override() {
        let mut overrides = BTreeMap::new();
        overrides.insert("express>body-parser>qs".to_string(), "6.11.0".to_string());

        let map = parse_overrides(&overrides, &BTreeMap::new(), &BTreeMap::new()).unwrap();
        assert_eq!(map.rules.len(), 1);
        assert_eq!(map.rules[0].target, "qs");
        assert_eq!(map.rules[0].parent_path, vec!["express", "body-parser"]);
    }

    #[test]
    fn test_parse_scoped_package_override() {
        let mut overrides = BTreeMap::new();
        overrides.insert("@org/parser".to_string(), "2.0.0".to_string());

        let map = parse_overrides(&overrides, &BTreeMap::new(), &BTreeMap::new()).unwrap();
        assert_eq!(map.rules.len(), 1);
        assert_eq!(map.rules[0].target, "@org/parser");
        assert!(map.rules[0].parent_path.is_empty());
    }

    #[test]
    fn test_parse_scoped_package_in_path() {
        let mut overrides = BTreeMap::new();
        overrides.insert("express>@org/parser".to_string(), "2.0.0".to_string());

        let map = parse_overrides(&overrides, &BTreeMap::new(), &BTreeMap::new()).unwrap();
        assert_eq!(map.rules.len(), 1);
        assert_eq!(map.rules[0].target, "@org/parser");
        assert_eq!(map.rules[0].parent_path, vec!["express"]);
    }

    #[test]
    fn test_parse_dollar_reference() {
        let mut overrides = BTreeMap::new();
        overrides.insert("cookie".to_string(), "$cookie".to_string());

        let mut root_deps = BTreeMap::new();
        root_deps.insert("cookie".to_string(), "^0.6.0".to_string());

        let map = parse_overrides(&overrides, &root_deps, &BTreeMap::new()).unwrap();
        assert_eq!(map.rules[0].version, "^0.6.0");
    }

    #[test]
    fn test_parse_dollar_reference_dev_deps() {
        let mut overrides = BTreeMap::new();
        overrides.insert("cookie".to_string(), "$cookie".to_string());

        let mut dev_deps = BTreeMap::new();
        dev_deps.insert("cookie".to_string(), "^0.7.0".to_string());

        let map = parse_overrides(&overrides, &BTreeMap::new(), &dev_deps).unwrap();
        assert_eq!(map.rules[0].version, "^0.7.0");
    }

    #[test]
    fn test_parse_dollar_reference_missing() {
        let mut overrides = BTreeMap::new();
        overrides.insert("cookie".to_string(), "$cookie".to_string());

        let result = parse_overrides(&overrides, &BTreeMap::new(), &BTreeMap::new());
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("not in dependencies or devDependencies"));
    }

    #[test]
    fn test_parse_dollar_reference_scoped() {
        let mut overrides = BTreeMap::new();
        overrides.insert("@org/foo".to_string(), "$@org/foo".to_string());

        let mut root_deps = BTreeMap::new();
        root_deps.insert("@org/foo".to_string(), "^1.0.0".to_string());

        let map = parse_overrides(&overrides, &root_deps, &BTreeMap::new()).unwrap();
        assert_eq!(map.rules[0].version, "^1.0.0");
    }

    // ---- Error validation tests ----

    #[test]
    fn test_parse_invalid_double_separator() {
        let mut overrides = BTreeMap::new();
        overrides.insert("express>>qs".to_string(), "6.11.0".to_string());

        let result = parse_overrides(&overrides, &BTreeMap::new(), &BTreeMap::new());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("use \"parent>child\" format"));
    }

    #[test]
    fn test_parse_yarn_glob_pattern() {
        let mut overrides = BTreeMap::new();
        overrides.insert("**/qs".to_string(), "6.11.0".to_string());

        let result = parse_overrides(&overrides, &BTreeMap::new(), &BTreeMap::new());
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("yarn-style resolution patterns not supported"));
    }

    #[test]
    fn test_parse_yarn_slash_separator() {
        let mut overrides = BTreeMap::new();
        overrides.insert("express/qs".to_string(), "6.11.0".to_string());

        let result = parse_overrides(&overrides, &BTreeMap::new(), &BTreeMap::new());
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("Did you mean \"express>qs\"?"));
    }

    // ---- Matching tests ----

    #[test]
    fn test_find_override_global() {
        let map = OverrideMap {
            rules: vec![OverrideRule {
                parent_path: vec![],
                target: "qs".to_string(),
                version: "6.11.0".to_string(),
            }],
        };

        // Matches anywhere in the tree
        assert_eq!(map.find_override("qs", &[]), Some("6.11.0"));
        assert_eq!(
            map.find_override("qs", &["express".to_string()]),
            Some("6.11.0")
        );
        assert_eq!(map.find_override("other", &[]), None);
    }

    #[test]
    fn test_find_override_scoped() {
        let map = OverrideMap {
            rules: vec![OverrideRule {
                parent_path: vec!["express".to_string()],
                target: "qs".to_string(),
                version: "6.11.0".to_string(),
            }],
        };

        // Only matches under express
        assert_eq!(
            map.find_override("qs", &["express".to_string()]),
            Some("6.11.0")
        );
        assert_eq!(map.find_override("qs", &[]), None);
        assert_eq!(map.find_override("qs", &["body-parser".to_string()]), None);
    }

    #[test]
    fn test_find_override_deep_nested() {
        let map = OverrideMap {
            rules: vec![OverrideRule {
                parent_path: vec!["express".to_string(), "body-parser".to_string()],
                target: "qs".to_string(),
                version: "6.11.0".to_string(),
            }],
        };

        assert_eq!(
            map.find_override("qs", &["express".to_string(), "body-parser".to_string()]),
            Some("6.11.0")
        );
        // Not deep enough
        assert_eq!(map.find_override("qs", &["express".to_string()]), None);
        // Wrong parent
        assert_eq!(
            map.find_override("qs", &["other".to_string(), "body-parser".to_string()]),
            None
        );
    }

    #[test]
    fn test_find_override_specificity_wins() {
        let map = OverrideMap {
            rules: vec![
                OverrideRule {
                    parent_path: vec!["express".to_string()],
                    target: "qs".to_string(),
                    version: "6.12.0".to_string(),
                },
                OverrideRule {
                    parent_path: vec![],
                    target: "qs".to_string(),
                    version: "6.11.0".to_string(),
                },
            ],
        };

        // Under express: more specific wins
        assert_eq!(
            map.find_override("qs", &["express".to_string()]),
            Some("6.12.0")
        );
        // Elsewhere: global applies
        assert_eq!(
            map.find_override("qs", &["body-parser".to_string()]),
            Some("6.11.0")
        );
        assert_eq!(map.find_override("qs", &[]), Some("6.11.0"));
    }

    #[test]
    fn test_rules_sorted_by_specificity() {
        let mut overrides = BTreeMap::new();
        overrides.insert("qs".to_string(), "6.11.0".to_string());
        overrides.insert("express>qs".to_string(), "6.12.0".to_string());
        overrides.insert("express>body-parser>qs".to_string(), "6.13.0".to_string());

        let map = parse_overrides(&overrides, &BTreeMap::new(), &BTreeMap::new()).unwrap();
        // Most specific first
        assert_eq!(map.rules[0].parent_path.len(), 2);
        assert_eq!(map.rules[1].parent_path.len(), 1);
        assert_eq!(map.rules[2].parent_path.len(), 0);
    }

    // ---- extract_overrides_from_raw tests ----

    #[test]
    fn test_extract_overrides_only() {
        let raw: serde_json::Value = serde_json::json!({
            "overrides": {
                "qs": "6.11.0"
            }
        });
        let (overrides, warnings) = extract_overrides_from_raw(&raw);
        assert_eq!(overrides.len(), 1);
        assert_eq!(overrides["qs"], "6.11.0");
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_extract_resolutions_only() {
        let raw: serde_json::Value = serde_json::json!({
            "resolutions": {
                "qs": "6.11.0"
            }
        });
        let (overrides, warnings) = extract_overrides_from_raw(&raw);
        assert_eq!(overrides.len(), 1);
        assert_eq!(overrides["qs"], "6.11.0");
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("did you mean \"overrides\""));
    }

    #[test]
    fn test_extract_both_prefers_overrides() {
        let raw: serde_json::Value = serde_json::json!({
            "overrides": {
                "qs": "6.11.0"
            },
            "resolutions": {
                "qs": "6.5.0"
            }
        });
        let (overrides, warnings) = extract_overrides_from_raw(&raw);
        assert_eq!(overrides["qs"], "6.11.0");
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("using \"overrides\""));
    }

    #[test]
    fn test_extract_neither() {
        let raw: serde_json::Value = serde_json::json!({
            "dependencies": { "zod": "^3.0.0" }
        });
        let (overrides, warnings) = extract_overrides_from_raw(&raw);
        assert!(overrides.is_empty());
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_segment_splitting_simple() {
        assert_eq!(split_override_segments("express>qs"), vec!["express", "qs"]);
    }

    #[test]
    fn test_segment_splitting_scoped() {
        assert_eq!(
            split_override_segments("express>@org/parser"),
            vec!["express", "@org/parser"]
        );
    }

    #[test]
    fn test_segment_splitting_scoped_at_start() {
        assert_eq!(split_override_segments("@org/parser"), vec!["@org/parser"]);
    }

    #[test]
    fn test_segment_splitting_deep() {
        assert_eq!(split_override_segments("a>b>c>d"), vec!["a", "b", "c", "d"]);
    }

    #[test]
    fn test_is_suffix_match_basic() {
        assert!(is_suffix_match(
            &["express".to_string()],
            &["express".to_string()]
        ));
        assert!(is_suffix_match(
            &["express".to_string()],
            &["root".to_string(), "express".to_string()]
        ));
        assert!(!is_suffix_match(
            &["express".to_string(), "body-parser".to_string()],
            &["express".to_string()]
        ));
    }

    #[test]
    fn test_is_suffix_match_empty_path() {
        // Empty path always matches (global override)
        assert!(is_suffix_match(&[], &[]));
        assert!(is_suffix_match(&[], &["express".to_string()]));
    }

    // ---- Stale override detection tests ----

    #[test]
    fn test_stale_override_detected() {
        let map = OverrideMap {
            rules: vec![OverrideRule {
                parent_path: vec![],
                target: "qs".to_string(),
                version: "6.11.0".to_string(),
            }],
        };

        // All original ranges satisfy 6.11.0 → stale
        let ranges = vec![
            ("qs".to_string(), ">=6.0.0".to_string(), "qs".to_string()),
            ("qs".to_string(), "^6.0.0".to_string(), "qs".to_string()),
        ];
        let warnings = detect_stale_overrides(&map, &ranges);
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("consider removing"));
    }

    #[test]
    fn test_stale_override_not_detected_when_needed() {
        let map = OverrideMap {
            rules: vec![OverrideRule {
                parent_path: vec![],
                target: "qs".to_string(),
                version: "6.11.0".to_string(),
            }],
        };

        // ~6.5.0 does NOT satisfy 6.11.0 → override still needed
        let ranges = vec![("qs".to_string(), "~6.5.0".to_string(), "qs".to_string())];
        let warnings = detect_stale_overrides(&map, &ranges);
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_stale_override_scoped_pattern() {
        let map = OverrideMap {
            rules: vec![OverrideRule {
                parent_path: vec!["express".to_string()],
                target: "qs".to_string(),
                version: "6.11.0".to_string(),
            }],
        };

        let ranges = vec![(
            "qs".to_string(),
            "^6.0.0".to_string(),
            "express>qs".to_string(),
        )];
        let warnings = detect_stale_overrides(&map, &ranges);
        assert_eq!(warnings.len(), 1);
        assert!(warnings[0].contains("express>qs"));
    }

    #[test]
    fn test_stale_override_no_applications() {
        let map = OverrideMap {
            rules: vec![OverrideRule {
                parent_path: vec![],
                target: "qs".to_string(),
                version: "6.11.0".to_string(),
            }],
        };

        // No applications → no warnings
        let ranges: Vec<(String, String, String)> = vec![];
        let warnings = detect_stale_overrides(&map, &ranges);
        assert!(warnings.is_empty());
    }

    #[test]
    fn test_stale_override_per_rule_filtering() {
        // Global + scoped overrides for same target — stale detection should be per-rule
        let map = OverrideMap {
            rules: vec![
                OverrideRule {
                    parent_path: vec!["express".to_string()],
                    target: "qs".to_string(),
                    version: "6.11.0".to_string(),
                },
                OverrideRule {
                    parent_path: vec![],
                    target: "qs".to_string(),
                    version: "6.5.0".to_string(),
                },
            ],
        };

        // Global rule applied to ~6.5.0 (6.5.0 satisfies ~6.5.0 → stale)
        // Scoped rule applied to ^6.0.0 (6.11.0 satisfies ^6.0.0 → stale)
        let ranges = vec![
            ("qs".to_string(), "~6.5.0".to_string(), "qs".to_string()),
            (
                "qs".to_string(),
                "^6.0.0".to_string(),
                "express>qs".to_string(),
            ),
        ];
        let warnings = detect_stale_overrides(&map, &ranges);
        assert_eq!(warnings.len(), 2); // Both stale
    }

    // ---- PackageJson overrides field test ----

    #[test]
    fn test_package_json_with_overrides() {
        let json = r#"{
            "name": "my-app",
            "dependencies": { "express": "^4.18.0" },
            "overrides": { "qs": "6.11.0" }
        }"#;
        let pkg: crate::pm::types::PackageJson = serde_json::from_str(json).unwrap();
        assert_eq!(pkg.overrides.len(), 1);
        assert_eq!(pkg.overrides["qs"], "6.11.0");
    }

    #[test]
    fn test_package_json_without_overrides() {
        let json = r#"{ "name": "my-app" }"#;
        let pkg: crate::pm::types::PackageJson = serde_json::from_str(json).unwrap();
        assert!(pkg.overrides.is_empty());
    }
}
