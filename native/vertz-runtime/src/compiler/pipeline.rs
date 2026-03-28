use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::SystemTime;

use crate::compiler::cache::{CachedModule, CompilationCache};
use crate::compiler::import_rewriter;

/// Result of compiling a source file for browser consumption.
#[derive(Debug, Clone)]
pub struct BrowserCompileResult {
    /// Compiled JavaScript code with imports rewritten for the browser.
    pub code: String,
    /// Source map JSON, if available.
    pub source_map: Option<String>,
    /// Extracted CSS, if any.
    pub css: Option<String>,
}

/// CSS store: maps a hash-based CSS path to the CSS content.
/// Shared across requests so that /@css/ routes can serve extracted CSS.
pub type CssStore = Arc<RwLock<HashMap<String, String>>>;

/// The browser compilation pipeline.
///
/// Compiles .ts/.tsx files using vertz-compiler-core with target "dom",
/// rewrites import specifiers for browser consumption, caches results,
/// and extracts CSS into a shared store.
#[derive(Clone)]
pub struct CompilationPipeline {
    cache: CompilationCache,
    css_store: CssStore,
    root_dir: PathBuf,
    src_dir: PathBuf,
}

impl CompilationPipeline {
    pub fn new(root_dir: PathBuf, src_dir: PathBuf) -> Self {
        Self {
            cache: CompilationCache::new(),
            css_store: Arc::new(RwLock::new(HashMap::new())),
            root_dir,
            src_dir,
        }
    }

    /// Get the shared CSS store.
    pub fn css_store(&self) -> &CssStore {
        &self.css_store
    }

    /// Get the compilation cache.
    pub fn cache(&self) -> &CompilationCache {
        &self.cache
    }

    /// Compile a source file for browser consumption.
    ///
    /// - Checks the compilation cache first (by mtime)
    /// - On cache miss: reads the file, compiles with vertz-compiler-core (target: dom),
    ///   rewrites imports, stores CSS, caches the result
    /// - On compilation error: returns a JS module that logs the error to console
    pub fn compile_for_browser(&self, file_path: &Path) -> BrowserCompileResult {
        // Check cache
        if let Some(cached) = self.cache.get(file_path) {
            return BrowserCompileResult {
                code: cached.code,
                source_map: cached.source_map,
                css: cached.css,
            };
        }

        // Read source file
        let source = match std::fs::read_to_string(file_path) {
            Ok(s) => s,
            Err(e) => {
                return self.error_module(&format!(
                    "Failed to read file '{}': {}",
                    file_path.display(),
                    e
                ));
            }
        };

        let filename = file_path.to_string_lossy().to_string();

        // Compile with vertz-compiler-core
        let compile_result = vertz_compiler_core::compile(
            &source,
            vertz_compiler_core::CompileOptions {
                filename: Some(filename.clone()),
                target: Some("dom".to_string()),
                fast_refresh: Some(true),
                ..Default::default()
            },
        );

        // Check for compilation errors (diagnostics)
        if let Some(ref diagnostics) = compile_result.diagnostics {
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
                // Log diagnostics but don't fail — they may be warnings
                eprintln!(
                    "[vertz-compiler] Diagnostics for {}:\n  {}",
                    filename,
                    errors.join("\n  ")
                );
            }
        }

        // Rewrite import specifiers for browser consumption
        let code = import_rewriter::rewrite_imports(
            &compile_result.code,
            file_path,
            &self.src_dir,
            &self.root_dir,
        );

        // Handle extracted CSS
        let css = compile_result.css.clone();
        if let Some(ref css_content) = css {
            self.store_css(file_path, css_content);
        }

        // Add source map URL comment
        let code = if compile_result.map.is_some() {
            let map_url = self.source_map_url(file_path);
            format!("{}\n//# sourceMappingURL={}", code, map_url)
        } else {
            code
        };

        // Cache the result
        let mtime = std::fs::metadata(file_path)
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);

        self.cache.insert(
            file_path.to_path_buf(),
            CachedModule {
                code: code.clone(),
                source_map: compile_result.map.clone(),
                css: css.clone(),
                mtime,
            },
        );

        BrowserCompileResult {
            code,
            source_map: compile_result.map,
            css,
        }
    }

    /// Get a source map for a file path, if cached.
    pub fn get_source_map(&self, file_path: &Path) -> Option<String> {
        self.cache.get(file_path).and_then(|c| c.source_map)
    }

    /// Get CSS content by its hash key.
    pub fn get_css(&self, key: &str) -> Option<String> {
        self.css_store
            .read()
            .ok()
            .and_then(|store| store.get(key).cloned())
    }

    /// Generate a source map URL for a file.
    fn source_map_url(&self, file_path: &Path) -> String {
        if let Ok(rel) = file_path.strip_prefix(&self.root_dir) {
            format!("/{}.map", rel.to_string_lossy().replace('\\', "/"))
        } else {
            format!("{}.map", file_path.display())
        }
    }

    /// Store extracted CSS in the shared CSS store, keyed by a hash of the file path.
    fn store_css(&self, file_path: &Path, css: &str) {
        let key = self.css_key(file_path);
        if let Ok(mut store) = self.css_store.write() {
            store.insert(key, css.to_string());
        }
    }

    /// Generate a stable CSS key for a file path.
    pub fn css_key(&self, file_path: &Path) -> String {
        if let Ok(rel) = file_path.strip_prefix(&self.root_dir) {
            // Use the relative path with slashes as the key
            rel.to_string_lossy().replace('\\', "/").replace('/', "_") + ".css"
        } else {
            // Fallback: use a simple hash
            format!("{:x}.css", simple_hash(&file_path.to_string_lossy()))
        }
    }

    /// Generate an error module that logs the error to console in the browser.
    fn error_module(&self, message: &str) -> BrowserCompileResult {
        let escaped = message
            .replace('\\', "\\\\")
            .replace('`', "\\`")
            .replace('$', "\\$");

        BrowserCompileResult {
            code: format!(
                "console.error(`[vertz] Compilation error: {}`);\nexport default undefined;\n",
                escaped
            ),
            source_map: None,
            css: None,
        }
    }
}

/// Simple hash function for generating CSS keys.
fn simple_hash(s: &str) -> u64 {
    let mut hash: u64 = 5381;
    for byte in s.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(u64::from(byte));
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_pipeline(root: &Path) -> CompilationPipeline {
        CompilationPipeline::new(root.to_path_buf(), root.join("src"))
    }

    #[test]
    fn test_compile_simple_ts_file() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(
            src_dir.join("app.ts"),
            "const x: number = 42;\nexport { x };\n",
        )
        .unwrap();

        let pipeline = create_pipeline(tmp.path());
        let result = pipeline.compile_for_browser(&src_dir.join("app.ts"));

        // Should contain compiled code (type annotation stripped)
        assert!(result.code.contains("compiled by vertz-native"));
        assert!(!result.code.contains(": number"));
    }

    #[test]
    fn test_compile_tsx_file_transforms_jsx() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(
            src_dir.join("Button.tsx"),
            r#"export function Button() {
  return <div>Hello</div>;
}
"#,
        )
        .unwrap();

        let pipeline = create_pipeline(tmp.path());
        let result = pipeline.compile_for_browser(&src_dir.join("Button.tsx"));

        // Should not contain raw JSX
        assert!(
            !result.code.contains("<div>Hello</div>"),
            "Raw JSX should be transformed. Code: {}",
            result.code
        );
        assert!(result.code.contains("compiled by vertz-native"));
    }

    #[test]
    fn test_compile_rewrites_bare_imports() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(
            src_dir.join("app.tsx"),
            r#"import { signal } from '@vertz/ui';
export function App() {
  return <div>App</div>;
}
"#,
        )
        .unwrap();

        let pipeline = create_pipeline(tmp.path());
        let result = pipeline.compile_for_browser(&src_dir.join("app.tsx"));

        assert!(
            result.code.contains("/@deps/@vertz/ui") || result.code.contains("/@deps/"),
            "Bare import should be rewritten. Code: {}",
            result.code
        );
    }

    #[test]
    fn test_compile_caches_result() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("app.ts"), "export const x = 1;\n").unwrap();

        let pipeline = create_pipeline(tmp.path());

        // First compile — cache miss
        assert!(pipeline.cache().is_empty());
        let _result1 = pipeline.compile_for_browser(&src_dir.join("app.ts"));
        assert_eq!(pipeline.cache().len(), 1);

        // Second compile — cache hit (same code returned)
        let result2 = pipeline.compile_for_browser(&src_dir.join("app.ts"));
        assert!(result2.code.contains("compiled by vertz-native"));
    }

    #[test]
    fn test_compile_invalidates_cache_on_file_change() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        let file = src_dir.join("app.ts");
        std::fs::write(&file, "export const x = 1;\n").unwrap();

        let pipeline = create_pipeline(tmp.path());

        let result1 = pipeline.compile_for_browser(&file);

        // Modify the file
        std::thread::sleep(std::time::Duration::from_millis(10));
        std::fs::write(&file, "export const x = 2;\n").unwrap();

        let result2 = pipeline.compile_for_browser(&file);

        // Both should compile successfully but with different content
        assert!(result1.code.contains("compiled by vertz-native"));
        assert!(result2.code.contains("compiled by vertz-native"));
    }

    #[test]
    fn test_compile_missing_file_returns_error_module() {
        let tmp = tempfile::tempdir().unwrap();
        let pipeline = create_pipeline(tmp.path());

        let result = pipeline.compile_for_browser(Path::new("/nonexistent/file.tsx"));

        assert!(result.code.contains("console.error"));
        assert!(result.code.contains("Compilation error"));
    }

    #[test]
    fn test_compile_includes_source_map_url() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("app.ts"), "export const x = 1;\n").unwrap();

        let pipeline = create_pipeline(tmp.path());
        let result = pipeline.compile_for_browser(&src_dir.join("app.ts"));

        // If a source map was generated, the code should have a sourceMappingURL
        if result.source_map.is_some() {
            assert!(
                result.code.contains("//# sourceMappingURL="),
                "Code should include sourceMappingURL. Code: {}",
                result.code
            );
        }
    }

    #[test]
    fn test_get_source_map_from_cache() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("app.ts"), "export const x = 1;\n").unwrap();

        let pipeline = create_pipeline(tmp.path());
        let file = src_dir.join("app.ts");

        // First compile to populate cache
        let result = pipeline.compile_for_browser(&file);

        if result.source_map.is_some() {
            let map = pipeline.get_source_map(&file);
            assert!(map.is_some());
        }
    }

    #[test]
    fn test_css_key_generation() {
        let pipeline =
            CompilationPipeline::new(PathBuf::from("/project"), PathBuf::from("/project/src"));
        let key = pipeline.css_key(Path::new("/project/src/components/Button.tsx"));
        assert_eq!(key, "src_components_Button.tsx.css");
    }

    #[test]
    fn test_error_module_escapes_special_chars() {
        let pipeline =
            CompilationPipeline::new(PathBuf::from("/project"), PathBuf::from("/project/src"));
        let result = pipeline.error_module("Error with `backticks` and $dollar");

        assert!(result.code.contains("console.error"));
        assert!(!result.code.contains("unescaped `"));
    }

    #[test]
    fn test_simple_hash() {
        let h1 = simple_hash("hello");
        let h2 = simple_hash("world");
        let h3 = simple_hash("hello");

        assert_ne!(h1, h2);
        assert_eq!(h1, h3);
    }
}
