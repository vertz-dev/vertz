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
    #[serde(default)]
    pub workspaces: Option<Vec<String>>,
    #[serde(default)]
    pub overrides: BTreeMap<String, String>,
    /// Files to include in the published package (whitelist mode)
    #[serde(default)]
    pub files: Option<Vec<String>>,
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
    pub scripts: BTreeMap<String, String>,
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
    /// Binary executables exposed by this package (name → relative path)
    pub bin: BTreeMap<String, String>,
    /// Package scripts (e.g., postinstall). Stored so lockfile-only resolution
    /// can detect packages that need script execution without fetching metadata.
    pub scripts: BTreeMap<String, String>,
    pub optional: bool,
    /// Whether this version was forced by an override
    pub overridden: bool,
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
/// Updates `dependencies`, `devDependencies`, and `peerDependencies` — all other fields
/// are preserved as-is.
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

    if pkg.peer_dependencies.is_empty() {
        obj.remove("peerDependencies");
    } else {
        obj.insert(
            "peerDependencies".into(),
            serde_json::to_value(&pkg.peer_dependencies)?,
        );
    }

    if pkg.optional_dependencies.is_empty() {
        obj.remove("optionalDependencies");
    } else {
        obj.insert(
            "optionalDependencies".into(),
            serde_json::to_value(&pkg.optional_dependencies)?,
        );
    }

    let content = serde_json::to_string_pretty(&value)? + "\n";
    std::fs::write(&path, content)?;
    Ok(())
}

/// A parsed GitHub specifier: `github:owner/repo[#ref]`
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitHubSpecifier {
    pub owner: String,
    pub repo: String,
    pub ref_: Option<String>,
}

/// Result of parsing a package specifier — either an npm name+version or a GitHub specifier
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParsedSpecifier<'a> {
    /// Standard npm specifier: name with optional version range
    Npm {
        name: &'a str,
        version_spec: Option<&'a str>,
    },
    /// GitHub specifier: `github:owner/repo[#ref]`
    GitHub(GitHubSpecifier),
    /// Parse error
    Error(String),
}

/// Parse a package specifier like "zod", "react@^18.0.0", "@vertz/ui@^0.1.0",
/// or "github:owner/repo[#ref]"
pub fn parse_package_specifier(spec: &str) -> ParsedSpecifier<'_> {
    // Check for GitHub specifier
    if let Some(rest) = spec.strip_prefix("github:") {
        return parse_github_specifier(rest);
    }

    // Standard npm specifier
    if let Some(rest) = spec.strip_prefix('@') {
        // Scoped package: @scope/pkg or @scope/pkg@version
        if let Some(pos) = rest.find('@') {
            let pos = pos + 1;
            ParsedSpecifier::Npm {
                name: &spec[..pos],
                version_spec: Some(&spec[pos + 1..]),
            }
        } else {
            ParsedSpecifier::Npm {
                name: spec,
                version_spec: None,
            }
        }
    } else if let Some(pos) = spec.find('@') {
        ParsedSpecifier::Npm {
            name: &spec[..pos],
            version_spec: Some(&spec[pos + 1..]),
        }
    } else {
        ParsedSpecifier::Npm {
            name: spec,
            version_spec: None,
        }
    }
}

/// Parse the part after "github:" into a GitHubSpecifier
fn parse_github_specifier(rest: &str) -> ParsedSpecifier<'_> {
    // Split on # for optional ref (treat empty ref as None)
    let (owner_repo, ref_) = if let Some(hash_pos) = rest.find('#') {
        let r = &rest[hash_pos + 1..];
        (
            &rest[..hash_pos],
            if r.is_empty() {
                None
            } else {
                Some(r.to_string())
            },
        )
    } else {
        (rest, None)
    };

    // Split owner/repo
    let Some(slash_pos) = owner_repo.find('/') else {
        return ParsedSpecifier::Error(format!(
            "invalid GitHub specifier \"github:{}\" — expected format: github:owner/repo[#ref]",
            rest
        ));
    };

    let owner = &owner_repo[..slash_pos];
    let repo = &owner_repo[slash_pos + 1..];

    if owner.is_empty() || repo.is_empty() {
        return ParsedSpecifier::Error(format!(
            "invalid GitHub specifier \"github:{}\" — expected format: github:owner/repo[#ref]",
            rest
        ));
    }

    ParsedSpecifier::GitHub(GitHubSpecifier {
        owner: owner.to_string(),
        repo: repo.to_string(),
        ref_,
    })
}

/// Severity levels for vulnerability advisories, ordered from most to least severe.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Critical,
    High,
    Moderate,
    Low,
}

impl Severity {
    /// Parse a severity string (case-insensitive).
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "critical" => Some(Severity::Critical),
            "high" => Some(Severity::High),
            "moderate" => Some(Severity::Moderate),
            "low" => Some(Severity::Low),
            _ => None,
        }
    }

    /// Return the numeric rank for sorting (lower = more severe).
    pub fn rank(self) -> u8 {
        match self {
            Severity::Critical => 0,
            Severity::High => 1,
            Severity::Moderate => 2,
            Severity::Low => 3,
        }
    }

    /// Returns true if this severity is at or above the given threshold.
    pub fn at_or_above(self, threshold: Severity) -> bool {
        self.rank() <= threshold.rank()
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Severity::Critical => "critical",
            Severity::High => "high",
            Severity::Moderate => "moderate",
            Severity::Low => "low",
        }
    }
}

impl std::fmt::Display for Severity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A single advisory from the npm bulk advisory API response.
#[derive(Debug, Clone, Deserialize)]
pub struct Advisory {
    pub id: u64,
    pub title: String,
    pub severity: String,
    pub url: String,
    pub vulnerable_versions: String,
    pub patched_versions: String,
}

/// A single vulnerability entry in the audit output.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditEntry {
    pub name: String,
    pub version: String,
    pub severity: Severity,
    pub title: String,
    pub url: String,
    pub patched: String,
    pub id: u64,
    /// Direct dependency that pulls in this transitive dep, or None if direct.
    pub parent: Option<String>,
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
    fn test_lockfile_spec_key_github() {
        assert_eq!(
            Lockfile::spec_key("my-lib", "github:user/my-lib#v2.1.0"),
            "my-lib@github:user/my-lib#v2.1.0"
        );
    }

    #[test]
    fn test_lockfile_parse_spec_key_github() {
        let (name, range) = Lockfile::parse_spec_key("my-lib@github:user/my-lib#v2.1.0").unwrap();
        assert_eq!(name, "my-lib");
        assert_eq!(range, "github:user/my-lib#v2.1.0");
    }

    #[test]
    fn test_lockfile_parse_spec_key_scoped_github() {
        let (name, range) = Lockfile::parse_spec_key("@org/lib@github:user/lib").unwrap();
        assert_eq!(name, "@org/lib");
        assert_eq!(range, "github:user/lib");
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
    fn test_write_package_json_peer_dependencies() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"name": "my-lib", "version": "1.0.0"}"#,
        )
        .unwrap();

        let mut pkg = read_package_json(dir.path()).unwrap();
        pkg.peer_dependencies
            .insert("react".to_string(), "^18.0.0".to_string());
        write_package_json(dir.path(), &pkg).unwrap();

        let written = std::fs::read_to_string(dir.path().join("package.json")).unwrap();
        let value: serde_json::Value = serde_json::from_str(&written).unwrap();
        let obj = value.as_object().unwrap();
        assert!(obj.contains_key("peerDependencies"));
        assert_eq!(obj["peerDependencies"]["react"], "^18.0.0");
    }

    #[test]
    fn test_write_package_json_removes_empty_peer_deps() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"name": "my-lib", "peerDependencies": {"react": "^18.0.0"}}"#,
        )
        .unwrap();

        let mut pkg = read_package_json(dir.path()).unwrap();
        pkg.peer_dependencies.clear();
        write_package_json(dir.path(), &pkg).unwrap();

        let written = std::fs::read_to_string(dir.path().join("package.json")).unwrap();
        let value: serde_json::Value = serde_json::from_str(&written).unwrap();
        let obj = value.as_object().unwrap();
        assert!(!obj.contains_key("peerDependencies"));
    }

    #[test]
    fn test_write_package_json_preserves_existing_peer_deps() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"name": "my-lib", "peerDependencies": {"react": "^18.0.0"}, "dependencies": {"zod": "^3.0.0"}}"#,
        )
        .unwrap();

        let mut pkg = read_package_json(dir.path()).unwrap();
        pkg.peer_dependencies
            .insert("react-dom".to_string(), "^18.0.0".to_string());
        write_package_json(dir.path(), &pkg).unwrap();

        let written = std::fs::read_to_string(dir.path().join("package.json")).unwrap();
        let value: serde_json::Value = serde_json::from_str(&written).unwrap();
        let obj = value.as_object().unwrap();
        assert_eq!(obj["peerDependencies"]["react"], "^18.0.0");
        assert_eq!(obj["peerDependencies"]["react-dom"], "^18.0.0");
        assert_eq!(obj["dependencies"]["zod"], "^3.0.0");
    }

    // --- GitHub specifier parsing tests ---

    #[test]
    fn test_parse_package_specifier_github_basic() {
        let result = parse_package_specifier("github:user/my-lib");
        match result {
            ParsedSpecifier::GitHub(gh) => {
                assert_eq!(gh.owner, "user");
                assert_eq!(gh.repo, "my-lib");
                assert_eq!(gh.ref_, None);
            }
            _ => panic!("Expected GitHub specifier"),
        }
    }

    #[test]
    fn test_parse_package_specifier_github_with_branch() {
        let result = parse_package_specifier("github:user/my-lib#develop");
        match result {
            ParsedSpecifier::GitHub(gh) => {
                assert_eq!(gh.owner, "user");
                assert_eq!(gh.repo, "my-lib");
                assert_eq!(gh.ref_, Some("develop".to_string()));
            }
            _ => panic!("Expected GitHub specifier"),
        }
    }

    #[test]
    fn test_parse_package_specifier_github_with_tag() {
        let result = parse_package_specifier("github:user/my-lib#v2.1.0");
        match result {
            ParsedSpecifier::GitHub(gh) => {
                assert_eq!(gh.ref_, Some("v2.1.0".to_string()));
            }
            _ => panic!("Expected GitHub specifier"),
        }
    }

    #[test]
    fn test_parse_package_specifier_github_with_sha() {
        let result = parse_package_specifier("github:user/my-lib#a1b2c3d");
        match result {
            ParsedSpecifier::GitHub(gh) => {
                assert_eq!(gh.ref_, Some("a1b2c3d".to_string()));
            }
            _ => panic!("Expected GitHub specifier"),
        }
    }

    #[test]
    fn test_parse_package_specifier_github_invalid_no_slash() {
        let result = parse_package_specifier("github:invalid");
        match result {
            ParsedSpecifier::Error(msg) => {
                assert!(
                    msg.contains("github:"),
                    "Error should reference the specifier"
                );
                assert!(
                    msg.contains("owner/repo"),
                    "Error should mention expected format"
                );
            }
            _ => panic!("Expected Error for invalid GitHub specifier"),
        }
    }

    #[test]
    fn test_parse_package_specifier_github_empty_ref() {
        // "github:user/my-lib#" should treat empty ref as None
        let result = parse_package_specifier("github:user/my-lib#");
        match result {
            ParsedSpecifier::GitHub(gh) => {
                assert_eq!(gh.owner, "user");
                assert_eq!(gh.repo, "my-lib");
                assert_eq!(gh.ref_, None);
            }
            _ => panic!("Expected GitHub specifier"),
        }
    }

    #[test]
    fn test_parse_package_specifier_github_invalid_empty_owner() {
        let result = parse_package_specifier("github:/repo");
        match result {
            ParsedSpecifier::Error(msg) => {
                assert!(msg.contains("owner/repo"));
            }
            _ => panic!("Expected Error for empty owner"),
        }
    }

    #[test]
    fn test_parse_package_specifier_github_invalid_empty_repo() {
        let result = parse_package_specifier("github:owner/");
        match result {
            ParsedSpecifier::Error(msg) => {
                assert!(msg.contains("owner/repo"));
            }
            _ => panic!("Expected Error for empty repo"),
        }
    }

    // --- Existing npm specifier tests (now using ParsedSpecifier::Npm) ---

    #[test]
    fn test_parse_package_specifier_simple() {
        match parse_package_specifier("zod") {
            ParsedSpecifier::Npm { name, version_spec } => {
                assert_eq!(name, "zod");
                assert!(version_spec.is_none());
            }
            _ => panic!("Expected Npm specifier"),
        }
    }

    #[test]
    fn test_parse_package_specifier_with_version() {
        match parse_package_specifier("react@^18.0.0") {
            ParsedSpecifier::Npm { name, version_spec } => {
                assert_eq!(name, "react");
                assert_eq!(version_spec, Some("^18.0.0"));
            }
            _ => panic!("Expected Npm specifier"),
        }
    }

    #[test]
    fn test_parse_package_specifier_scoped() {
        match parse_package_specifier("@vertz/ui") {
            ParsedSpecifier::Npm { name, version_spec } => {
                assert_eq!(name, "@vertz/ui");
                assert!(version_spec.is_none());
            }
            _ => panic!("Expected Npm specifier"),
        }
    }

    #[test]
    fn test_parse_package_specifier_scoped_with_version() {
        match parse_package_specifier("@vertz/ui@^0.1.0") {
            ParsedSpecifier::Npm { name, version_spec } => {
                assert_eq!(name, "@vertz/ui");
                assert_eq!(version_spec, Some("^0.1.0"));
            }
            _ => panic!("Expected Npm specifier"),
        }
    }

    #[test]
    fn test_parse_optional_dependencies() {
        let json = r#"{
            "name": "my-app",
            "optionalDependencies": {
                "fsevents": "^2.3.0"
            }
        }"#;
        let pkg: PackageJson = serde_json::from_str(json).unwrap();
        assert_eq!(pkg.optional_dependencies.len(), 1);
        assert_eq!(pkg.optional_dependencies["fsevents"], "^2.3.0");
    }

    #[test]
    fn test_write_package_json_optional_dependencies() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"name": "test", "version": "1.0.0"}"#,
        )
        .unwrap();

        let mut pkg = read_package_json(dir.path()).unwrap();
        pkg.optional_dependencies
            .insert("fsevents".to_string(), "^2.3.0".to_string());
        write_package_json(dir.path(), &pkg).unwrap();

        let written = std::fs::read_to_string(dir.path().join("package.json")).unwrap();
        let value: serde_json::Value = serde_json::from_str(&written).unwrap();
        let obj = value.as_object().unwrap();
        assert!(obj.contains_key("optionalDependencies"));
        assert_eq!(obj["optionalDependencies"]["fsevents"], "^2.3.0");
    }

    #[test]
    fn test_write_package_json_removes_empty_optional_deps() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"name": "test", "optionalDependencies": {"fsevents": "^2.3.0"}}"#,
        )
        .unwrap();

        let mut pkg = read_package_json(dir.path()).unwrap();
        pkg.optional_dependencies.clear();
        write_package_json(dir.path(), &pkg).unwrap();

        let written = std::fs::read_to_string(dir.path().join("package.json")).unwrap();
        let value: serde_json::Value = serde_json::from_str(&written).unwrap();
        let obj = value.as_object().unwrap();
        assert!(!obj.contains_key("optionalDependencies"));
    }

    // --- Severity tests ---

    #[test]
    fn test_severity_parse() {
        assert_eq!(Severity::parse("critical"), Some(Severity::Critical));
        assert_eq!(Severity::parse("high"), Some(Severity::High));
        assert_eq!(Severity::parse("moderate"), Some(Severity::Moderate));
        assert_eq!(Severity::parse("low"), Some(Severity::Low));
        assert_eq!(Severity::parse("Critical"), Some(Severity::Critical));
        assert_eq!(Severity::parse("HIGH"), Some(Severity::High));
        assert_eq!(Severity::parse("unknown"), None);
    }

    #[test]
    fn test_severity_ordering() {
        assert!(Severity::Critical.rank() < Severity::High.rank());
        assert!(Severity::High.rank() < Severity::Moderate.rank());
        assert!(Severity::Moderate.rank() < Severity::Low.rank());
    }

    #[test]
    fn test_severity_at_or_above() {
        assert!(Severity::Critical.at_or_above(Severity::High));
        assert!(Severity::High.at_or_above(Severity::High));
        assert!(!Severity::Moderate.at_or_above(Severity::High));
        assert!(!Severity::Low.at_or_above(Severity::High));
        // Low threshold shows everything
        assert!(Severity::Low.at_or_above(Severity::Low));
        assert!(Severity::Critical.at_or_above(Severity::Low));
    }

    #[test]
    fn test_severity_as_str() {
        assert_eq!(Severity::Critical.as_str(), "critical");
        assert_eq!(Severity::High.as_str(), "high");
        assert_eq!(Severity::Moderate.as_str(), "moderate");
        assert_eq!(Severity::Low.as_str(), "low");
    }

    #[test]
    fn test_severity_display() {
        assert_eq!(format!("{}", Severity::Critical), "critical");
        assert_eq!(format!("{}", Severity::High), "high");
    }

    // --- Advisory parsing tests ---

    #[test]
    fn test_parse_advisory_json() {
        let json = r#"{
            "id": 1234,
            "title": "Prototype Pollution",
            "severity": "critical",
            "url": "https://github.com/advisories/GHSA-xxxx",
            "vulnerable_versions": "<4.17.21",
            "patched_versions": ">=4.17.21"
        }"#;
        let advisory: Advisory = serde_json::from_str(json).unwrap();
        assert_eq!(advisory.id, 1234);
        assert_eq!(advisory.title, "Prototype Pollution");
        assert_eq!(advisory.severity, "critical");
        assert_eq!(advisory.url, "https://github.com/advisories/GHSA-xxxx");
        assert_eq!(advisory.vulnerable_versions, "<4.17.21");
        assert_eq!(advisory.patched_versions, ">=4.17.21");
    }

    #[test]
    fn test_parse_bulk_advisory_response() {
        let json = r#"{
            "lodash": [
                {
                    "id": 1234,
                    "title": "Prototype Pollution",
                    "severity": "critical",
                    "url": "https://github.com/advisories/GHSA-xxxx",
                    "vulnerable_versions": "<4.17.21",
                    "patched_versions": ">=4.17.21"
                }
            ]
        }"#;
        let response: BTreeMap<String, Vec<Advisory>> = serde_json::from_str(json).unwrap();
        assert_eq!(response.len(), 1);
        assert!(response.contains_key("lodash"));
        assert_eq!(response["lodash"].len(), 1);
        assert_eq!(response["lodash"][0].id, 1234);
    }
}
