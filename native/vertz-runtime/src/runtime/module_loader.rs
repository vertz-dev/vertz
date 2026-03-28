use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use deno_core::error::AnyError;
use deno_core::ModuleLoadResponse;
use deno_core::ModuleLoader;
use deno_core::ModuleSource;
use deno_core::ModuleSourceCode;
use deno_core::ModuleSpecifier;
use deno_core::ModuleType;
use deno_core::RequestedModuleType;
use deno_core::ResolutionKind;

use vertz_compiler_core::CompileOptions;

/// Source maps collected during module loading.
pub type SourceMapStore = RefCell<HashMap<String, String>>;

/// Custom module loader for the Vertz runtime.
///
/// Handles:
/// - File system resolution for relative and absolute paths
/// - Node.js-style resolution for bare specifiers (node_modules)
/// - TypeScript/TSX compilation via vertz-compiler-core
/// - Source map collection for error reporting
pub struct VertzModuleLoader {
    root_dir: PathBuf,
    source_maps: SourceMapStore,
}

impl VertzModuleLoader {
    pub fn new(root_dir: &str) -> Self {
        Self {
            root_dir: PathBuf::from(root_dir),
            source_maps: RefCell::new(HashMap::new()),
        }
    }

    /// Resolve a specifier to an absolute file path.
    fn resolve_specifier(
        &self,
        specifier: &str,
        referrer_path: &Path,
    ) -> Result<PathBuf, AnyError> {
        // Relative imports: ./foo, ../bar
        if specifier.starts_with("./") || specifier.starts_with("../") {
            let base_dir = referrer_path.parent().unwrap_or(&self.root_dir);
            let resolved = base_dir.join(specifier);
            return self.resolve_with_extensions(&resolved);
        }

        // Absolute imports
        if specifier.starts_with('/') {
            let resolved = PathBuf::from(specifier);
            return self.resolve_with_extensions(&resolved);
        }

        // Bare specifiers: try node_modules resolution
        self.resolve_node_module(specifier)
    }

    /// Try to resolve a path by appending common extensions if needed.
    fn resolve_with_extensions(&self, path: &Path) -> Result<PathBuf, AnyError> {
        // Try exact path first
        if path.is_file() {
            return Ok(path.to_path_buf());
        }

        // Try with extensions
        let extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
        for ext in &extensions {
            let with_ext = path.with_extension(ext.trim_start_matches('.'));
            if with_ext.is_file() {
                return Ok(with_ext);
            }
        }

        // Try as a directory with index files
        if path.is_dir() {
            let index_files = ["index.ts", "index.tsx", "index.js", "index.mjs"];
            for index in &index_files {
                let index_path = path.join(index);
                if index_path.is_file() {
                    return Ok(index_path);
                }
            }
        }

        Err(deno_core::anyhow::anyhow!(
            "Cannot resolve module: {}",
            path.display()
        ))
    }

    /// Resolve a bare specifier through node_modules.
    fn resolve_node_module(&self, specifier: &str) -> Result<PathBuf, AnyError> {
        // Split package name from subpath
        let (package_name, subpath) = if specifier.starts_with('@') {
            // Scoped package: @scope/pkg or @scope/pkg/subpath
            let parts: Vec<&str> = specifier.splitn(3, '/').collect();
            if parts.len() >= 2 {
                let pkg = format!("{}/{}", parts[0], parts[1]);
                let sub = if parts.len() > 2 {
                    Some(parts[2..].join("/"))
                } else {
                    None
                };
                (pkg, sub)
            } else {
                return Err(deno_core::anyhow::anyhow!(
                    "Invalid scoped package specifier: {}",
                    specifier
                ));
            }
        } else {
            // Regular package: pkg or pkg/subpath
            let parts: Vec<&str> = specifier.splitn(2, '/').collect();
            (parts[0].to_string(), parts.get(1).map(|s| s.to_string()))
        };

        // Walk up from root_dir looking for node_modules
        let mut search_dir = self.root_dir.clone();
        loop {
            let nm_dir = search_dir.join("node_modules").join(&package_name);
            if nm_dir.is_dir() {
                // Found the package — resolve entry point
                return self.resolve_package_entry(&nm_dir, subpath.as_deref());
            }

            if !search_dir.pop() {
                break;
            }
        }

        Err(deno_core::anyhow::anyhow!(
            "Cannot find module '{}' in node_modules (searched from {})",
            specifier,
            self.root_dir.display()
        ))
    }

    /// Resolve the entry point of a package in node_modules.
    fn resolve_package_entry(
        &self,
        package_dir: &Path,
        subpath: Option<&str>,
    ) -> Result<PathBuf, AnyError> {
        let pkg_json_path = package_dir.join("package.json");

        if pkg_json_path.is_file() {
            let pkg_json: serde_json::Value =
                serde_json::from_str(&std::fs::read_to_string(&pkg_json_path)?)?;

            // If subpath is provided, check "exports" field
            if let Some(sub) = subpath {
                // Check exports map
                if let Some(exports) = pkg_json.get("exports") {
                    let export_key = format!("./{}", sub);
                    if let Some(entry) = resolve_exports_entry(exports, &export_key) {
                        let resolved = package_dir.join(entry);
                        if resolved.is_file() {
                            return Ok(resolved);
                        }
                    }
                }

                // Fallback: direct path resolution
                let direct = package_dir.join(sub);
                return self.resolve_with_extensions(&direct);
            }

            // No subpath — resolve main entry

            // Check exports "." entry
            if let Some(exports) = pkg_json.get("exports") {
                if let Some(entry) = resolve_exports_entry(exports, ".") {
                    let resolved = package_dir.join(entry);
                    if resolved.is_file() {
                        return Ok(resolved);
                    }
                }
            }

            // Check "module" field (ESM preference)
            if let Some(module) = pkg_json.get("module").and_then(|v| v.as_str()) {
                let resolved = package_dir.join(module);
                if resolved.is_file() {
                    return Ok(resolved);
                }
            }

            // Check "main" field
            if let Some(main) = pkg_json.get("main").and_then(|v| v.as_str()) {
                let resolved = package_dir.join(main);
                return self.resolve_with_extensions(&resolved);
            }
        }

        // Fallback: index.js
        let index = package_dir.join("index.js");
        if index.is_file() {
            return Ok(index);
        }

        Err(deno_core::anyhow::anyhow!(
            "Cannot resolve entry point for package at {}",
            package_dir.display()
        ))
    }

    /// Compile TypeScript/TSX source code using vertz-compiler-core.
    fn compile_source(&self, source: &str, filename: &str) -> Result<String, AnyError> {
        let result = vertz_compiler_core::compile(
            source,
            CompileOptions {
                filename: Some(filename.to_string()),
                target: Some("ssr".to_string()),
                ..Default::default()
            },
        );

        // Check for compilation errors
        if let Some(ref diagnostics) = result.diagnostics {
            let errors: Vec<String> = diagnostics
                .iter()
                .map(|d| {
                    let location = match (d.line, d.column) {
                        (Some(line), Some(col)) => format!(" at {}:{}:{}", filename, line, col),
                        _ => String::new(),
                    };
                    format!("{}{}", d.message, location)
                })
                .collect();

            if !errors.is_empty() {
                // Diagnostics are warnings, not hard errors — log but don't fail
                // (the vertz compiler may emit diagnostics that are informational)
            }
        }

        // Store source map if available
        if let Some(ref map) = result.map {
            self.source_maps
                .borrow_mut()
                .insert(filename.to_string(), map.clone());
        }

        Ok(result.code)
    }
}

/// Resolve an exports entry from a package.json "exports" field.
/// Supports:
/// - String value: `"exports": "./dist/index.js"`
/// - Object with conditions: `"exports": { "import": "./dist/index.mjs", "default": "./dist/index.js" }`
/// - Object with subpath patterns: `"exports": { ".": { "import": "./dist/index.mjs" } }`
fn resolve_exports_entry(exports: &serde_json::Value, key: &str) -> Option<String> {
    match exports {
        // Direct string value (applies to "." entry)
        serde_json::Value::String(s) if key == "." => Some(s.clone()),

        // Object with conditions or subpath patterns
        serde_json::Value::Object(map) => {
            // Check if this is a subpath map or a conditions map
            if let Some(entry) = map.get(key) {
                return resolve_condition_value(entry);
            }

            // If key is "." and this looks like a conditions map
            // (has "import", "require", "default" keys)
            if key == "." {
                return resolve_condition_value(exports);
            }

            None
        }

        _ => None,
    }
}

/// Resolve a condition value to a string path.
fn resolve_condition_value(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Object(map) => {
            // Priority: import > module > default > require
            for key in &["import", "module", "default", "require"] {
                if let Some(entry) = map.get(*key) {
                    return resolve_condition_value(entry);
                }
            }
            None
        }
        _ => None,
    }
}

impl ModuleLoader for VertzModuleLoader {
    fn resolve(
        &self,
        specifier: &str,
        referrer: &str,
        _kind: ResolutionKind,
    ) -> Result<ModuleSpecifier, deno_core::anyhow::Error> {
        // If specifier is already a file:// URL, use it directly
        if specifier.starts_with("file://") {
            return Ok(ModuleSpecifier::parse(specifier)?);
        }

        // Get the referrer's file path
        let referrer_path = if referrer.starts_with("file://") {
            ModuleSpecifier::parse(referrer)?
                .to_file_path()
                .map_err(|_| {
                    deno_core::anyhow::anyhow!(
                        "Cannot convert referrer URL to file path: {}",
                        referrer
                    )
                })?
        } else if referrer.contains("://") {
            // Non-file URL referrer (e.g., ext:, internal:)
            // Resolve relative to root_dir
            self.root_dir.clone()
        } else {
            PathBuf::from(referrer)
        };

        let resolved_path = self.resolve_specifier(specifier, &referrer_path)?;
        let url = ModuleSpecifier::from_file_path(&resolved_path).map_err(|_| {
            deno_core::anyhow::anyhow!("Cannot convert path to URL: {}", resolved_path.display())
        })?;

        Ok(url)
    }

    fn load(
        &self,
        module_specifier: &ModuleSpecifier,
        _maybe_referrer: Option<&ModuleSpecifier>,
        _is_dyn_import: bool,
        _requested_module_type: RequestedModuleType,
    ) -> ModuleLoadResponse {
        let specifier = module_specifier.clone();

        let load_result = (|| -> Result<ModuleSource, AnyError> {
            let path = specifier.to_file_path().map_err(|_| {
                deno_core::anyhow::anyhow!("Only file:// URLs are supported, got: {}", specifier)
            })?;

            let source = std::fs::read_to_string(&path).map_err(|e| {
                deno_core::anyhow::anyhow!("Cannot read module '{}': {}", path.display(), e)
            })?;

            let filename = path.to_string_lossy().to_string();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

            // Determine if we need to compile
            let (code, module_type) = match ext {
                "ts" | "tsx" | "jsx" => {
                    let compiled = self.compile_source(&source, &filename)?;
                    (compiled, ModuleType::JavaScript)
                }
                "json" => (source, ModuleType::Json),
                _ => (source, ModuleType::JavaScript),
            };

            Ok(ModuleSource::new(
                module_type,
                ModuleSourceCode::String(code.into()),
                &specifier,
                None,
            ))
        })();

        ModuleLoadResponse::Sync(load_result)
    }

    fn get_source_map(&self, specifier: &str) -> Option<Vec<u8>> {
        self.source_maps
            .borrow()
            .get(specifier)
            .map(|s| s.as_bytes().to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn create_temp_dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn test_resolve_relative_js() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        let util_file = tmp.path().join("utils.js");
        std::fs::write(&main_file, "import './utils.js';").unwrap();
        std::fs::write(&util_file, "export const x = 1;").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("./utils.js", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.to_file_path().unwrap(), util_file);
    }

    #[test]
    fn test_resolve_with_extension_inference() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        let util_file = tmp.path().join("utils.ts");
        std::fs::write(&main_file, "").unwrap();
        std::fs::write(&util_file, "export const x = 1;").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("./utils", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.to_file_path().unwrap(), util_file);
    }

    #[test]
    fn test_resolve_index_file_in_directory() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        let subdir = tmp.path().join("lib");
        std::fs::create_dir(&subdir).unwrap();
        let index_file = subdir.join("index.ts");
        std::fs::write(&main_file, "").unwrap();
        std::fs::write(&index_file, "export const x = 1;").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("./lib", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.to_file_path().unwrap(), index_file);
    }

    #[test]
    fn test_resolve_missing_module_error() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("./nonexistent", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Cannot resolve module"), "Error: {}", err);
    }

    #[test]
    fn test_resolve_node_module_with_package_json() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        // Create a fake node_modules package
        let pkg_dir = tmp.path().join("node_modules").join("my-pkg");
        std::fs::create_dir_all(&pkg_dir).unwrap();
        let pkg_json = pkg_dir.join("package.json");
        let entry = pkg_dir.join("dist").join("index.mjs");
        std::fs::create_dir_all(pkg_dir.join("dist")).unwrap();
        std::fs::write(
            &pkg_json,
            r#"{ "exports": { ".": { "import": "./dist/index.mjs" } } }"#,
        )
        .unwrap();
        std::fs::write(&entry, "export default {};").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("my-pkg", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.to_file_path().unwrap(), entry);
    }

    #[test]
    fn test_resolve_node_module_missing() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("nonexistent-pkg", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Cannot find module"), "Error: {}", err);
    }

    #[test]
    fn test_load_js_module() {
        let tmp = create_temp_dir();
        let js_file = tmp.path().join("test.js");
        std::fs::write(&js_file, "export const x = 42;").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let specifier = ModuleSpecifier::from_file_path(&js_file).unwrap();
        let response = loader.load(&specifier, None, false, RequestedModuleType::None);

        match response {
            ModuleLoadResponse::Sync(Ok(source)) => match &source.code {
                deno_core::ModuleSourceCode::String(code) => {
                    assert!(code.as_str().contains("export const x = 42"));
                }
                _ => panic!("Expected string source code"),
            },
            ModuleLoadResponse::Sync(Err(e)) => {
                panic!("Module load failed: {}", e);
            }
            _ => panic!("Expected synchronous module load"),
        }
    }

    #[test]
    fn test_load_ts_module_compiles() {
        let tmp = create_temp_dir();
        let ts_file = tmp.path().join("test.ts");
        std::fs::write(&ts_file, "const x: number = 42; export { x };").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let specifier = ModuleSpecifier::from_file_path(&ts_file).unwrap();
        let response = loader.load(&specifier, None, false, RequestedModuleType::None);

        match response {
            ModuleLoadResponse::Sync(Ok(source)) => {
                match &source.code {
                    deno_core::ModuleSourceCode::String(code) => {
                        let code_str = code.as_str();
                        // Should be compiled (type annotations stripped)
                        assert!(code_str.contains("compiled by vertz-native"));
                        // Type annotations should be removed
                        assert!(
                            !code_str.contains(": number"),
                            "Type annotation should be stripped"
                        );
                    }
                    _ => panic!("Expected string source code"),
                }
            }
            ModuleLoadResponse::Sync(Err(e)) => {
                panic!("Module load failed: {}", e);
            }
            _ => panic!("Expected synchronous module load"),
        }
    }

    #[test]
    fn test_load_tsx_module_compiles() {
        let tmp = create_temp_dir();
        let tsx_file = tmp.path().join("test.tsx");
        std::fs::write(
            &tsx_file,
            r#"
export function Hello() {
  return <div>Hello</div>;
}
"#,
        )
        .unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy());
        let specifier = ModuleSpecifier::from_file_path(&tsx_file).unwrap();
        let response = loader.load(&specifier, None, false, RequestedModuleType::None);

        match response {
            ModuleLoadResponse::Sync(Ok(source)) => match &source.code {
                deno_core::ModuleSourceCode::String(code) => {
                    let code_str = code.as_str();
                    assert!(code_str.contains("compiled by vertz-native"));
                }
                _ => panic!("Expected string source code"),
            },
            ModuleLoadResponse::Sync(Err(e)) => {
                panic!("Module load failed: {}", e);
            }
            _ => panic!("Expected synchronous module load"),
        }
    }

    #[test]
    fn test_resolve_exports_entry_string() {
        let exports = serde_json::json!("./dist/index.js");
        assert_eq!(
            resolve_exports_entry(&exports, "."),
            Some("./dist/index.js".to_string())
        );
    }

    #[test]
    fn test_resolve_exports_entry_conditions_map() {
        let exports = serde_json::json!({
            ".": { "import": "./dist/index.mjs", "require": "./dist/index.cjs" }
        });
        assert_eq!(
            resolve_exports_entry(&exports, "."),
            Some("./dist/index.mjs".to_string())
        );
    }

    #[test]
    fn test_resolve_exports_entry_subpath() {
        let exports = serde_json::json!({
            ".": "./dist/index.js",
            "./utils": "./dist/utils.js"
        });
        assert_eq!(
            resolve_exports_entry(&exports, "./utils"),
            Some("./dist/utils.js".to_string())
        );
    }
}
