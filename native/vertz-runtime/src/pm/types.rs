use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

/// Parsed package.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageJson {
    pub name: Option<String>,
    pub version: Option<String>,
    #[serde(default)]
    pub dependencies: BTreeMap<String, String>,
    #[serde(rename = "devDependencies", default)]
    pub dev_dependencies: BTreeMap<String, String>,
    #[serde(rename = "peerDependencies", default)]
    pub peer_dependencies: BTreeMap<String, String>,
    #[serde(rename = "optionalDependencies", default)]
    pub optional_dependencies: BTreeMap<String, String>,
    #[serde(rename = "bundledDependencies", default)]
    pub bundled_dependencies: Vec<String>,
    #[serde(default)]
    pub bin: BinField,
    #[serde(default)]
    pub scripts: BTreeMap<String, String>,
}

/// The `bin` field in package.json can be a string or a map
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum BinField {
    Single(String),
    Map(BTreeMap<String, String>),
}

impl Default for BinField {
    fn default() -> Self {
        BinField::Map(BTreeMap::new())
    }
}

impl BinField {
    /// Normalize to a map. For single-string bin, uses the package name as key.
    pub fn to_map(&self, package_name: &str) -> BTreeMap<String, String> {
        match self {
            BinField::Single(path) => {
                let mut map = BTreeMap::new();
                map.insert(package_name.to_string(), path.clone());
                map
            }
            BinField::Map(map) => map.clone(),
        }
    }
}

/// Registry metadata for a package (abbreviated response)
#[derive(Debug, Clone, Deserialize)]
pub struct PackageMetadata {
    pub name: String,
    #[serde(rename = "dist-tags", default)]
    pub dist_tags: BTreeMap<String, String>,
    #[serde(default)]
    pub versions: BTreeMap<String, VersionMetadata>,
}

/// Lightweight registry metadata — only dist-tags and version keys.
/// Used by `vertz outdated` to avoid fetching full version metadata.
#[derive(Debug, Clone, Deserialize)]
pub struct AbbreviatedMetadata {
    pub name: String,
    #[serde(rename = "dist-tags", default)]
    pub dist_tags: BTreeMap<String, String>,
    /// Version keys with minimal metadata (we only need the keys)
    #[serde(default)]
    pub versions: BTreeMap<String, serde_json::Value>,
}

/// Per-version metadata from the registry
#[derive(Debug, Clone, Deserialize)]
pub struct VersionMetadata {
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub dependencies: BTreeMap<String, String>,
    #[serde(rename = "devDependencies", default)]
    pub dev_dependencies: BTreeMap<String, String>,
    #[serde(rename = "peerDependencies", default)]
    pub peer_dependencies: BTreeMap<String, String>,
    #[serde(rename = "optionalDependencies", default)]
    pub optional_dependencies: BTreeMap<String, String>,
    #[serde(rename = "bundledDependencies", default)]
    pub bundled_dependencies: Vec<String>,
    #[serde(default)]
    pub bin: BinField,
    #[serde(default)]
    pub dist: DistInfo,
    #[serde(default)]
    pub os: Option<Vec<String>>,
    #[serde(default)]
    pub cpu: Option<Vec<String>>,
}

/// Distribution info for a specific version
#[derive(Debug, Clone, Default, Deserialize)]
pub struct DistInfo {
    #[serde(default)]
    pub tarball: String,
    #[serde(default)]
    pub integrity: String,
    #[serde(default)]
    pub shasum: String,
}

/// A fully resolved package in the dependency graph
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedPackage {
    pub name: String,
    pub version: String,
    pub tarball_url: String,
    pub integrity: String,
    pub dependencies: BTreeMap<String, String>,
    pub bin: BTreeMap<String, String>,
    /// Where this package lives in node_modules. Empty = root level.
    /// Non-empty = nested under these parent packages.
    pub nest_path: Vec<String>,
}

/// Entry in vertz.lock
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LockfileEntry {
    pub name: String,
    pub range: String,
    pub version: String,
    pub resolved: String,
    pub integrity: String,
    pub dependencies: BTreeMap<String, String>,
}

/// Full lockfile representation
#[derive(Debug, Clone, Default)]
pub struct Lockfile {
    pub entries: BTreeMap<String, LockfileEntry>,
}

impl Lockfile {
    /// Create a spec key like "react@^18.0.0"
    pub fn spec_key(name: &str, range: &str) -> String {
        format!("{}@{}", name, range)
    }

    /// Parse a spec key into (name, range). Splits on the last '@'.
    pub fn parse_spec_key(key: &str) -> Option<(&str, &str)> {
        // Handle scoped packages: @scope/pkg@^1.0.0
        // Find the last '@' that isn't at position 0
        let at_pos = if let Some(rest) = key.strip_prefix('@') {
            rest.find('@').map(|p| p + 1)
        } else {
            key.rfind('@')
        };
        at_pos.map(|pos| (&key[..pos], &key[pos + 1..]))
    }
}

/// Read and parse package.json from a project directory
pub fn read_package_json(root_dir: &Path) -> Result<PackageJson, Box<dyn std::error::Error>> {
    let path = root_dir.join("package.json");
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Could not read {}: {}", path.display(), e))?;
    let pkg: PackageJson =
        serde_json::from_str(&content).map_err(|e| format!("Invalid package.json: {}", e))?;
    Ok(pkg)
}

/// Write package.json back to disk using read-modify-write to preserve unmodeled fields.
/// Only updates `dependencies` and `devDependencies` — all other fields are preserved as-is.
pub fn write_package_json(
    root_dir: &Path,
    pkg: &PackageJson,
) -> Result<(), Box<dyn std::error::Error>> {
    let path = root_dir.join("package.json");
    let existing = std::fs::read_to_string(&path)
        .map_err(|e| format!("Could not read {}: {}", path.display(), e))?;
    let mut value: serde_json::Value =
        serde_json::from_str(&existing).map_err(|e| format!("Invalid package.json: {}", e))?;
    let obj = value
        .as_object_mut()
        .ok_or("package.json is not an object")?;

    // Only update the dependency fields we manage
    if pkg.dependencies.is_empty() {
        obj.remove("dependencies");
    } else {
        obj.insert(
            "dependencies".into(),
            serde_json::to_value(&pkg.dependencies)?,
        );
    }

    if pkg.dev_dependencies.is_empty() {
        obj.remove("devDependencies");
    } else {
        obj.insert(
            "devDependencies".into(),
            serde_json::to_value(&pkg.dev_dependencies)?,
        );
    }

    let content = serde_json::to_string_pretty(&value)? + "\n";
    std::fs::write(&path, content)?;
    Ok(())
}

/// Parse a package specifier like "zod", "react@^18.0.0", or "@vertz/ui@^0.1.0"
/// Returns (name, optional_version_spec)
pub fn parse_package_specifier(spec: &str) -> (&str, Option<&str>) {
    if let Some(rest) = spec.strip_prefix('@') {
        // Scoped package: @scope/pkg or @scope/pkg@version
        if let Some(pos) = rest.find('@') {
            let pos = pos + 1;
            (&spec[..pos], Some(&spec[pos + 1..]))
        } else {
            (spec, None)
        }
    } else if let Some(pos) = spec.find('@') {
        (&spec[..pos], Some(&spec[pos + 1..]))
    } else {
        (spec, None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_package_json_minimal() {
        let json = r#"{"name": "my-app", "version": "1.0.0"}"#;
        let pkg: PackageJson = serde_json::from_str(json).unwrap();
        assert_eq!(pkg.name, Some("my-app".to_string()));
        assert_eq!(pkg.version, Some("1.0.0".to_string()));
        assert!(pkg.dependencies.is_empty());
        assert!(pkg.dev_dependencies.is_empty());
    }

    #[test]
    fn test_parse_package_json_with_deps() {
        let json = r#"{
            "name": "my-app",
            "dependencies": {
                "react": "^18.3.0",
                "zod": "^3.24.0"
            },
            "devDependencies": {
                "typescript": "^5.0.0"
            }
        }"#;
        let pkg: PackageJson = serde_json::from_str(json).unwrap();
        assert_eq!(pkg.dependencies.len(), 2);
        assert_eq!(pkg.dependencies["react"], "^18.3.0");
        assert_eq!(pkg.dependencies["zod"], "^3.24.0");
        assert_eq!(pkg.dev_dependencies.len(), 1);
        assert_eq!(pkg.dev_dependencies["typescript"], "^5.0.0");
    }

    #[test]
    fn test_parse_package_json_missing_fields() {
        let json = r#"{}"#;
        let pkg: PackageJson = serde_json::from_str(json).unwrap();
        assert!(pkg.name.is_none());
        assert!(pkg.version.is_none());
        assert!(pkg.dependencies.is_empty());
        assert!(pkg.dev_dependencies.is_empty());
        assert!(pkg.peer_dependencies.is_empty());
        assert!(pkg.optional_dependencies.is_empty());
        assert!(pkg.bundled_dependencies.is_empty());
    }

    #[test]
    fn test_bin_field_single_string() {
        let json = r#"{"name": "esbuild", "bin": "./bin/esbuild"}"#;
        let pkg: PackageJson = serde_json::from_str(json).unwrap();
        let bins = pkg.bin.to_map("esbuild");
        assert_eq!(bins.len(), 1);
        assert_eq!(bins["esbuild"], "./bin/esbuild");
    }

    #[test]
    fn test_bin_field_map() {
        let json = r#"{"name": "pkg", "bin": {"cmd1": "./bin/cmd1", "cmd2": "./bin/cmd2"}}"#;
        let pkg: PackageJson = serde_json::from_str(json).unwrap();
        let bins = pkg.bin.to_map("pkg");
        assert_eq!(bins.len(), 2);
        assert_eq!(bins["cmd1"], "./bin/cmd1");
        assert_eq!(bins["cmd2"], "./bin/cmd2");
    }

    #[test]
    fn test_bin_field_default() {
        let json = r#"{"name": "pkg"}"#;
        let pkg: PackageJson = serde_json::from_str(json).unwrap();
        let bins = pkg.bin.to_map("pkg");
        assert!(bins.is_empty());
    }

    #[test]
    fn test_lockfile_spec_key() {
        assert_eq!(Lockfile::spec_key("react", "^18.0.0"), "react@^18.0.0");
        assert_eq!(
            Lockfile::spec_key("@vertz/ui", "^0.1.0"),
            "@vertz/ui@^0.1.0"
        );
    }

    #[test]
    fn test_lockfile_parse_spec_key_simple() {
        let (name, range) = Lockfile::parse_spec_key("react@^18.0.0").unwrap();
        assert_eq!(name, "react");
        assert_eq!(range, "^18.0.0");
    }

    #[test]
    fn test_lockfile_parse_spec_key_scoped() {
        let (name, range) = Lockfile::parse_spec_key("@vertz/ui@^0.1.0").unwrap();
        assert_eq!(name, "@vertz/ui");
        assert_eq!(range, "^0.1.0");
    }

    #[test]
    fn test_lockfile_parse_spec_key_invalid() {
        assert!(Lockfile::parse_spec_key("no-at-sign").is_none());
    }

    #[test]
    fn test_parse_registry_metadata() {
        let json = r#"{
            "name": "zod",
            "dist-tags": {"latest": "3.24.4"},
            "versions": {
                "3.24.4": {
                    "name": "zod",
                    "version": "3.24.4",
                    "dist": {
                        "tarball": "https://registry.npmjs.org/zod/-/zod-3.24.4.tgz",
                        "integrity": "sha512-abc123",
                        "shasum": "def456"
                    }
                }
            }
        }"#;
        let meta: PackageMetadata = serde_json::from_str(json).unwrap();
        assert_eq!(meta.name, "zod");
        assert_eq!(meta.dist_tags["latest"], "3.24.4");
        assert_eq!(meta.versions.len(), 1);
        let v = &meta.versions["3.24.4"];
        assert_eq!(v.version, "3.24.4");
        assert_eq!(
            v.dist.tarball,
            "https://registry.npmjs.org/zod/-/zod-3.24.4.tgz"
        );
        assert_eq!(v.dist.integrity, "sha512-abc123");
    }

    #[test]
    fn test_parse_version_metadata_with_deps() {
        let json = r#"{
            "name": "react-dom",
            "version": "18.3.1",
            "dependencies": {
                "loose-envify": "^1.1.0",
                "scheduler": "^0.23.2"
            },
            "peerDependencies": {
                "react": "^18.3.1"
            },
            "dist": {
                "tarball": "https://registry.npmjs.org/react-dom/-/react-dom-18.3.1.tgz",
                "integrity": "sha512-xyz",
                "shasum": "abc"
            }
        }"#;
        let v: VersionMetadata = serde_json::from_str(json).unwrap();
        assert_eq!(v.dependencies.len(), 2);
        assert_eq!(v.dependencies["loose-envify"], "^1.1.0");
        assert_eq!(v.peer_dependencies.len(), 1);
        assert_eq!(v.peer_dependencies["react"], "^18.3.1");
    }

    #[test]
    fn test_resolved_package_equality() {
        let p1 = ResolvedPackage {
            name: "zod".to_string(),
            version: "3.24.4".to_string(),
            tarball_url: "https://example.com/zod.tgz".to_string(),
            integrity: "sha512-abc".to_string(),
            dependencies: BTreeMap::new(),
            bin: BTreeMap::new(),
            nest_path: vec![],
        };
        let p2 = p1.clone();
        assert_eq!(p1, p2);
    }

    #[test]
    fn test_btree_map_ordering() {
        let json = r#"{
            "name": "app",
            "dependencies": {
                "zod": "^3.0.0",
                "react": "^18.0.0",
                "axios": "^1.0.0"
            }
        }"#;
        let pkg: PackageJson = serde_json::from_str(json).unwrap();
        let keys: Vec<&String> = pkg.dependencies.keys().collect();
        // BTreeMap is sorted
        assert_eq!(keys, vec!["axios", "react", "zod"]);
    }

    #[test]
    fn test_read_package_json() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"name": "test-app", "version": "1.0.0", "dependencies": {"zod": "^3.24.0"}}"#,
        )
        .unwrap();
        let pkg = read_package_json(dir.path()).unwrap();
        assert_eq!(pkg.name, Some("test-app".to_string()));
        assert_eq!(pkg.dependencies["zod"], "^3.24.0");
    }

    #[test]
    fn test_read_package_json_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let result = read_package_json(dir.path());
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Could not read"));
    }

    #[test]
    fn test_write_package_json() {
        let dir = tempfile::tempdir().unwrap();
        // Must create an existing package.json first (read-modify-write approach)
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"name": "test", "version": "1.0.0"}"#,
        )
        .unwrap();

        let mut pkg = read_package_json(dir.path()).unwrap();
        pkg.dependencies
            .insert("zod".to_string(), "^3.24.0".to_string());
        write_package_json(dir.path(), &pkg).unwrap();

        let content = std::fs::read_to_string(dir.path().join("package.json")).unwrap();
        assert!(content.contains("\"zod\": \"^3.24.0\""));
        assert!(content.ends_with('\n'));
    }

    #[test]
    fn test_write_package_json_preserves_unmodeled_fields() {
        let dir = tempfile::tempdir().unwrap();
        // Write a package.json with fields NOT modeled in PackageJson struct
        let original = r#"{
  "name": "test-app",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": "./dist/index.js"
  },
  "engines": {
    "node": ">=18"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/test/test.git"
  },
  "license": "MIT",
  "dependencies": {
    "react": "^18.3.0"
  }
}"#;
        std::fs::write(dir.path().join("package.json"), original).unwrap();

        // Read, modify, write back
        let mut pkg = read_package_json(dir.path()).unwrap();
        pkg.dependencies
            .insert("zod".to_string(), "^3.24.0".to_string());
        write_package_json(dir.path(), &pkg).unwrap();

        // Read back as raw JSON to check unmodeled fields survived
        let written = std::fs::read_to_string(dir.path().join("package.json")).unwrap();
        let value: serde_json::Value = serde_json::from_str(&written).unwrap();
        let obj = value.as_object().unwrap();

        // Unmodeled fields must be preserved
        assert_eq!(obj["type"], "module");
        assert_eq!(obj["main"], "./dist/index.js");
        assert!(obj.contains_key("exports"));
        assert!(obj.contains_key("engines"));
        assert!(obj.contains_key("repository"));
        assert_eq!(obj["license"], "MIT");

        // Modified field must be updated
        assert_eq!(obj["dependencies"]["zod"], "^3.24.0");
        assert_eq!(obj["dependencies"]["react"], "^18.3.0");
    }

    #[test]
    fn test_write_package_json_removes_empty_deps() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"name": "test", "dependencies": {"zod": "^3.0.0"}, "devDependencies": {"typescript": "^5.0.0"}}"#,
        )
        .unwrap();

        let mut pkg = read_package_json(dir.path()).unwrap();
        pkg.dependencies.clear();
        write_package_json(dir.path(), &pkg).unwrap();

        let written = std::fs::read_to_string(dir.path().join("package.json")).unwrap();
        let value: serde_json::Value = serde_json::from_str(&written).unwrap();
        let obj = value.as_object().unwrap();

        // Empty dependencies should be removed entirely
        assert!(!obj.contains_key("dependencies"));
        // devDependencies should still be present
        assert!(obj.contains_key("devDependencies"));
    }

    #[test]
    fn test_parse_package_specifier_simple() {
        let (name, version) = parse_package_specifier("zod");
        assert_eq!(name, "zod");
        assert!(version.is_none());
    }

    #[test]
    fn test_parse_package_specifier_with_version() {
        let (name, version) = parse_package_specifier("react@^18.0.0");
        assert_eq!(name, "react");
        assert_eq!(version, Some("^18.0.0"));
    }

    #[test]
    fn test_parse_package_specifier_scoped() {
        let (name, version) = parse_package_specifier("@vertz/ui");
        assert_eq!(name, "@vertz/ui");
        assert!(version.is_none());
    }

    #[test]
    fn test_parse_package_specifier_scoped_with_version() {
        let (name, version) = parse_package_specifier("@vertz/ui@^0.1.0");
        assert_eq!(name, "@vertz/ui");
        assert_eq!(version, Some("^0.1.0"));
    }
}
