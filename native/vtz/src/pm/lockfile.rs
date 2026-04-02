use crate::pm::types::{Lockfile, LockfileEntry};
use std::collections::BTreeMap;
use std::path::Path;

const LOCKFILE_HEADER: &str =
    "# vertz.lock v1 (custom format) — DO NOT EDIT\n# Run \"vertz install\" to regenerate\n";

/// Write a lockfile to disk in the custom text format
pub fn write_lockfile(path: &Path, lockfile: &Lockfile) -> Result<(), std::io::Error> {
    let mut output = String::new();
    output.push_str(LOCKFILE_HEADER);
    output.push('\n');

    // Entries sorted alphabetically by spec key (BTreeMap guarantees this)
    for (key, entry) in &lockfile.entries {
        output.push_str(&format!("{}:\n", key));
        output.push_str(&format!("  version \"{}\"\n", entry.version));
        output.push_str(&format!("  resolved \"{}\"\n", entry.resolved));
        output.push_str(&format!("  integrity \"{}\"\n", entry.integrity));

        if entry.optional {
            output.push_str("  optional true\n");
        }

        if entry.overridden {
            output.push_str("  overridden true\n");
        }

        if !entry.dependencies.is_empty() {
            output.push_str("  dependencies:\n");
            for (dep_name, dep_range) in &entry.dependencies {
                output.push_str(&format!("    \"{}\" \"{}\"\n", dep_name, dep_range));
            }
        }

        if !entry.bin.is_empty() {
            output.push_str("  bin:\n");
            for (bin_name, bin_path) in &entry.bin {
                output.push_str(&format!("    \"{}\" \"{}\"\n", bin_name, bin_path));
            }
        }

        if !entry.scripts.is_empty() {
            output.push_str("  scripts:\n");
            for (script_name, script_cmd) in &entry.scripts {
                output.push_str(&format!("    \"{}\" \"{}\"\n", script_name, script_cmd));
            }
        }

        output.push('\n');
    }

    std::fs::write(path, output)
}

/// Read and parse a lockfile from disk
pub fn read_lockfile(path: &Path) -> Result<Lockfile, Box<dyn std::error::Error>> {
    let content = std::fs::read_to_string(path)?;
    parse_lockfile(&content)
}

/// Parse lockfile content into a Lockfile struct
pub fn parse_lockfile(content: &str) -> Result<Lockfile, Box<dyn std::error::Error>> {
    let mut lockfile = Lockfile::default();
    let mut current_key: Option<String> = None;
    let mut current_entry = LockfileEntry {
        name: String::new(),
        range: String::new(),
        version: String::new(),
        resolved: String::new(),
        integrity: String::new(),
        dependencies: BTreeMap::new(),
        bin: BTreeMap::new(),
        scripts: BTreeMap::new(),
        optional: false,
        overridden: false,
    };
    let mut in_section: Option<&'static str> = None;

    for line in content.lines() {
        // Skip comments and empty lines
        if line.starts_with('#') || line.trim().is_empty() {
            if line.trim().is_empty() && current_key.is_some() {
                // End of entry — save it
                let key = current_key.take().unwrap();
                lockfile.entries.insert(key, current_entry.clone());
                current_entry = LockfileEntry {
                    name: String::new(),
                    range: String::new(),
                    version: String::new(),
                    resolved: String::new(),
                    integrity: String::new(),
                    dependencies: BTreeMap::new(),
                    bin: BTreeMap::new(),
                    scripts: BTreeMap::new(),
                    optional: false,
                    overridden: false,
                };
                in_section = None;
            }
            continue;
        }

        let trimmed = line.trim();

        // Subsection headers that are NOT top-level entry keys
        const SECTION_HEADERS: &[&str] = &["dependencies:", "bin:", "scripts:"];

        // New entry: "name@range:" at column 0
        if !line.starts_with(' ') && trimmed.ends_with(':') && !SECTION_HEADERS.contains(&trimmed) {
            // Save previous entry if exists
            if let Some(key) = current_key.take() {
                lockfile.entries.insert(key, current_entry.clone());
                current_entry = LockfileEntry {
                    name: String::new(),
                    range: String::new(),
                    version: String::new(),
                    resolved: String::new(),
                    integrity: String::new(),
                    dependencies: BTreeMap::new(),
                    bin: BTreeMap::new(),
                    scripts: BTreeMap::new(),
                    optional: false,
                    overridden: false,
                };
                in_section = None;
            }

            let spec = &trimmed[..trimmed.len() - 1]; // Remove trailing ':'
            if let Some((name, range)) = Lockfile::parse_spec_key(spec) {
                current_entry.name = name.to_string();
                current_entry.range = range.to_string();
                current_key = Some(spec.to_string());
            }
            continue;
        }

        // Inside an entry
        if current_key.is_some() {
            if trimmed == "dependencies:" {
                in_section = Some("dependencies");
                continue;
            }
            if trimmed == "bin:" {
                in_section = Some("bin");
                continue;
            }
            if trimmed == "scripts:" {
                in_section = Some("scripts");
                continue;
            }

            match in_section {
                Some("dependencies") => {
                    if let Some((name, range)) = parse_quoted_pair(trimmed) {
                        current_entry
                            .dependencies
                            .insert(name.to_string(), range.to_string());
                    }
                }
                Some("bin") => {
                    if let Some((name, path)) = parse_quoted_pair(trimmed) {
                        current_entry.bin.insert(name.to_string(), path.to_string());
                    }
                }
                Some("scripts") => {
                    if let Some((name, cmd)) = parse_quoted_pair(trimmed) {
                        current_entry
                            .scripts
                            .insert(name.to_string(), cmd.to_string());
                    }
                }
                _ => {
                    if let Some(rest) = trimmed.strip_prefix("version ") {
                        current_entry.version = unquote(rest).to_string();
                    } else if let Some(rest) = trimmed.strip_prefix("resolved ") {
                        current_entry.resolved = unquote(rest).to_string();
                    } else if let Some(rest) = trimmed.strip_prefix("integrity ") {
                        current_entry.integrity = unquote(rest).to_string();
                    } else if trimmed == "optional true" {
                        current_entry.optional = true;
                    } else if trimmed == "overridden true" {
                        current_entry.overridden = true;
                    }
                }
            }
        }
    }

    // Save last entry
    if let Some(key) = current_key {
        lockfile.entries.insert(key, current_entry);
    }

    Ok(lockfile)
}

/// Remove surrounding quotes from a string
fn unquote(s: &str) -> &str {
    s.trim().trim_matches('"')
}

/// Parse a pair of quoted strings: "name" "value"
fn parse_quoted_pair(s: &str) -> Option<(&str, &str)> {
    let s = s.trim();
    if !s.starts_with('"') {
        return None;
    }
    let after_first_quote = &s[1..];
    let end_first = after_first_quote.find('"')?;
    let name = &after_first_quote[..end_first];

    let rest = &after_first_quote[end_first + 1..].trim_start();
    if !rest.starts_with('"') {
        return None;
    }
    let after_second_quote = &rest[1..];
    let end_second = after_second_quote.find('"')?;
    let value = &after_second_quote[..end_second];

    Some((name, value))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_write_and_read_lockfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vertz.lock");

        let mut lockfile = Lockfile::default();
        let mut deps = BTreeMap::new();
        deps.insert("js-tokens".to_string(), "^3.0.0 || ^4.0.0".to_string());

        lockfile.entries.insert(
            "react@^18.3.0".to_string(),
            LockfileEntry {
                name: "react".to_string(),
                range: "^18.3.0".to_string(),
                version: "18.3.1".to_string(),
                resolved: "https://registry.npmjs.org/react/-/react-18.3.1.tgz".to_string(),
                integrity: "sha512-abc123".to_string(),
                dependencies: deps,
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
            },
        );

        lockfile.entries.insert(
            "zod@^3.24.0".to_string(),
            LockfileEntry {
                name: "zod".to_string(),
                range: "^3.24.0".to_string(),
                version: "3.24.4".to_string(),
                resolved: "https://registry.npmjs.org/zod/-/zod-3.24.4.tgz".to_string(),
                integrity: "sha512-def456".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
            },
        );

        write_lockfile(&path, &lockfile).unwrap();
        let parsed = read_lockfile(&path).unwrap();

        assert_eq!(parsed.entries.len(), 2);
        assert_eq!(parsed.entries["react@^18.3.0"].version, "18.3.1");
        assert_eq!(parsed.entries["zod@^3.24.0"].version, "3.24.4");
        assert_eq!(
            parsed.entries["react@^18.3.0"].dependencies["js-tokens"],
            "^3.0.0 || ^4.0.0"
        );
    }

    #[test]
    fn test_lockfile_header() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vertz.lock");

        let lockfile = Lockfile::default();
        write_lockfile(&path, &lockfile).unwrap();

        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.starts_with("# vertz.lock v1"));
        assert!(content.contains("DO NOT EDIT"));
    }

    #[test]
    fn test_lockfile_deterministic() {
        let dir = tempfile::tempdir().unwrap();
        let path1 = dir.path().join("lock1");
        let path2 = dir.path().join("lock2");

        let mut lockfile = Lockfile::default();
        // Insert in reverse order — BTreeMap should sort
        lockfile.entries.insert(
            "zod@^3.0.0".to_string(),
            LockfileEntry {
                name: "zod".to_string(),
                range: "^3.0.0".to_string(),
                version: "3.24.4".to_string(),
                resolved: "url1".to_string(),
                integrity: "hash1".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
            },
        );
        lockfile.entries.insert(
            "react@^18.0.0".to_string(),
            LockfileEntry {
                name: "react".to_string(),
                range: "^18.0.0".to_string(),
                version: "18.3.1".to_string(),
                resolved: "url2".to_string(),
                integrity: "hash2".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
            },
        );

        write_lockfile(&path1, &lockfile).unwrap();
        write_lockfile(&path2, &lockfile).unwrap();

        let content1 = std::fs::read_to_string(&path1).unwrap();
        let content2 = std::fs::read_to_string(&path2).unwrap();
        assert_eq!(content1, content2); // Byte-identical
    }

    #[test]
    fn test_lockfile_sorted_output() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vertz.lock");

        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "zod@^3.0.0".to_string(),
            LockfileEntry {
                name: "zod".to_string(),
                range: "^3.0.0".to_string(),
                version: "3.24.4".to_string(),
                resolved: "url".to_string(),
                integrity: "hash".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
            },
        );
        lockfile.entries.insert(
            "react@^18.0.0".to_string(),
            LockfileEntry {
                name: "react".to_string(),
                range: "^18.0.0".to_string(),
                version: "18.3.1".to_string(),
                resolved: "url".to_string(),
                integrity: "hash".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
            },
        );

        write_lockfile(&path, &lockfile).unwrap();

        let content = std::fs::read_to_string(&path).unwrap();
        let react_pos = content.find("react@").unwrap();
        let zod_pos = content.find("zod@").unwrap();
        assert!(react_pos < zod_pos); // Alphabetical order
    }

    #[test]
    fn test_parse_scoped_package() {
        let content = r#"# vertz.lock v1 — DO NOT EDIT
# Run "vertz install" to regenerate

@vertz/ui@^0.1.0:
  version "0.1.42"
  resolved "https://registry.npmjs.org/@vertz/ui/-/ui-0.1.42.tgz"
  integrity "sha512-xxx"

"#;
        let lockfile = parse_lockfile(content).unwrap();
        assert_eq!(lockfile.entries.len(), 1);
        let entry = &lockfile.entries["@vertz/ui@^0.1.0"];
        assert_eq!(entry.name, "@vertz/ui");
        assert_eq!(entry.range, "^0.1.0");
        assert_eq!(entry.version, "0.1.42");
    }

    #[test]
    fn test_unquote() {
        assert_eq!(unquote("\"hello\""), "hello");
        assert_eq!(unquote("hello"), "hello");
        assert_eq!(unquote("\"\""), "");
    }

    #[test]
    fn test_parse_quoted_pair() {
        let (name, value) = parse_quoted_pair("\"loose-envify\" \"^1.1.0\"").unwrap();
        assert_eq!(name, "loose-envify");
        assert_eq!(value, "^1.1.0");
    }

    #[test]
    fn test_parse_quoted_pair_with_spaces() {
        let (name, value) = parse_quoted_pair("    \"js-tokens\" \"^3.0.0 || ^4.0.0\"").unwrap();
        assert_eq!(name, "js-tokens");
        assert_eq!(value, "^3.0.0 || ^4.0.0");
    }

    #[test]
    fn test_write_and_read_workspace_link_entries() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vertz.lock");

        let mut lockfile = Lockfile::default();

        // Registry entry
        lockfile.entries.insert(
            "zod@^3.24.0".to_string(),
            LockfileEntry {
                name: "zod".to_string(),
                range: "^3.24.0".to_string(),
                version: "3.24.4".to_string(),
                resolved: "https://registry.npmjs.org/zod/-/zod-3.24.4.tgz".to_string(),
                integrity: "sha512-abc".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
            },
        );

        // Workspace link entry
        lockfile.entries.insert(
            "@myorg/shared@link:packages/shared".to_string(),
            LockfileEntry {
                name: "@myorg/shared".to_string(),
                range: "link:packages/shared".to_string(),
                version: "1.0.0".to_string(),
                resolved: "link:packages/shared".to_string(),
                integrity: String::new(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
            },
        );

        write_lockfile(&path, &lockfile).unwrap();
        let parsed = read_lockfile(&path).unwrap();

        assert_eq!(parsed.entries.len(), 2);

        // Verify workspace link entry survives round-trip
        let ws = &parsed.entries["@myorg/shared@link:packages/shared"];
        assert_eq!(ws.name, "@myorg/shared");
        assert_eq!(ws.range, "link:packages/shared");
        assert_eq!(ws.version, "1.0.0");
        assert_eq!(ws.resolved, "link:packages/shared");
        assert!(ws.integrity.is_empty());
        assert!(ws.dependencies.is_empty());

        // Verify registry entry also survives
        assert_eq!(parsed.entries["zod@^3.24.0"].version, "3.24.4");
    }

    #[test]
    fn test_parse_empty_lockfile() {
        let lockfile = parse_lockfile("").unwrap();
        assert!(lockfile.entries.is_empty());
    }

    #[test]
    fn test_parse_lockfile_comments_only() {
        let content = "# vertz.lock v1 — DO NOT EDIT\n# Run \"vertz install\" to regenerate\n";
        let lockfile = parse_lockfile(content).unwrap();
        assert!(lockfile.entries.is_empty());
    }

    #[test]
    fn test_write_and_read_optional_entry() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vertz.lock");

        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "fsevents@^2.3.0".to_string(),
            LockfileEntry {
                name: "fsevents".to_string(),
                range: "^2.3.0".to_string(),
                version: "2.3.3".to_string(),
                resolved: "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz".to_string(),
                integrity: "sha512-abc".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: true,
                overridden: false,
            },
        );
        lockfile.entries.insert(
            "zod@^3.24.0".to_string(),
            LockfileEntry {
                name: "zod".to_string(),
                range: "^3.24.0".to_string(),
                version: "3.24.4".to_string(),
                resolved: "https://registry.npmjs.org/zod/-/zod-3.24.4.tgz".to_string(),
                integrity: "sha512-def".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
            },
        );

        write_lockfile(&path, &lockfile).unwrap();

        // Verify the file contains "optional true"
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("optional true"));

        // Verify round-trip
        let parsed = read_lockfile(&path).unwrap();
        assert_eq!(parsed.entries.len(), 2);
        assert!(parsed.entries["fsevents@^2.3.0"].optional);
        assert!(!parsed.entries["zod@^3.24.0"].optional);
    }

    #[test]
    fn test_parse_optional_marker() {
        let content = r#"# vertz.lock v1 — DO NOT EDIT
# Run "vertz install" to regenerate

fsevents@^2.3.0:
  version "2.3.3"
  resolved "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz"
  integrity "sha512-abc"
  optional true

"#;
        let lockfile = parse_lockfile(content).unwrap();
        assert_eq!(lockfile.entries.len(), 1);
        let entry = &lockfile.entries["fsevents@^2.3.0"];
        assert!(entry.optional);
        assert_eq!(entry.version, "2.3.3");
    }

    #[test]
    fn test_write_and_read_overridden_entry() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vertz.lock");

        let mut lockfile = Lockfile::default();
        lockfile.entries.insert(
            "qs@~6.5.0".to_string(),
            LockfileEntry {
                name: "qs".to_string(),
                range: "~6.5.0".to_string(),
                version: "6.11.0".to_string(),
                resolved: "https://registry.npmjs.org/qs/-/qs-6.11.0.tgz".to_string(),
                integrity: "sha512-abc".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: true,
            },
        );
        lockfile.entries.insert(
            "zod@^3.24.0".to_string(),
            LockfileEntry {
                name: "zod".to_string(),
                range: "^3.24.0".to_string(),
                version: "3.24.4".to_string(),
                resolved: "https://registry.npmjs.org/zod/-/zod-3.24.4.tgz".to_string(),
                integrity: "sha512-def".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
            },
        );

        write_lockfile(&path, &lockfile).unwrap();

        // Verify the file content contains "overridden true" only for qs
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("overridden true"));

        let parsed = read_lockfile(&path).unwrap();
        assert!(parsed.entries["qs@~6.5.0"].overridden);
        assert!(!parsed.entries["zod@^3.24.0"].overridden);
    }

    #[test]
    fn test_parse_lockfile_without_overridden_defaults_false() {
        let content = r#"# vertz.lock v1 — DO NOT EDIT
# Run "vertz install" to regenerate

zod@^3.24.0:
  version "3.24.4"
  resolved "url"
  integrity "hash"

"#;
        let lockfile = parse_lockfile(content).unwrap();
        assert!(!lockfile.entries["zod@^3.24.0"].overridden);
    }

    #[test]
    fn test_write_and_read_bin_entries() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vertz.lock");

        let mut lockfile = Lockfile::default();
        let mut bin = BTreeMap::new();
        bin.insert("esbuild".to_string(), "bin/esbuild".to_string());

        lockfile.entries.insert(
            "esbuild@^0.20.0".to_string(),
            LockfileEntry {
                name: "esbuild".to_string(),
                range: "^0.20.0".to_string(),
                version: "0.20.2".to_string(),
                resolved: "https://registry.npmjs.org/esbuild/-/esbuild-0.20.2.tgz".to_string(),
                integrity: "sha512-abc".to_string(),
                dependencies: BTreeMap::new(),
                bin,
                scripts: BTreeMap::new(),
                optional: false,
                overridden: false,
            },
        );

        write_lockfile(&path, &lockfile).unwrap();

        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("bin:"));
        assert!(content.contains("\"esbuild\" \"bin/esbuild\""));

        let parsed = read_lockfile(&path).unwrap();
        let entry = &parsed.entries["esbuild@^0.20.0"];
        assert_eq!(entry.bin.len(), 1);
        assert_eq!(entry.bin["esbuild"], "bin/esbuild");
    }

    #[test]
    fn test_write_and_read_scripts_entries() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vertz.lock");

        let mut lockfile = Lockfile::default();
        let mut scripts = BTreeMap::new();
        scripts.insert(
            "postinstall".to_string(),
            "node scripts/build.js".to_string(),
        );

        lockfile.entries.insert(
            "esbuild@^0.20.0".to_string(),
            LockfileEntry {
                name: "esbuild".to_string(),
                range: "^0.20.0".to_string(),
                version: "0.20.2".to_string(),
                resolved: "https://registry.npmjs.org/esbuild/-/esbuild-0.20.2.tgz".to_string(),
                integrity: "sha512-abc".to_string(),
                dependencies: BTreeMap::new(),
                bin: BTreeMap::new(),
                scripts,
                optional: false,
                overridden: false,
            },
        );

        write_lockfile(&path, &lockfile).unwrap();

        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("scripts:"));
        assert!(content.contains("\"postinstall\" \"node scripts/build.js\""));

        let parsed = read_lockfile(&path).unwrap();
        let entry = &parsed.entries["esbuild@^0.20.0"];
        assert_eq!(entry.scripts.len(), 1);
        assert_eq!(entry.scripts["postinstall"], "node scripts/build.js");
    }

    #[test]
    fn test_parse_lockfile_with_bin_and_scripts() {
        let content = r#"# vertz.lock v1 — DO NOT EDIT
# Run "vertz install" to regenerate

esbuild@^0.20.0:
  version "0.20.2"
  resolved "https://registry.npmjs.org/esbuild/-/esbuild-0.20.2.tgz"
  integrity "sha512-abc"
  bin:
    "esbuild" "bin/esbuild"
  scripts:
    "postinstall" "node scripts/build.js"

"#;
        let lockfile = parse_lockfile(content).unwrap();
        let entry = &lockfile.entries["esbuild@^0.20.0"];
        assert_eq!(entry.version, "0.20.2");
        assert_eq!(entry.bin["esbuild"], "bin/esbuild");
        assert_eq!(entry.scripts["postinstall"], "node scripts/build.js");
    }

    #[test]
    fn test_lockfile_without_bin_scripts_defaults_empty() {
        let content = r#"# vertz.lock v1 — DO NOT EDIT
# Run "vertz install" to regenerate

zod@^3.24.0:
  version "3.24.4"
  resolved "url"
  integrity "hash"

"#;
        let lockfile = parse_lockfile(content).unwrap();
        let entry = &lockfile.entries["zod@^3.24.0"];
        assert!(entry.bin.is_empty());
        assert!(entry.scripts.is_empty());
    }
}
