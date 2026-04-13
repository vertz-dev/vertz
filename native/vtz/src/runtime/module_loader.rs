use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
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

use crate::plugin::{CompileContext, FrameworkPlugin};
use crate::runtime::compile_cache::{
    CachedCompilation, CompileCache, SharedResolutionCache, SharedSourceCache, V8CodeCache,
};

/// Source maps collected during module loading.
pub type SourceMapStore = RefCell<HashMap<String, String>>;

/// Newline byte-offset indices collected during module loading.
/// Each entry maps a filename to the byte offsets of newline characters in the compiled code.
/// Used by coverage to convert V8 byte offsets to (line, column) pairs.
pub type NewlineIndexStore = RefCell<HashMap<String, Vec<u32>>>;

/// Build a newline byte-offset index from source code.
///
/// Returns a `Vec<u32>` where each entry is the byte offset of a `\n` character.
/// Used to convert V8 coverage byte offsets into (line, column) positions.
pub fn build_newline_index(code: &str) -> Vec<u32> {
    code.bytes()
        .enumerate()
        .filter(|(_, b)| *b == b'\n')
        .map(|(i, _)| i as u32)
        .collect()
}

/// Prefix used in "missing module" error messages from `resolve_node_module`.
///
/// Shared with `persistent_isolate::parse_missing_package()` to detect
/// auto-installable errors. If you change this format, update the parser too.
pub const MISSING_MODULE_PREFIX: &str = "Cannot find module '";

/// Suffix that follows the specifier in "missing module" error messages.
pub const MISSING_MODULE_SUFFIX: &str = "' in node_modules";

/// Custom module loader for the Vertz runtime.
///
/// Handles:
/// - File system resolution for relative and absolute paths
/// - Node.js-style resolution for bare specifiers (node_modules)
/// - TypeScript/TSX compilation via the framework plugin
/// - Source map collection for error reporting
/// - URL canonicalization to ensure same physical file = same module identity
/// - Compilation caching (disk-backed, content-hash-keyed)
pub struct VertzModuleLoader {
    root_dir: PathBuf,
    source_maps: SourceMapStore,
    newline_indices: NewlineIndexStore,
    canon_cache: RefCell<HashMap<PathBuf, PathBuf>>,
    compile_cache: CompileCache,
    plugin: std::sync::Arc<dyn FrameworkPlugin>,
    /// Canonical paths of modules that should be intercepted with mock proxies.
    /// Key: canonical file path, Value: raw specifier (for `globalThis.__vertz_mocked_modules` lookup).
    mocked_paths: RefCell<HashMap<PathBuf, String>>,
    shared_source_cache: Option<std::sync::Arc<SharedSourceCache>>,
    v8_code_cache: Option<std::sync::Arc<V8CodeCache>>,
    resolution_cache: Option<std::sync::Arc<SharedResolutionCache>>,
    /// Cache for package.json "type" field lookups.
    /// Key: directory path, Value: `true` if the directory has a package.json with `"type": "module"`.
    /// Missing key means "not yet checked".
    pkg_type_cache: RefCell<HashMap<PathBuf, Option<bool>>>,
}

impl VertzModuleLoader {
    pub fn new(root_dir: &str, plugin: std::sync::Arc<dyn FrameworkPlugin>) -> Self {
        Self {
            root_dir: PathBuf::from(root_dir),
            source_maps: RefCell::new(HashMap::new()),
            newline_indices: RefCell::new(HashMap::new()),
            canon_cache: RefCell::new(HashMap::new()),
            compile_cache: CompileCache::new(Path::new(root_dir), false),
            plugin,
            mocked_paths: RefCell::new(HashMap::new()),
            shared_source_cache: None,
            v8_code_cache: None,
            resolution_cache: None,
            pkg_type_cache: RefCell::new(HashMap::new()),
        }
    }

    /// Create a new module loader with compilation caching enabled.
    pub fn new_with_cache(
        root_dir: &str,
        cache_enabled: bool,
        plugin: std::sync::Arc<dyn FrameworkPlugin>,
    ) -> Self {
        Self {
            root_dir: PathBuf::from(root_dir),
            source_maps: RefCell::new(HashMap::new()),
            newline_indices: RefCell::new(HashMap::new()),
            canon_cache: RefCell::new(HashMap::new()),
            compile_cache: CompileCache::new(Path::new(root_dir), cache_enabled),
            plugin,
            mocked_paths: RefCell::new(HashMap::new()),
            shared_source_cache: None,
            v8_code_cache: None,
            resolution_cache: None,
            pkg_type_cache: RefCell::new(HashMap::new()),
        }
    }

    /// Create a new module loader with disk caching and shared in-memory source
    /// cache for cross-isolate deduplication.
    pub fn new_with_shared_cache(
        root_dir: &str,
        cache_enabled: bool,
        plugin: std::sync::Arc<dyn FrameworkPlugin>,
        shared_source_cache: Option<std::sync::Arc<SharedSourceCache>>,
        v8_code_cache: Option<std::sync::Arc<V8CodeCache>>,
        resolution_cache: Option<std::sync::Arc<SharedResolutionCache>>,
    ) -> Self {
        Self {
            root_dir: PathBuf::from(root_dir),
            source_maps: RefCell::new(HashMap::new()),
            canon_cache: RefCell::new(HashMap::new()),
            compile_cache: CompileCache::new(Path::new(root_dir), cache_enabled),
            plugin,
            mocked_paths: RefCell::new(HashMap::new()),
            newline_indices: RefCell::new(HashMap::new()),
            shared_source_cache,
            v8_code_cache,
            resolution_cache,
            pkg_type_cache: RefCell::new(HashMap::new()),
        }
    }

    /// Register modules that should be mocked (transitive mocking).
    ///
    /// Resolves each specifier relative to the test file to get the canonical
    /// file path, then stores it so `resolve()` can redirect to a proxy module.
    pub fn register_mocked_specifiers(
        &self,
        specifiers: &std::collections::HashSet<String>,
        test_file_path: &Path,
    ) {
        for specifier in specifiers {
            match self.resolve_specifier(specifier, test_file_path) {
                Ok(resolved) => {
                    let canonical = self.canonicalize_cached(&resolved);
                    self.mocked_paths
                        .borrow_mut()
                        .insert(canonical, specifier.clone());
                }
                Err(e) => {
                    // Resolution failed (including node_modules lookup).
                    // The mock won't intercept transitive imports of this specifier.
                    eprintln!(
                        "[vtz:mock] Warning: could not resolve mocked specifier '{}' from {}: {}",
                        specifier,
                        test_file_path.display(),
                        e
                    );
                }
            }
        }
    }

    /// Compile a test file and return the CompileOutput (for mock preamble extraction).
    pub fn compile_for_mock_extraction(
        &self,
        source: &str,
        filename: &str,
    ) -> crate::plugin::CompileOutput {
        let file_path = Path::new(filename);
        let src_dir = self.root_dir.join("src");
        let ctx = CompileContext {
            file_path,
            root_dir: &self.root_dir,
            src_dir: &src_dir,
            target: "ssr",
        };
        self.plugin.compile(source, &ctx)
    }

    /// Return a clone of the collected source maps (filename → source map JSON).
    pub fn source_maps_snapshot(&self) -> HashMap<String, String> {
        self.source_maps.borrow().clone()
    }

    /// Return a clone of the collected newline indices (filename → newline byte offsets).
    pub fn newline_indices_snapshot(&self) -> HashMap<String, Vec<u32>> {
        self.newline_indices.borrow().clone()
    }

    /// Canonicalize a file path, using a cache to avoid repeated syscalls.
    /// Falls back to the original path if canonicalization fails (e.g., broken symlink).
    fn canonicalize_cached(&self, path: &Path) -> PathBuf {
        if let Some(cached) = self.canon_cache.borrow().get(path) {
            return cached.clone();
        }
        let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        self.canon_cache
            .borrow_mut()
            .insert(path.to_path_buf(), canonical.clone());
        canonical
    }

    /// Resolve a specifier to an absolute file path.
    fn resolve_specifier(
        &self,
        specifier: &str,
        referrer_path: &Path,
    ) -> Result<PathBuf, AnyError> {
        // Relative imports: ./foo, ../bar, bare "." or ".."
        if specifier.starts_with("./")
            || specifier.starts_with("../")
            || specifier == "."
            || specifier == ".."
        {
            let base_dir = referrer_path.parent().unwrap_or(&self.root_dir);
            let resolved = base_dir.join(specifier);
            return self.resolve_with_extensions(&resolved);
        }

        // Absolute imports
        if specifier.starts_with('/') {
            let resolved = PathBuf::from(specifier);
            return self.resolve_with_extensions(&resolved);
        }

        // Package imports (#foo): resolve via nearest package.json "imports" field
        if specifier.starts_with('#') {
            let referrer_dir = referrer_path.parent().unwrap_or(&self.root_dir);
            return self.resolve_package_imports(specifier, referrer_dir);
        }

        // Bare specifiers: try node_modules resolution starting from referrer
        let referrer_dir = referrer_path.parent().unwrap_or(&self.root_dir);
        self.resolve_node_module(specifier, referrer_dir)
    }

    /// Try to resolve a path by appending common extensions if needed.
    fn resolve_with_extensions(&self, path: &Path) -> Result<PathBuf, AnyError> {
        // Try exact path first
        if path.is_file() {
            return Ok(path.to_path_buf());
        }

        // Try appending extensions (e.g., foo.service -> foo.service.ts)
        let extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs"];
        for ext in &extensions {
            let appended = PathBuf::from(format!("{}{}", path.display(), ext));
            if appended.is_file() {
                return Ok(appended);
            }
        }

        // Try replacing extension (e.g., foo -> foo.ts)
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

    /// Resolve a `#`-prefixed specifier via the nearest package.json `imports` field.
    ///
    /// Walks up from `start_dir` looking for a `package.json` that has an `imports`
    /// field containing the specifier. Supports:
    /// - String values: `"#foo": "./src/foo.ts"`
    /// - Condition maps: `"#foo": { "import": "./src/foo.ts", "default": "./src/foo.js" }`
    fn resolve_package_imports(
        &self,
        specifier: &str,
        start_dir: &Path,
    ) -> Result<PathBuf, AnyError> {
        let mut search_dir = start_dir.to_path_buf();
        loop {
            let pkg_json_path = search_dir.join("package.json");
            if pkg_json_path.is_file() {
                if let Ok(content) = std::fs::read_to_string(&pkg_json_path) {
                    if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(imports) = pkg.get("imports").and_then(|v| v.as_object()) {
                            if let Some(mapping) = imports.get(specifier) {
                                let resolved = resolve_imports_mapping(mapping);
                                if let Some(target) = resolved {
                                    let abs_path = search_dir.join(target);
                                    return self.resolve_with_extensions(&abs_path);
                                }
                            }
                        }
                    }
                }
            }

            if !search_dir.pop() {
                break;
            }
        }

        Err(deno_core::anyhow::anyhow!(
            "Cannot resolve package import '{}' — no package.json with matching \"imports\" field found",
            specifier
        ))
    }

    /// Resolve a bare specifier through node_modules.
    ///
    /// Searches from `start_dir` upward (Node.js-style resolution), then falls
    /// back to Bun's `.bun/node_modules/` cache directory.
    fn resolve_node_module(&self, specifier: &str, start_dir: &Path) -> Result<PathBuf, AnyError> {
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

        // Check for self-referencing import (e.g., @vertz/ui imported from within packages/ui/)
        if let Some(resolved) =
            self.try_resolve_self_reference(&package_name, subpath.as_deref(), start_dir)?
        {
            return Ok(resolved);
        }

        // Walk up from referrer's directory looking for node_modules (Node.js-style)
        let mut search_dir = start_dir.to_path_buf();
        loop {
            let nm_dir = search_dir.join("node_modules").join(&package_name);
            if nm_dir.is_symlink() {
                // Follow symlinks (Bun creates symlinks in workspace packages)
                match nm_dir.canonicalize() {
                    Ok(canonical) => {
                        match self.resolve_package_entry(&canonical, subpath.as_deref()) {
                            Ok(resolved) => return Ok(resolved),
                            Err(_) => {
                                // Dist not built — try source fallback for workspace packages
                                let pkg_json_path = canonical.join("package.json");
                                if pkg_json_path.is_file() {
                                    if let Ok(content) = std::fs::read_to_string(&pkg_json_path) {
                                        if let Ok(pkg) =
                                            serde_json::from_str::<serde_json::Value>(&content)
                                        {
                                            if let Ok(resolved) = self
                                                .resolve_self_reference_source(
                                                    &canonical,
                                                    &pkg,
                                                    subpath.as_deref(),
                                                )
                                            {
                                                return Ok(resolved);
                                            }
                                        }
                                    }
                                }
                                // Continue searching up the tree
                                if !search_dir.pop() {
                                    break;
                                }
                                continue;
                            }
                        }
                    }
                    Err(_) => {
                        // Broken symlink — continue searching up the tree
                        if !search_dir.pop() {
                            break;
                        }
                        continue;
                    }
                }
            }
            if nm_dir.is_dir() {
                return self.resolve_package_entry(&nm_dir, subpath.as_deref());
            }

            if !search_dir.pop() {
                break;
            }
        }

        // Fallback: check Bun's internal cache directory (node_modules/.bun/node_modules/)
        let mut search_dir = self.root_dir.clone();
        loop {
            let bun_cache = search_dir
                .join("node_modules")
                .join(".bun")
                .join("node_modules")
                .join(&package_name);
            if bun_cache.is_dir() {
                return self.resolve_package_entry(&bun_cache, subpath.as_deref());
            }

            if !search_dir.pop() {
                break;
            }
        }

        Err(deno_core::anyhow::anyhow!(
            "{}{}{} (searched from {})",
            MISSING_MODULE_PREFIX,
            specifier,
            MISSING_MODULE_SUFFIX,
            start_dir.display()
        ))
    }

    /// Detect and resolve self-referencing package imports.
    ///
    /// Walks up from `start_dir` looking for a `package.json` whose `name` matches
    /// `package_name`. If found, resolves the entry point — preferring dist/ if it
    /// exists, otherwise mapping the exports path to source files.
    fn try_resolve_self_reference(
        &self,
        package_name: &str,
        subpath: Option<&str>,
        start_dir: &Path,
    ) -> Result<Option<PathBuf>, AnyError> {
        let mut search_dir = start_dir.to_path_buf();
        loop {
            let pkg_json_path = search_dir.join("package.json");
            if pkg_json_path.is_file() {
                if let Ok(content) = std::fs::read_to_string(&pkg_json_path) {
                    if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(name) = pkg.get("name").and_then(|v| v.as_str()) {
                            if name == package_name {
                                // Self-reference detected — try dist first, then source
                                if let Ok(resolved) =
                                    self.resolve_package_entry(&search_dir, subpath)
                                {
                                    return Ok(Some(resolved));
                                }
                                return self
                                    .resolve_self_reference_source(&search_dir, &pkg, subpath)
                                    .map(Some);
                            }
                        }
                    }
                }
            }
            if !search_dir.pop() {
                break;
            }
        }
        Ok(None)
    }

    /// Resolve a self-referencing import to source files when dist/ doesn't exist.
    ///
    /// Uses the `exports` field to find the dist path, strips the `dist/` prefix,
    /// and resolves the resulting source path with extension inference.
    fn resolve_self_reference_source(
        &self,
        pkg_dir: &Path,
        pkg: &serde_json::Value,
        subpath: Option<&str>,
    ) -> Result<PathBuf, AnyError> {
        let export_key = match subpath {
            Some(sub) => format!("./{}", sub),
            None => ".".to_string(),
        };

        // Try to map the exports path to a source path
        if let Some(exports) = pkg.get("exports") {
            if let Some(entry) = resolve_exports_entry(exports, &export_key) {
                let trimmed = entry.trim_start_matches("./");
                // Strip dist/ prefix to get source-relative path
                if let Some(source_rel) = trimmed.strip_prefix("dist/") {
                    let source_candidate = pkg_dir.join(source_rel);
                    if let Ok(resolved) = self.resolve_with_extensions(&source_candidate) {
                        return Ok(resolved);
                    }
                }
            }
        }

        // Last resort: resolve directly under src/
        let src_target = match subpath {
            Some(sub) => pkg_dir.join("src").join(sub),
            None => pkg_dir.join("src").join("index"),
        };
        if let Ok(resolved) = self.resolve_with_extensions(&src_target) {
            return Ok(resolved);
        }

        let display_specifier = match subpath {
            Some(sub) => format!(
                "{}/{}",
                pkg.get("name").and_then(|v| v.as_str()).unwrap_or("?"),
                sub
            ),
            None => pkg
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("?")
                .to_string(),
        };
        Err(deno_core::anyhow::anyhow!(
            "Cannot resolve self-reference '{}' in package at {}",
            display_specifier,
            pkg_dir.display()
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

    /// Prepend a CSS injection call to compiled JS code.
    ///
    /// If CSS was extracted by the compiler, this wraps it in a
    /// `__vertz_inject_css()` call so the SSR renderer can collect styles.
    fn prepend_css_injection(code: String, css: Option<&str>, filename: &str) -> String {
        match css {
            Some(css) => {
                let escaped = css
                    .replace('\\', "\\\\")
                    .replace('`', "\\`")
                    .replace("${", "\\${");
                format!(
                    "if (typeof __vertz_inject_css === 'function') {{ __vertz_inject_css(`{}`, '{}'); }}\n{}",
                    escaped,
                    filename.replace('\\', "/"),
                    code
                )
            }
            None => code,
        }
    }

    /// Compile TypeScript/TSX source code using the framework plugin.
    ///
    /// Checks the disk-backed compilation cache first. On cache hit, skips
    /// the compiler entirely and returns the cached result. On cache miss,
    /// compiles via the plugin, post-processes, caches the result, and returns.
    fn compile_source(&self, source: &str, filename: &str) -> Result<String, AnyError> {
        let target = "ssr";
        let is_test = crate::test::is_test_file(Path::new(filename));
        let options_hash = format!(
            "css:{},mock:{}",
            is_test as u8, // skip_css_transform
            is_test as u8, // mock_hoisting
        );
        let file_path = PathBuf::from(filename);

        // 1. Check in-memory shared cache first (fastest — no disk I/O)
        if let Some(ref shared) = self.shared_source_cache {
            if let Some(cached) = shared.get(&file_path) {
                if let Some(ref map) = cached.source_map {
                    self.source_maps
                        .borrow_mut()
                        .insert(filename.to_string(), map.clone());
                }
                let final_code = Self::prepend_css_injection(
                    cached.code.clone(),
                    cached.css.as_deref(),
                    filename,
                );
                self.newline_indices
                    .borrow_mut()
                    .insert(filename.to_string(), build_newline_index(&final_code));
                return Ok(final_code);
            }
        }

        // 2. Check disk compilation cache
        if let Some(cached) = self.compile_cache.get(source, target, &options_hash) {
            // Restore source map from cache
            if let Some(ref map) = cached.source_map {
                self.source_maps
                    .borrow_mut()
                    .insert(filename.to_string(), map.clone());
            }
            // Store in shared cache for subsequent isolates
            if let Some(ref shared) = self.shared_source_cache {
                shared.insert(
                    file_path,
                    std::sync::Arc::new(CachedCompilation {
                        code: cached.code.clone(),
                        source_map: cached.source_map.clone(),
                        css: cached.css.clone(),
                    }),
                );
            }
            // Build the final code V8 will see (with CSS injection prepended)
            let final_code =
                Self::prepend_css_injection(cached.code, cached.css.as_deref(), filename);
            // Store newline index from final code (what V8 sees) for coverage byte-offset → line
            self.newline_indices
                .borrow_mut()
                .insert(filename.to_string(), build_newline_index(&final_code));
            return Ok(final_code);
        }

        // 3. Full compilation
        let src_dir = self.root_dir.join("src");
        let ctx = CompileContext {
            file_path: &file_path,
            root_dir: &self.root_dir,
            src_dir: &src_dir,
            target,
        };

        let output = self.plugin.compile(source, &ctx);

        // Check for compilation diagnostics
        if !output.diagnostics.is_empty() {
            let errors: Vec<String> = output
                .diagnostics
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
                // (the compiler may emit diagnostics that are informational)
            }
        }

        // Store source map if available
        if let Some(ref map) = output.source_map {
            self.source_maps
                .borrow_mut()
                .insert(filename.to_string(), map.clone());
        }

        // Apply plugin post-processing (framework-specific fixups)
        let code = self.plugin.post_process(&output.code, &ctx);

        // Cache the compilation result on disk (code + source map + CSS)
        self.compile_cache.put(
            source,
            target,
            &options_hash,
            &CachedCompilation {
                code: code.clone(),
                source_map: output.source_map.clone(),
                css: output.css.clone(),
            },
        );

        // Store in shared cache for subsequent isolates
        if let Some(ref shared) = self.shared_source_cache {
            shared.insert(
                file_path,
                std::sync::Arc::new(CachedCompilation {
                    code: code.clone(),
                    source_map: output.source_map.clone(),
                    css: output.css.clone(),
                }),
            );
        }

        // Build the final code V8 will see (with CSS injection prepended)
        let final_code = Self::prepend_css_injection(code, output.css.as_deref(), filename);

        // Store newline index from final code (what V8 sees) for coverage byte-offset → line
        self.newline_indices
            .borrow_mut()
            .insert(filename.to_string(), build_newline_index(&final_code));

        Ok(final_code)
    }
}

/// Check whether a `.js` file should be loaded as CommonJS.
///
/// Follows Node.js semantics:
/// - `.cjs` → always CJS
/// - `.mjs` → always ESM
/// - `.js` → CJS unless the nearest `package.json` has `"type": "module"`
///
/// Additionally, if no `package.json` is found (e.g. temp directories), falls
/// back to source-level heuristic: files with ESM syntax are treated as ESM.
/// Determine whether the given file is a CommonJS module.
///
/// When `cache` is provided, the result of package.json "type" field lookups is
/// memoized per directory so repeated loads from the same package avoid redundant
/// filesystem reads.
fn is_cjs_module_cached(
    path: &Path,
    source: &str,
    cache: Option<&RefCell<HashMap<PathBuf, Option<bool>>>>,
) -> bool {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    match ext {
        "cjs" => true,
        "mjs" => false,
        "js" => {
            let mut dir = path.parent();
            while let Some(d) = dir {
                // Check cache first
                if let Some(c) = cache {
                    if let Some(cached) = c.borrow().get(d).copied() {
                        // cached == Some(true) means "type":"module", Some(false) means CJS,
                        // None means "no package.json here, keep walking up"
                        match cached {
                            Some(is_esm) => return !is_esm,
                            None => {
                                dir = d.parent();
                                continue;
                            }
                        }
                    }
                }

                let pkg_json = d.join("package.json");
                if pkg_json.is_file() {
                    let is_esm = if let Ok(content) = std::fs::read_to_string(&pkg_json) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            json.get("type").and_then(|v| v.as_str()) == Some("module")
                        } else {
                            false // Unparseable → default CJS
                        }
                    } else {
                        false // Unreadable → default CJS
                    };

                    if let Some(c) = cache {
                        c.borrow_mut().insert(d.to_path_buf(), Some(is_esm));
                    }
                    return !is_esm;
                }

                // No package.json in this directory
                if let Some(c) = cache {
                    c.borrow_mut().insert(d.to_path_buf(), None);
                }
                dir = d.parent();
            }
            // No package.json found — use source-level heuristic
            !has_esm_syntax(source)
        }
        _ => false,
    }
}

/// Quick heuristic: check if source contains ESM export/import syntax.
///
/// Looks for `export ` or `import ` at the start of a line (after optional
/// whitespace), skipping block comments. This is intentionally simple — it
/// doesn't parse strings, but it's enough to avoid wrapping obvious ESM files.
fn has_esm_syntax(source: &str) -> bool {
    let mut in_block_comment = false;
    for line in source.lines() {
        let trimmed = line.trim();

        // Track block comment state
        if in_block_comment {
            if let Some(pos) = trimmed.find("*/") {
                // Block comment ends — check the rest of this line
                let rest = trimmed[pos + 2..].trim();
                in_block_comment = false;
                if is_esm_line(rest) {
                    return true;
                }
            }
            continue;
        }

        // Skip single-line comments
        if trimmed.starts_with("//") {
            continue;
        }

        // Check for block comment start
        if trimmed.starts_with("/*") {
            if let Some(end_pos) = trimmed.find("*/") {
                // Inline block comment — check the rest of the line
                let rest = trimmed[end_pos + 2..].trim();
                if is_esm_line(rest) {
                    return true;
                }
            } else {
                in_block_comment = true;
            }
            continue;
        }

        if is_esm_line(trimmed) {
            return true;
        }
    }
    false
}

/// Check if a trimmed line starts with ESM syntax.
fn is_esm_line(trimmed: &str) -> bool {
    trimmed.starts_with("export ")
        || trimmed.starts_with("export{")
        || trimmed.starts_with("import ")
        || trimmed.starts_with("import{")
        || trimmed.starts_with("import(")
}

/// Extract named export identifiers from CJS source code.
///
/// Handles two patterns:
/// 1. `module.exports = { foo, bar: val }` — single top-level object literal assignment
/// 2. `exports.foo = ...` — individual property assignments
///
/// Returns an empty `Vec` when the export shape is dynamic (conditional assignments,
/// non-object `module.exports`, etc.).
fn extract_cjs_named_exports(source: &str) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();

    // Count how many times `module.exports = <value>` appears.
    // Excludes `module.exports.prop = ...` (property assignment)
    // and `module.exports === ...` / `module.exports == ...` (comparisons).
    // If more than one reassignment, it's dynamic — bail out.
    let me_assignments: Vec<&str> = source
        .lines()
        .map(|l| l.trim())
        .filter(|l| is_module_exports_assignment(l))
        .collect();

    if me_assignments.len() == 1 {
        let line = me_assignments[0];
        // Find the `= { ... }` part — may span multiple lines.
        if let Some(eq_idx) = find_assignment_eq(line) {
            let rhs = line[eq_idx + 1..].trim();
            if rhs.starts_with('{') {
                // Single-line: module.exports = { foo, bar: val };
                // Extract keys from the object literal.
                let obj_src = extract_object_body(source);
                if let Some(body) = obj_src {
                    parse_object_keys(&body, &mut names);
                }
            }
            // Non-object RHS (e.g., `module.exports = 42;`) → empty
        }
    } else if me_assignments.is_empty() {
        // Check for `exports.name = ...` or `module.exports.name = ...` patterns
        for line in source.lines() {
            let trimmed = line.trim();
            // `exports.name = ...`
            let rest = trimmed
                .strip_prefix("exports.")
                .or_else(|| trimmed.strip_prefix("module.exports."));
            if let Some(rest) = rest {
                if let Some(name) = rest.split(&['=', ' ', '('][..]).next() {
                    let name = name.trim();
                    if !name.is_empty() && name != "default" && is_valid_js_ident(name) {
                        names.push(name.to_string());
                    }
                }
            }
        }
    }
    // Multiple `module.exports =` assignments → dynamic, return empty

    names.sort();
    names.dedup();
    names
}

/// Check if a line is a `module.exports = <value>` assignment (not a comparison
/// or property assignment like `module.exports.foo = ...`).
fn is_module_exports_assignment(line: &str) -> bool {
    // Must start with exactly `module.exports` followed by optional whitespace then `=`
    let rest = match line.strip_prefix("module.exports") {
        Some(r) => r,
        None => return false,
    };
    // Exclude `module.exports.prop = ...`
    if rest.starts_with('.') {
        return false;
    }
    // Find the `=` sign
    let rest = rest.trim_start();
    if !rest.starts_with('=') {
        return false;
    }
    // Exclude `==` and `===`
    let after_eq = &rest[1..];
    !after_eq.starts_with('=')
}

/// Find the position of the assignment `=` in a `module.exports = ...` line,
/// skipping `==` and `===`.
fn find_assignment_eq(line: &str) -> Option<usize> {
    let mut i = 0;
    let bytes = line.as_bytes();
    while i < bytes.len() {
        if bytes[i] == b'=' {
            // Skip `===` and `==`
            if i + 1 < bytes.len() && bytes[i + 1] == b'=' {
                i += if i + 2 < bytes.len() && bytes[i + 2] == b'=' {
                    3
                } else {
                    2
                };
                continue;
            }
            return Some(i);
        }
        i += 1;
    }
    None
}

/// Extract the body of the object literal from `module.exports = { ... }`,
/// handling multi-line cases.
fn extract_object_body(source: &str) -> Option<String> {
    let mut collecting = false;
    let mut depth = 0i32;
    let mut body = String::new();

    for line in source.lines() {
        let trimmed = line.trim();
        if !collecting {
            if is_module_exports_assignment(trimmed) {
                if let Some(eq_idx) = find_assignment_eq(trimmed) {
                    let rhs = &trimmed[eq_idx + 1..];
                    collecting = true;
                    // Process this line's content
                    for ch in rhs.chars() {
                        if ch == '{' {
                            depth += 1;
                            if depth == 1 {
                                continue; // skip opening brace
                            }
                        } else if ch == '}' {
                            depth -= 1;
                            if depth == 0 {
                                return Some(body);
                            }
                        }
                        if depth >= 1 {
                            body.push(ch);
                        }
                    }
                }
            }
        } else {
            for ch in trimmed.chars() {
                if ch == '{' {
                    depth += 1;
                } else if ch == '}' {
                    depth -= 1;
                    if depth == 0 {
                        return Some(body);
                    }
                }
                if depth >= 1 {
                    body.push(ch);
                }
            }
            // Add a comma between lines for easier parsing
            body.push(',');
        }
    }
    None
}

/// Parse object keys from the body between `{ }`.
///
/// Only splits on commas at brace depth 0 so nested objects
/// (e.g., `foo: { a: 1, b: 2 }, bar`) don't produce spurious keys.
fn parse_object_keys(body: &str, names: &mut Vec<String>) {
    // Split on commas respecting brace depth
    let parts = split_top_level_commas(body);
    for part in &parts {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        // `key: value` or just `key` (shorthand)
        // Find the first `:` at depth 0
        let key = if let Some(colon_idx) = find_top_level_colon(part) {
            part[..colon_idx].trim()
        } else {
            part.trim_end_matches(';')
        };
        let key = unquote(key.trim());
        if !key.is_empty() && key != "default" && is_valid_js_ident(&key) {
            names.push(key.into_owned());
        }
    }
}

/// Split a string on commas, but only at brace/bracket depth 0.
fn split_top_level_commas(s: &str) -> Vec<&str> {
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut start = 0;
    for (i, ch) in s.char_indices() {
        match ch {
            '{' | '[' | '(' => depth += 1,
            '}' | ']' | ')' => depth -= 1,
            ',' if depth == 0 => {
                parts.push(&s[start..i]);
                start = i + 1;
            }
            _ => {}
        }
    }
    if start < s.len() {
        parts.push(&s[start..]);
    }
    parts
}

/// Find the first `:` that is not inside nested braces/brackets.
fn find_top_level_colon(s: &str) -> Option<usize> {
    let mut depth = 0i32;
    for (i, ch) in s.char_indices() {
        match ch {
            '{' | '[' | '(' => depth += 1,
            '}' | ']' | ')' => depth -= 1,
            ':' if depth == 0 => return Some(i),
            _ => {}
        }
    }
    None
}

/// Strip surrounding quotes (`"` or `'`) from a string key.
fn unquote(s: &str) -> std::borrow::Cow<'_, str> {
    if s.len() >= 2 {
        let first = s.as_bytes()[0];
        let last = s.as_bytes()[s.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return std::borrow::Cow::Borrowed(&s[1..s.len() - 1]);
        }
    }
    std::borrow::Cow::Borrowed(s)
}

/// Check if a string is a valid JS identifier (simplified).
fn is_valid_js_ident(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' || c == '$' => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
}

/// Wrap CommonJS source code into an ESM module.
///
/// The wrapper provides `module`, `exports`, `require`, `__filename`, `__dirname`
/// bindings and exports `module.exports` as the default export.
/// When the source has statically-analyzable named exports, they are re-exported
/// as `export const { name1, name2 } = __cjs_exports;`.
fn wrap_cjs_module(source: &str, path: &Path) -> String {
    let filename = path.to_string_lossy();
    let dirname = path
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    let filename_json = serde_json::to_string(&*filename).unwrap_or_else(|_| "\"\"".to_string());
    let dirname_json = serde_json::to_string(&*dirname).unwrap_or_else(|_| "\"\"".to_string());

    let named_exports = extract_cjs_named_exports(source);
    let named_line = if named_exports.is_empty() {
        String::new()
    } else {
        format!(
            "export const {{ {} }} = __cjs_exports;\n",
            named_exports.join(", ")
        )
    };

    format!(
        "var __filename = {f};\n\
         var __dirname = {d};\n\
         var module = {{ exports: {{}} }};\n\
         var exports = module.exports;\n\
         var require = globalThis.__vtz_cjs_require({d});\n\n\
         {src}\n\n\
         var __cjs_exports = module.exports;\n\
         export default __cjs_exports;\n\
         {named}",
        f = filename_json,
        d = dirname_json,
        src = source,
        named = named_line,
    )
}

/// JavaScript bootstrap for CJS `require()` support.
///
/// Installs `globalThis.__vtz_cjs_require(fromDir)` which returns a `require`
/// function that resolves relative paths, reads files synchronously, and evaluates
/// them as CommonJS modules with `module`, `exports`, `require`, `__filename`,
/// `__dirname` bindings.
pub const CJS_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  const _cjsCache = Object.create(null);

  function _resolveCjsPath(specifier, fromDir) {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const parts = (fromDir + '/' + specifier).split('/');
      const resolved = [];
      for (const part of parts) {
        if (part === '' && resolved.length > 0) continue;
        if (part === '.') continue;
        if (part === '..') { resolved.pop(); continue; }
        resolved.push(part);
      }
      let path = '/' + resolved.join('/');

      if (Deno.core.ops.op_fs_exists_sync(path)) {
        try {
          const stat = Deno.core.ops.op_fs_stat_sync(path);
          if (stat.isDirectory) {
            // Check package.json main
            const pkgPath = path + '/package.json';
            if (Deno.core.ops.op_fs_exists_sync(pkgPath)) {
              try {
                const pkg = JSON.parse(Deno.core.ops.op_fs_read_file_sync(pkgPath));
                if (pkg.main) {
                  const mainPath = path + '/' + pkg.main;
                  if (Deno.core.ops.op_fs_exists_sync(mainPath)) return mainPath;
                }
              } catch (_) { /* ignore parse errors */ }
            }
            if (Deno.core.ops.op_fs_exists_sync(path + '/index.js')) return path + '/index.js';
            if (Deno.core.ops.op_fs_exists_sync(path + '/index.json')) return path + '/index.json';
            throw new Error("Cannot find module '" + specifier + "' from '" + fromDir + "'");
          }
        } catch (_) { /* stat error — treat as file */ }
        return path;
      }
      if (Deno.core.ops.op_fs_exists_sync(path + '.js')) return path + '.js';
      if (Deno.core.ops.op_fs_exists_sync(path + '.json')) return path + '.json';
      if (Deno.core.ops.op_fs_exists_sync(path + '/index.js')) return path + '/index.js';

      throw new Error("Cannot find module '" + specifier + "' from '" + fromDir + "'");
    }

    // Bare specifiers — walk up node_modules
    let dir = fromDir;
    while (dir && dir !== '/') {
      const candidate = dir + '/node_modules/' + specifier;
      if (Deno.core.ops.op_fs_exists_sync(candidate)) {
        try {
          const stat = Deno.core.ops.op_fs_stat_sync(candidate);
          if (stat.isDirectory) {
            const pkgPath = candidate + '/package.json';
            if (Deno.core.ops.op_fs_exists_sync(pkgPath)) {
              try {
                const pkg = JSON.parse(Deno.core.ops.op_fs_read_file_sync(pkgPath));
                if (pkg.main) {
                  const mainPath = candidate + '/' + pkg.main;
                  if (Deno.core.ops.op_fs_exists_sync(mainPath)) return mainPath;
                }
              } catch (_) { /* ignore parse errors */ }
            }
            if (Deno.core.ops.op_fs_exists_sync(candidate + '/index.js')) return candidate + '/index.js';
          } else {
            return candidate;
          }
        } catch (_) { return candidate; }
      }
      if (Deno.core.ops.op_fs_exists_sync(candidate + '.js')) return candidate + '.js';
      const lastSlash = dir.lastIndexOf('/');
      dir = lastSlash > 0 ? dir.substring(0, lastSlash) : '';
    }

    throw new Error(
      "require('" + specifier + "') could not be resolved from '" + fromDir + "'. " +
      "Use ESM imports for complex module resolution."
    );
  }

  function _loadCjsModule(filename, dirname) {
    if (filename in _cjsCache) return _cjsCache[filename].exports;

    if (filename.endsWith('.json')) {
      const source = Deno.core.ops.op_fs_read_file_sync(filename);
      const parsed = JSON.parse(source);
      _cjsCache[filename] = { exports: parsed };
      return parsed;
    }

    const source = Deno.core.ops.op_fs_read_file_sync(filename);
    const mod = { exports: {} };
    _cjsCache[filename] = mod;

    const requireFn = _createRequire(dirname);
    requireFn.resolve = function(specifier) {
      return _resolveCjsPath(specifier, dirname);
    };

    const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', source);
    fn(mod, mod.exports, requireFn, filename, dirname);

    return mod.exports;
  }

  function _createRequire(fromDir) {
    return function require(specifier) {
      const resolved = _resolveCjsPath(specifier, fromDir);
      const lastSlash = resolved.lastIndexOf('/');
      const dirname = lastSlash >= 0 ? resolved.substring(0, lastSlash) : '.';
      return _loadCjsModule(resolved, dirname);
    };
  }

  globalThis.__vtz_cjs_require = _createRequire;
})(globalThis);
"#;

/// Prefix for mocked module synthetic specifiers.
const VERTZ_MOCK_PREFIX: &str = "vertz:mock:";

/// Extract named export identifiers from a JS/TS source file.
///
/// Uses simple regex patterns to find `export` declarations. This is
/// intentionally not a full parser — it handles common export forms:
/// - `export function name`
/// - `export const/let/var name`
/// - `export class Name`
/// - `export default`
/// - `export { name1, name2 }`
/// - `export { name1 as name2 }`
fn extract_export_names(source: &str) -> Vec<String> {
    let mut names = HashSet::new();

    for line in source.lines() {
        let trimmed = line.trim();

        // export default → "default"
        if trimmed.starts_with("export default ") {
            names.insert("default".to_string());
            continue;
        }

        // export function name, export class Name
        if let Some(rest) = trimmed.strip_prefix("export function ") {
            if let Some(name) = rest.split(&['(', ' ', '<'][..]).next() {
                let name = name.trim();
                if !name.is_empty() {
                    names.insert(name.to_string());
                }
            }
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("export class ") {
            if let Some(name) = rest.split(&[' ', '{', '<'][..]).next() {
                let name = name.trim();
                if !name.is_empty() {
                    names.insert(name.to_string());
                }
            }
            continue;
        }

        // export const/let/var name (possibly destructured)
        for keyword in &["export const ", "export let ", "export var "] {
            if let Some(rest) = trimmed.strip_prefix(keyword) {
                // Skip destructuring patterns for simplicity
                if rest.starts_with('{') || rest.starts_with('[') {
                    continue;
                }
                if let Some(name) = rest.split(&['=', ':', ' ', ';'][..]).next() {
                    let name = name.trim();
                    if !name.is_empty() {
                        names.insert(name.to_string());
                    }
                }
            }
        }

        // export { name1, name2 } or export { name1 as alias1 }
        if let Some(rest) = trimmed.strip_prefix("export {") {
            let rest = rest.trim_end_matches(';');
            let rest = if let Some(idx) = rest.rfind('}') {
                &rest[..idx]
            } else {
                rest
            };
            // Handle `export { x } from '...'` — skip re-exports, include local exports
            let is_reexport = rest.contains(" from ");
            if !is_reexport {
                for part in rest.split(',') {
                    let part = part.trim();
                    if part.is_empty() {
                        continue;
                    }
                    // `name as alias` → use "alias" as the export name
                    let name = if let Some((_original, alias)) = part.split_once(" as ") {
                        alias.trim()
                    } else {
                        part
                    };
                    if !name.is_empty() {
                        names.insert(name.to_string());
                    }
                }
            } else {
                // Re-export: `export { x, y } from './other'` — use original names
                let before_from = rest.split(" from ").next().unwrap_or("");
                for part in before_from.split(',') {
                    let part = part.trim();
                    if part.is_empty() {
                        continue;
                    }
                    let name = if let Some((_original, alias)) = part.split_once(" as ") {
                        alias.trim()
                    } else {
                        part
                    };
                    if !name.is_empty() {
                        names.insert(name.to_string());
                    }
                }
            }
        }
    }

    names.into_iter().collect()
}

/// Generate a proxy ES module that re-exports from the mock registry.
///
/// The proxy reads from `globalThis.__vertz_mocked_modules[specifier]` and
/// re-exports each named export as `const` bindings. Mock behavior changes
/// via object mutation (e.g. `.mockImplementation()`), not reference replacement.
fn generate_mock_proxy_module(specifier: &str, export_names: &[String]) -> String {
    let mut code = format!(
        "const __m = globalThis.__vertz_mocked_modules?.['{}'] ?? {{}};\n",
        specifier
    );

    for name in export_names {
        if name == "default" {
            code.push_str("export default ('default' in __m ? __m.default : __m);\n");
        } else {
            // Use getter-based re-export for late binding
            code.push_str(&format!("export const {} = __m['{}'];\n", name, name));
        }
    }

    // If no default export was extracted but the mock has one, add it
    if !export_names.iter().any(|n| n == "default") {
        code.push_str("if ('default' in __m) {{ /* default handled by named exports */ }}\n");
    }

    code
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
            // Priority: import > node > module > default > require
            for key in &["import", "node", "module", "default", "require"] {
                if let Some(entry) = map.get(*key) {
                    return resolve_condition_value(entry);
                }
            }
            None
        }
        _ => None,
    }
}

/// Resolve a value from a package.json "imports" mapping entry.
/// Supports string values and condition maps (same logic as exports).
fn resolve_imports_mapping(value: &serde_json::Value) -> Option<String> {
    resolve_condition_value(value)
}

/// Synthetic module source for `@vertz/test` and `bun:test` imports.
/// Re-exports all test harness globals that were injected by the test runner.
const VERTZ_TEST_MODULE: &str = r#"
const { describe, it, test, expect, beforeEach, afterEach, beforeAll, afterAll, mock, spyOn, vi, expectTypeOf } = globalThis.__vertz_test_exports;
export { describe, it, test, expect, beforeEach, afterEach, beforeAll, afterAll, mock, spyOn, vi, expectTypeOf };
export default { describe, it, test, expect, beforeEach, afterEach, beforeAll, afterAll, mock, spyOn, vi, expectTypeOf };
"#;

/// URL used for the synthetic test module.
const VERTZ_TEST_SPECIFIER: &str = "vertz:test";

/// Synthetic module for `vertz:sqlite` (canonical), `@vertz/sqlite` (npm package),
/// and `bun:sqlite` (compat alias).
const VERTZ_SQLITE_SPECIFIER: &str = "vertz:sqlite";
const VERTZ_SQLITE_MODULE: &str = r#"
const _registry = new FinalizationRegistry((id) => {
  try { Deno.core.ops.op_sqlite_close(id); } catch {}
});

class Statement {
  #dbId;
  #sql;
  constructor(dbId, sql) {
    this.#dbId = dbId;
    this.#sql = sql;
  }
  all(...params) {
    return Deno.core.ops.op_sqlite_query_all(this.#dbId, this.#sql, params);
  }
  get(...params) {
    return Deno.core.ops.op_sqlite_query_get(this.#dbId, this.#sql, params);
  }
  run(...params) {
    return Deno.core.ops.op_sqlite_query_run(this.#dbId, this.#sql, params);
  }
}

class Database {
  #id;
  #closed = false;
  constructor(path) {
    if (typeof path !== 'string') throw new TypeError('Database path must be a string');
    this.#id = Deno.core.ops.op_sqlite_open(path);
    _registry.register(this, this.#id, this);
  }
  #assertOpen() {
    if (this.#closed) throw new TypeError('database is closed');
  }
  prepare(sql) {
    this.#assertOpen();
    return new Statement(this.#id, sql);
  }
  exec(sql) {
    this.#assertOpen();
    Deno.core.ops.op_sqlite_exec(this.#id, sql);
  }
  run(sql, ...params) {
    this.#assertOpen();
    return Deno.core.ops.op_sqlite_query_run(this.#id, sql, params);
  }
  transaction(fn) {
    this.#assertOpen();
    const self = this;
    return function transactionWrapper() {
      self.exec('BEGIN');
      try {
        const result = fn();
        self.exec('COMMIT');
        return result;
      } catch (e) {
        self.exec('ROLLBACK');
        throw e;
      }
    };
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    _registry.unregister(this);
    Deno.core.ops.op_sqlite_close(this.#id);
  }
}

export { Database, Statement };
export default Database;
"#;

/// Synthetic module for `node:path`.
const NODE_PATH_SPECIFIER: &str = "vertz:node_path";
const NODE_PATH_MODULE: &str = r#"
const p = globalThis.__vertz_path;
export const join = p.join;
export const resolve = p.resolve;
export const dirname = p.dirname;
export const basename = p.basename;
export const extname = p.extname;
export const relative = p.relative;
export const normalize = p.normalize;
export const isAbsolute = p.isAbsolute;
export const parse = p.parse;
export const format = p.format;
export const sep = p.sep;
export const delimiter = p.delimiter;
export const posix = p.posix;
export default p;
"#;

/// Synthetic module for `node:os`.
const NODE_OS_SPECIFIER: &str = "vertz:node_os";
const NODE_OS_MODULE: &str = r#"
const os = globalThis.__vertz_os;
export const tmpdir = os.tmpdir;
export const homedir = os.homedir;
export const platform = os.platform;
export const hostname = os.hostname;
export const EOL = os.EOL;
export const type_ = os.type;
export { type_ as type };
export const arch = os.arch;
export const cpus = os.cpus;
export const totalmem = os.totalmem;
export const freemem = os.freemem;
export const release = os.release;
export const networkInterfaces = os.networkInterfaces;
export const userInfo = os.userInfo;
export const endianness = os.endianness;
export default os;
"#;

/// Synthetic module for `node:url`.
const NODE_URL_SPECIFIER: &str = "vertz:node_url";
const NODE_URL_MODULE: &str = r#"
function fileURLToPath(url) {
  if (typeof url === 'string') {
    return Deno.core.ops.op_file_url_to_path(url);
  }
  if (url && typeof url === 'object' && typeof url.href === 'string') {
    return Deno.core.ops.op_file_url_to_path(url.href);
  }
  throw new TypeError('The "url" argument must be of type string or URL');
}

function pathToFileURL(path) {
  return new URL(Deno.core.ops.op_path_to_file_url(String(path)));
}

export { fileURLToPath, pathToFileURL };
export { URL, URLSearchParams } from 'vertz:node_url_globals';
export default { fileURLToPath, pathToFileURL, URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams };
"#;

/// Helper synthetic module that re-exports URL globals for node:url.
const NODE_URL_GLOBALS_SPECIFIER: &str = "vertz:node_url_globals";
const NODE_URL_GLOBALS_MODULE: &str = r#"
export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;
"#;

/// Synthetic module for `node:events`.
const NODE_EVENTS_SPECIFIER: &str = "vertz:node_events";
const NODE_EVENTS_MODULE: &str = r#"
// Snapshot helper: captures async context at registration time if available.
const _Snapshot = typeof globalThis.AsyncContext?.Snapshot === 'function'
  ? globalThis.AsyncContext.Snapshot
  : null;

function _snap() {
  return _Snapshot ? new _Snapshot() : null;
}

// Listeners are stored as { fn, snapshot } entries.
// - fn: the listener function (or once-wrapper with _original)
// - snapshot: AsyncContext.Snapshot captured at on() time, or null

class EventEmitter {
  #listeners = new Map();
  #maxListeners = 10;

  on(event, listener) {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, []);
    }
    this.#listeners.get(event).push({ fn: listener, snapshot: _snap() });
    return this;
  }

  addListener(event, listener) {
    return this.on(event, listener);
  }

  once(event, listener) {
    const wrapped = (...args) => {
      this.removeListener(event, wrapped);
      listener.apply(this, args);
    };
    wrapped._original = listener;
    return this.on(event, wrapped);
  }

  off(event, listener) {
    return this.removeListener(event, listener);
  }

  removeListener(event, listener) {
    const arr = this.#listeners.get(event);
    if (!arr) return this;
    const idx = arr.findIndex(entry => entry.fn === listener || entry.fn._original === listener);
    if (idx !== -1) arr.splice(idx, 1);
    if (arr.length === 0) this.#listeners.delete(event);
    return this;
  }

  removeAllListeners(event) {
    if (event !== undefined) {
      this.#listeners.delete(event);
    } else {
      this.#listeners.clear();
    }
    return this;
  }

  emit(event, ...args) {
    const arr = this.#listeners.get(event);
    if (!arr || arr.length === 0) return false;
    for (const entry of [...arr]) {
      if (entry.snapshot) {
        entry.snapshot.run(() => entry.fn.apply(this, args));
      } else {
        entry.fn.apply(this, args);
      }
    }
    return true;
  }

  listenerCount(event) {
    const arr = this.#listeners.get(event);
    return arr ? arr.length : 0;
  }

  listeners(event) {
    const arr = this.#listeners.get(event);
    if (!arr) return [];
    return arr.map(entry => entry.fn._original || entry.fn);
  }

  rawListeners(event) {
    const arr = this.#listeners.get(event);
    return arr ? arr.map(entry => entry.fn) : [];
  }

  eventNames() {
    return [...this.#listeners.keys()];
  }

  prependListener(event, listener) {
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, []);
    }
    this.#listeners.get(event).unshift({ fn: listener, snapshot: _snap() });
    return this;
  }

  setMaxListeners(n) {
    this.#maxListeners = n;
    return this;
  }

  getMaxListeners() {
    return this.#maxListeners;
  }
}

export { EventEmitter };
export default EventEmitter;
"#;

/// Synthetic module for `node:process` (minimal shim).
const NODE_PROCESS_SPECIFIER: &str = "vertz:node_process";
const NODE_PROCESS_MODULE: &str = r#"
// Ensure process global exists with required properties
const proc = globalThis.process || {};
if (!proc.env) proc.env = {};
if (!proc.cwd) proc.cwd = () => '/';
if (!proc.argv) proc.argv = [];
if (!proc.platform) proc.platform = Deno.core.ops.op_os_platform();
if (!proc.version) proc.version = 'v20.0.0';
if (!proc.versions) proc.versions = {};
if (!proc.exit) proc.exit = (code) => { throw new Error('process.exit(' + (code !== undefined ? code : '') + ') is not supported in the Vertz runtime'); };
if (!proc.nextTick) proc.nextTick = (fn, ...args) => queueMicrotask(() => fn(...args));
if (!proc.stdout) proc.stdout = { write: (s) => { console.log(s); } };
if (!proc.stderr) proc.stderr = { write: (s) => { console.error(s); } };
globalThis.process = proc;

export default proc;
export const env = proc.env;
export const cwd = proc.cwd;
export const argv = proc.argv;
export const platform = proc.platform;
export const version = proc.version;
export const versions = proc.versions;
export const nextTick = proc.nextTick;
export const stdout = proc.stdout;
export const stderr = proc.stderr;
"#;

/// Synthetic module for `node:fs`.
const NODE_FS_SPECIFIER: &str = "vertz:node_fs";
const NODE_FS_MODULE: &str = r#"
const fs = globalThis.__vertz_fs;
export const readFileSync = fs.readFileSync;
export const writeFileSync = fs.writeFileSync;
export const appendFileSync = fs.appendFileSync;
export const existsSync = fs.existsSync;
export const mkdirSync = fs.mkdirSync;
export const readdirSync = fs.readdirSync;
export const statSync = fs.statSync;
export const lstatSync = fs.lstatSync;
export const rmSync = fs.rmSync;
export const unlinkSync = fs.unlinkSync;
export const renameSync = fs.renameSync;
export const realpathSync = fs.realpathSync;
export const mkdtempSync = fs.mkdtempSync;
export const copyFileSync = fs.copyFileSync;
export const cpSync = fs.cpSync;
export const chmodSync = fs.chmodSync;
export const readFile = fs.readFile;
export const writeFile = fs.writeFile;
export const mkdir = fs.mkdir;
export const readdir = fs.readdir;
export const stat = fs.stat;
export const rm = fs.rm;
export const unlink = fs.unlink;
export const rename = fs.rename;
export const realpath = fs.realpath;
export const promises = fs.promises;
export default fs;
"#;

/// Synthetic module for `node:fs/promises`.
const NODE_FS_PROMISES_SPECIFIER: &str = "vertz:node_fs_promises";
const NODE_FS_PROMISES_MODULE: &str = r#"
const p = globalThis.__vertz_fs.promises;
export const readFile = p.readFile;
export const writeFile = p.writeFile;
export const mkdir = p.mkdir;
export const readdir = p.readdir;
export const stat = p.stat;
export const rm = p.rm;
export const unlink = p.unlink;
export const rename = p.rename;
export const realpath = p.realpath;
export default p;
"#;

/// Synthetic module for `node:crypto`.
const NODE_CRYPTO_SPECIFIER: &str = "vertz:node_crypto";
const NODE_CRYPTO_MODULE: &str = r#"
class Hash {
  #algorithm;
  #data;

  constructor(algorithm) {
    this.#algorithm = algorithm;
    this.#data = new Uint8Array(0);
  }

  update(data, encoding) {
    let bytes;
    if (typeof data === 'string') {
      bytes = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array) {
      bytes = data;
    } else if (ArrayBuffer.isView(data)) {
      bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else {
      bytes = new Uint8Array(data);
    }
    // Concatenate
    const merged = new Uint8Array(this.#data.length + bytes.length);
    merged.set(this.#data);
    merged.set(bytes, this.#data.length);
    this.#data = merged;
    return this;
  }

  digest(encoding) {
    const result = Deno.core.ops.op_crypto_hash_digest(this.#algorithm, this.#data);
    const buf = Buffer.from(result);
    if (encoding === 'hex') return buf.toString('hex');
    if (encoding === 'base64') return buf.toString('base64');
    return buf;
  }
}

function createHash(algorithm) {
  return new Hash(algorithm);
}

function createHmac(algorithm, key) {
  // Minimal HMAC using Web Crypto pattern (synchronous via Rust op)
  let keyBytes;
  if (typeof key === 'string') {
    keyBytes = new TextEncoder().encode(key);
  } else if (key instanceof Uint8Array) {
    keyBytes = key;
  } else {
    keyBytes = new Uint8Array(key);
  }

  let data = new Uint8Array(0);

  return {
    update(input) {
      const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
      const merged = new Uint8Array(data.length + bytes.length);
      merged.set(data);
      merged.set(bytes, data.length);
      data = merged;
      return this;
    },
    digest(encoding) {
      // HMAC: hash(key XOR opad || hash(key XOR ipad || message))
      // For simplicity, delegate to the subtle API synchronously via hash
      // This is a minimal shim — full HMAC available via crypto.subtle
      const algoMap = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512', sha1: 'SHA-1' };
      const normalizedAlgo = algoMap[algorithm.toLowerCase()] || algorithm;
      const blockSize = (normalizedAlgo.includes('512') || normalizedAlgo.includes('384')) ? 128 : 64;

      let k = keyBytes;
      if (k.length > blockSize) {
        k = new Uint8Array(Deno.core.ops.op_crypto_hash_digest(normalizedAlgo, k));
      }
      if (k.length < blockSize) {
        const padded = new Uint8Array(blockSize);
        padded.set(k);
        k = padded;
      }

      const ipad = new Uint8Array(blockSize);
      const opad = new Uint8Array(blockSize);
      for (let i = 0; i < blockSize; i++) {
        ipad[i] = k[i] ^ 0x36;
        opad[i] = k[i] ^ 0x5c;
      }

      const inner = new Uint8Array(ipad.length + data.length);
      inner.set(ipad);
      inner.set(data, ipad.length);
      const innerHash = new Uint8Array(Deno.core.ops.op_crypto_hash_digest(normalizedAlgo, inner));

      const outer = new Uint8Array(opad.length + innerHash.length);
      outer.set(opad);
      outer.set(innerHash, opad.length);
      const result = Deno.core.ops.op_crypto_hash_digest(normalizedAlgo, outer);

      const buf = Buffer.from(result);
      if (encoding === 'hex') return buf.toString('hex');
      if (encoding === 'base64') return buf.toString('base64');
      return buf;
    },
  };
}

function timingSafeEqual(a, b) {
  const aBuf = a instanceof Uint8Array ? a : new Uint8Array(a);
  const bBuf = b instanceof Uint8Array ? b : new Uint8Array(b);
  return Deno.core.ops.op_crypto_timing_safe_equal(aBuf, bBuf);
}

function randomBytes(size) {
  return Buffer.from(Deno.core.ops.op_crypto_random_bytes(size));
}

function randomUUID() {
  return Deno.core.ops.op_crypto_random_uuid();
}

// webcrypto: expose the Web Crypto API (available in V8 via globalThis.crypto)
const webcrypto = globalThis.crypto;

// KeyObject stub for RSA key operations (the runtime uses Rust-native JWT ops)
class KeyObject {
  constructor(type, data) {
    this._type = type;
    this._data = data;
  }
  get type() { return this._type; }
  export(options) {
    if (options && options.type === 'pkcs1' && options.format === 'pem') {
      return this._data;
    }
    if (options && options.type === 'spki' && options.format === 'pem') {
      return this._data;
    }
    return this._data;
  }
}

function createPrivateKey(input) {
  const key = typeof input === 'string' ? input : (input.key || input);
  return new KeyObject('private', key);
}

function createPublicKey(input) {
  const key = typeof input === 'string' ? input : (input.key || input);
  return new KeyObject('public', key);
}

function generateKeyPairSync(type, options) {
  // Delegate to Rust op if available
  if (typeof Deno !== 'undefined' && Deno.core && Deno.core.ops.op_crypto_generate_keypair) {
    const result = Deno.core.ops.op_crypto_generate_keypair(
      type,
      options.modulusLength || 2048
    );
    return {
      publicKey: createPublicKey(result.publicKey),
      privateKey: createPrivateKey(result.privateKey),
    };
  }
  throw new Error('generateKeyPairSync is not supported in the Vertz runtime without the crypto op');
}

function randomFillSync(buf, offset, size) {
  const target = buf instanceof Uint8Array ? buf : new Uint8Array(buf.buffer || buf);
  const off = offset || 0;
  const len = size || (target.length - off);
  const bytes = Deno.core.ops.op_crypto_random_bytes(len);
  target.set(new Uint8Array(bytes), off);
  return buf;
}

function randomInt(min, max) {
  if (max === undefined) { max = min; min = 0; }
  const range = max - min;
  const arr = new Uint32Array(1);
  globalThis.crypto.getRandomValues(arr);
  return min + (arr[0] % range);
}

function getHashes() {
  return ['sha1', 'sha256', 'sha384', 'sha512', 'md5'];
}

function getCiphers() { return []; }
function getCurves() { return ['prime256v1', 'secp384r1', 'secp521r1']; }

const constants = {};

export { createHash, createHmac, timingSafeEqual, randomBytes, randomUUID, randomFillSync, randomInt, Hash, webcrypto, KeyObject, createPrivateKey, createPublicKey, generateKeyPairSync, getHashes, getCiphers, getCurves, constants };
export default { createHash, createHmac, timingSafeEqual, randomBytes, randomUUID, randomFillSync, randomInt, webcrypto, KeyObject, createPrivateKey, createPublicKey, generateKeyPairSync, getHashes, getCiphers, getCurves, constants };
"#;

/// Synthetic module for `node:buffer` / `buffer`.
const NODE_BUFFER_SPECIFIER: &str = "vertz:node_buffer";
const NODE_BUFFER_MODULE: &str = r#"
export const Buffer = globalThis.Buffer;
export default { Buffer: globalThis.Buffer };
"#;

/// Synthetic module for `node:module`.
/// Provides createRequire for CJS interop (used by bunup-generated shims).
const NODE_MODULE_SPECIFIER: &str = "vertz:node_module";
const NODE_MODULE_MODULE: &str = r#"
// createRequire shim: resolves bare specifiers via dynamic import
// This is used by bunup's CJS interop: `var __require = createRequire(import.meta.url)`
export function createRequire(_url) {
  return function require(specifier) {
    throw new Error(
      `createRequire().require("${specifier}") is not supported in the Vertz runtime. ` +
      `Use ESM imports instead.`
    );
  };
}
export default { createRequire };
"#;

/// Synthetic module for `node:async_hooks`.
/// Delegates to the AsyncContext polyfill installed by load_async_context().
const NODE_ASYNC_HOOKS_SPECIFIER: &str = "vertz:node_async_hooks";
const NODE_ASYNC_HOOKS_MODULE: &str = r#"
const { AsyncLocalStorage, AsyncResource } = globalThis.__vertz_async_hooks || {};
export { AsyncLocalStorage, AsyncResource };
export default { AsyncLocalStorage, AsyncResource };
"#;

/// Synthetic module for `node:child_process`.
/// Provides spawn, execFile, execSync stubs that delegate to Deno.Command.
const NODE_CHILD_PROCESS_SPECIFIER: &str = "vertz:node_child_process";
const NODE_CHILD_PROCESS_MODULE: &str = r#"
function execSync(cmd, opts) {
  const parts = cmd.split(' ');
  const command = new Deno.Command(parts[0], {
    args: parts.slice(1),
    cwd: opts?.cwd,
    env: opts?.env,
    stdout: opts?.encoding ? 'piped' : 'piped',
    stderr: 'piped',
  });
  const result = command.outputSync();
  if (result.code !== 0) {
    const err = new Error(`Command failed: ${cmd}`);
    err.status = result.code;
    err.stderr = new TextDecoder().decode(result.stderr);
    throw err;
  }
  const out = new TextDecoder().decode(result.stdout);
  return opts?.encoding ? out : new TextEncoder().encode(out);
}

function execFile(file, args, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  try {
    const command = new Deno.Command(file, {
      args: args || [],
      cwd: opts?.cwd,
      env: opts?.env,
      stdout: 'piped',
      stderr: 'piped',
    });
    const result = command.outputSync();
    const stdout = new TextDecoder().decode(result.stdout);
    const stderr = new TextDecoder().decode(result.stderr);
    if (result.code !== 0) {
      const err = new Error(`Command failed: ${file}`);
      err.code = result.code;
      err.stderr = stderr;
      if (cb) cb(err, stdout, stderr); else throw err;
      return;
    }
    if (cb) cb(null, stdout, stderr);
  } catch (e) {
    if (cb) cb(e, '', '');
    else throw e;
  }
}

function execFileSync(file, args, opts) {
  const command = new Deno.Command(file, {
    args: args || [],
    cwd: opts?.cwd,
    env: opts?.env,
    stdout: 'piped',
    stderr: 'piped',
  });
  const result = command.outputSync();
  if (result.code !== 0) {
    const err = new Error(`Command failed: ${file}`);
    err.status = result.code;
    err.stderr = new TextDecoder().decode(result.stderr);
    throw err;
  }
  const out = new TextDecoder().decode(result.stdout);
  return opts?.encoding ? out : new TextEncoder().encode(out);
}

function spawn(_cmd, _args, _opts) {
  throw new Error('node:child_process spawn() is not yet supported in the Vertz runtime.');
}

export { execSync, execFile, execFileSync, spawn };
export default { execSync, execFile, execFileSync, spawn };
"#;

/// Synthetic module for `node:http`.
/// Provides createServer stub backed by Deno.serve.
const NODE_HTTP_SPECIFIER: &str = "vertz:node_http";
const NODE_HTTP_MODULE: &str = r#"
class IncomingMessage {
  constructor(req) {
    this.url = new URL(req.url).pathname + new URL(req.url).search;
    this.method = req.method;
    this.headers = Object.fromEntries(req.headers.entries());
    this._body = req;
  }
  on(event, cb) {
    if (event === 'data') {
      this._body.text().then((text) => { cb(text); });
    } else if (event === 'end') {
      this._body.text().then(() => { cb(); });
    }
    return this;
  }
}

class ServerResponse {
  constructor() {
    this.statusCode = 200;
    this._headers = {};
    this._body = '';
    this._resolve = null;
    this.promise = new Promise((resolve) => { this._resolve = resolve; });
  }
  setHeader(name, value) { this._headers[name.toLowerCase()] = value; return this; }
  getHeader(name) { return this._headers[name.toLowerCase()]; }
  writeHead(status, headers) {
    this.statusCode = status;
    if (headers) Object.entries(headers).forEach(([k, v]) => this.setHeader(k, v));
    return this;
  }
  write(chunk) { this._body += chunk; return true; }
  end(data) {
    if (data) this._body += data;
    this._resolve(new Response(this._body, {
      status: this.statusCode,
      headers: this._headers,
    }));
  }
}

function createServer(handler) {
  let server = null;
  return {
    listen(port, host, cb) {
      if (typeof host === 'function') { cb = host; host = '0.0.0.0'; }
      server = Deno.serve({ port, hostname: host || '0.0.0.0' }, async (req) => {
        const msg = new IncomingMessage(req);
        const res = new ServerResponse();
        handler(msg, res);
        return res.promise;
      });
      if (cb) cb();
      return this;
    },
    close(cb) { if (server) server.shutdown(); if (cb) cb(); },
    address() { return { port: 0, address: '0.0.0.0' }; },
  };
}

export { createServer, IncomingMessage, ServerResponse };
export default { createServer, IncomingMessage, ServerResponse };
"#;

/// Synthetic module for `node:util`.
/// Provides promisify and other common utilities.
const NODE_UTIL_SPECIFIER: &str = "vertz:node_util";
const NODE_UTIL_MODULE: &str = r#"
function promisify(fn) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      fn(...args, (err, ...results) => {
        if (err) reject(err);
        else resolve(results.length <= 1 ? results[0] : results);
      });
    });
  };
}

function format(fmt, ...args) {
  if (typeof fmt !== 'string') return [fmt, ...args].map(String).join(' ');
  let i = 0;
  return fmt.replace(/%[sdjifoO%]/g, (match) => {
    if (match === '%%') return '%';
    if (i >= args.length) return match;
    return String(args[i++]);
  });
}

function inspect(obj) { return JSON.stringify(obj, null, 2) ?? String(obj); }
function deprecate(fn, _msg) { return fn; }
function types() { return {}; }
function callbackify(fn) {
  return function (...args) {
    const cb = args.pop();
    fn(...args).then((r) => cb(null, r), (e) => cb(e));
  };
}

export { promisify, format, inspect, deprecate, types, callbackify };
export default { promisify, format, inspect, deprecate, types, callbackify };
"#;

/// Synthetic module for `node:readline`.
const NODE_READLINE_SPECIFIER: &str = "vertz:node_readline";
const NODE_READLINE_MODULE: &str = r#"
function createInterface(_opts) {
  return {
    question(_q, cb) { if (cb) cb(''); },
    close() {},
    on(_event, _cb) { return this; },
    [Symbol.asyncIterator]() {
      return { next() { return Promise.resolve({ done: true, value: undefined }); } };
    },
  };
}
export { createInterface };
export default { createInterface };
"#;

/// Synthetic module for `node:zlib`.
const NODE_ZLIB_SPECIFIER: &str = "vertz:node_zlib";
const NODE_ZLIB_MODULE: &str = r#"
function brotliCompressSync(buf, _opts) {
  // Passthrough stub — real Brotli compression is not available in the test runtime.
  return typeof buf === 'string' ? new TextEncoder().encode(buf) : buf;
}
const constants = {
  BROTLI_PARAM_QUALITY: 11,
  BROTLI_MAX_QUALITY: 11,
  BROTLI_MIN_QUALITY: 0,
  Z_BEST_COMPRESSION: 9,
};
export { brotliCompressSync, constants };
export default { brotliCompressSync, constants };
"#;

/// Synthetic module for `stream/web` — re-exports Web Streams API from globals.
const NODE_STREAM_WEB_SPECIFIER: &str = "vertz:node_stream_web";
const NODE_STREAM_WEB_MODULE: &str = r#"
export const ReadableStream = globalThis.ReadableStream;
export const WritableStream = globalThis.WritableStream || class WritableStream {};
export const TransformStream = globalThis.TransformStream || class TransformStream {};
export default { ReadableStream, WritableStream, TransformStream };
"#;

/// Map a `node:*` specifier to a synthetic module specifier.
fn node_specifier_to_synthetic(specifier: &str) -> Option<&'static str> {
    match specifier {
        "node:path" | "path" => Some(NODE_PATH_SPECIFIER),
        "node:os" | "os" => Some(NODE_OS_SPECIFIER),
        "node:url" | "url" => Some(NODE_URL_SPECIFIER),
        "node:events" | "events" => Some(NODE_EVENTS_SPECIFIER),
        "node:process" | "process" => Some(NODE_PROCESS_SPECIFIER),
        "node:fs" | "fs" => Some(NODE_FS_SPECIFIER),
        "node:fs/promises" => Some(NODE_FS_PROMISES_SPECIFIER),
        "node:crypto" | "crypto" => Some(NODE_CRYPTO_SPECIFIER),
        "node:buffer" | "buffer" => Some(NODE_BUFFER_SPECIFIER),
        "node:module" | "module" => Some(NODE_MODULE_SPECIFIER),
        "node:async_hooks" | "async_hooks" => Some(NODE_ASYNC_HOOKS_SPECIFIER),
        "node:child_process" | "child_process" => Some(NODE_CHILD_PROCESS_SPECIFIER),
        "node:http" | "http" => Some(NODE_HTTP_SPECIFIER),
        "node:util" | "util" => Some(NODE_UTIL_SPECIFIER),
        "node:readline" | "readline" => Some(NODE_READLINE_SPECIFIER),
        "node:zlib" | "zlib" => Some(NODE_ZLIB_SPECIFIER),
        "stream" | "node:stream" | "stream/web" | "node:stream/web" => {
            Some(NODE_STREAM_WEB_SPECIFIER)
        }
        _ => None,
    }
}

/// Map a synthetic module specifier to its source code.
fn synthetic_module_source(specifier: &str) -> Option<&'static str> {
    match specifier {
        VERTZ_TEST_SPECIFIER => Some(VERTZ_TEST_MODULE),
        NODE_PATH_SPECIFIER => Some(NODE_PATH_MODULE),
        NODE_OS_SPECIFIER => Some(NODE_OS_MODULE),
        NODE_URL_SPECIFIER => Some(NODE_URL_MODULE),
        NODE_URL_GLOBALS_SPECIFIER => Some(NODE_URL_GLOBALS_MODULE),
        NODE_EVENTS_SPECIFIER => Some(NODE_EVENTS_MODULE),
        NODE_PROCESS_SPECIFIER => Some(NODE_PROCESS_MODULE),
        NODE_FS_SPECIFIER => Some(NODE_FS_MODULE),
        NODE_FS_PROMISES_SPECIFIER => Some(NODE_FS_PROMISES_MODULE),
        NODE_CRYPTO_SPECIFIER => Some(NODE_CRYPTO_MODULE),
        NODE_BUFFER_SPECIFIER => Some(NODE_BUFFER_MODULE),
        NODE_MODULE_SPECIFIER => Some(NODE_MODULE_MODULE),
        NODE_ASYNC_HOOKS_SPECIFIER => Some(NODE_ASYNC_HOOKS_MODULE),
        NODE_CHILD_PROCESS_SPECIFIER => Some(NODE_CHILD_PROCESS_MODULE),
        NODE_HTTP_SPECIFIER => Some(NODE_HTTP_MODULE),
        NODE_UTIL_SPECIFIER => Some(NODE_UTIL_MODULE),
        NODE_READLINE_SPECIFIER => Some(NODE_READLINE_MODULE),
        NODE_ZLIB_SPECIFIER => Some(NODE_ZLIB_MODULE),
        NODE_STREAM_WEB_SPECIFIER => Some(NODE_STREAM_WEB_MODULE),
        VERTZ_SQLITE_SPECIFIER => Some(VERTZ_SQLITE_MODULE),
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
        // Intercept @vertz/test and bun:test → synthetic vertz:test module
        if specifier == "@vertz/test" || specifier == "bun:test" {
            return Ok(ModuleSpecifier::parse(VERTZ_TEST_SPECIFIER)?);
        }

        // Intercept vertz:sqlite (canonical), @vertz/sqlite (npm), and bun:sqlite (compat)
        // → synthetic SQLite module
        if specifier == "vertz:sqlite" || specifier == "@vertz/sqlite" || specifier == "bun:sqlite"
        {
            return Ok(ModuleSpecifier::parse(VERTZ_SQLITE_SPECIFIER)?);
        }

        // Intercept node:* specifiers → synthetic modules
        if let Some(synthetic) = node_specifier_to_synthetic(specifier) {
            return Ok(ModuleSpecifier::parse(synthetic)?);
        }

        // Internal synthetic module references
        if specifier == NODE_URL_GLOBALS_SPECIFIER {
            return Ok(ModuleSpecifier::parse(NODE_URL_GLOBALS_SPECIFIER)?);
        }

        // If specifier is already a file:// URL, canonicalize and return
        if specifier.starts_with("file://") {
            let parsed = ModuleSpecifier::parse(specifier)?;
            if let Ok(file_path) = parsed.to_file_path() {
                let canonical = self.canonicalize_cached(&file_path);
                return ModuleSpecifier::from_file_path(&canonical).map_err(|_| {
                    deno_core::anyhow::anyhow!(
                        "Cannot convert path to URL: {}",
                        canonical.display()
                    )
                });
            }
            return Ok(parsed);
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

        // Check shared resolution cache before hitting the filesystem
        let referrer_dir = referrer_path.parent().unwrap_or(&self.root_dir);
        if let Some(ref cache) = self.resolution_cache {
            if let Some(cached_path) = cache.get(specifier, referrer_dir) {
                return ModuleSpecifier::from_file_path(&cached_path).map_err(|_| {
                    deno_core::anyhow::anyhow!(
                        "Cannot convert path to URL: {}",
                        cached_path.display()
                    )
                });
            }
        }

        let resolved_path = self.resolve_specifier(specifier, &referrer_path)?;

        // Canonicalize to ensure same physical file = same module URL.
        // This prevents instanceof failures across ES module boundaries when the
        // same file is reached via different paths (symlinks, .. components, etc.).
        let canonical_path = self.canonicalize_cached(&resolved_path);

        // Check if this module should be mocked (transitive mocking)
        if self.mocked_paths.borrow().contains_key(&canonical_path) {
            let mock_url = format!("{}{}", VERTZ_MOCK_PREFIX, canonical_path.display());
            return Ok(ModuleSpecifier::parse(&mock_url)?);
        }

        // Store in shared resolution cache
        if let Some(ref cache) = self.resolution_cache {
            cache.insert(specifier, referrer_dir, canonical_path.clone());
        }

        let url = ModuleSpecifier::from_file_path(&canonical_path).map_err(|_| {
            deno_core::anyhow::anyhow!("Cannot convert path to URL: {}", canonical_path.display())
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
            // Return synthetic modules (vertz:test, vertz:node_path, etc.)
            if let Some(source) = synthetic_module_source(specifier.as_str()) {
                return Ok(ModuleSource::new(
                    ModuleType::JavaScript,
                    ModuleSourceCode::String(source.to_string().into()),
                    &specifier,
                    None,
                ));
            }

            // Handle mocked modules (transitive mocking)
            if let Some(original_path) = specifier.as_str().strip_prefix(VERTZ_MOCK_PREFIX) {
                let path = PathBuf::from(original_path);
                let mock_specifier = self
                    .mocked_paths
                    .borrow()
                    .get(&path)
                    .cloned()
                    .unwrap_or_default();

                // Read the original source to discover export names
                let source_text = std::fs::read_to_string(&path).unwrap_or_default();
                let export_names = extract_export_names(&source_text);

                let proxy = generate_mock_proxy_module(&mock_specifier, &export_names);
                return Ok(ModuleSource::new(
                    ModuleType::JavaScript,
                    ModuleSourceCode::String(proxy.into()),
                    &specifier,
                    None,
                ));
            }

            let path = specifier.to_file_path().map_err(|_| {
                deno_core::anyhow::anyhow!("Only file:// URLs are supported, got: {}", specifier)
            })?;

            let source = std::fs::read_to_string(&path).map_err(|e| {
                deno_core::anyhow::anyhow!("Cannot read module '{}': {}", path.display(), e)
            })?;

            let filename = path.to_string_lossy().to_string();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

            // Determine if we need to compile or wrap
            let is_cjs = matches!(ext, "js" | "cjs" | "")
                && is_cjs_module_cached(&path, &source, Some(&self.pkg_type_cache));
            let (code, module_type) = match ext {
                "ts" | "tsx" | "jsx" => {
                    let compiled = self.compile_source(&source, &filename)?;
                    (compiled, ModuleType::JavaScript)
                }
                "json" => (source, ModuleType::Json),
                _ => {
                    if is_cjs {
                        (wrap_cjs_module(&source, &path), ModuleType::JavaScript)
                    } else {
                        (source, ModuleType::JavaScript)
                    }
                }
            };

            let code_cache = self
                .v8_code_cache
                .as_ref()
                .and_then(|cache| cache.get(specifier.as_str()));

            Ok(ModuleSource::new(
                module_type,
                ModuleSourceCode::String(code.into()),
                &specifier,
                code_cache,
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

    fn code_cache_ready(
        &self,
        specifier: ModuleSpecifier,
        hash: u64,
        code_cache: &[u8],
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()>>> {
        if let Some(ref cache) = self.v8_code_cache {
            cache.store(specifier.as_str(), hash, code_cache);
        }
        Box::pin(std::future::ready(()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_temp_dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    fn test_plugin() -> std::sync::Arc<dyn FrameworkPlugin> {
        std::sync::Arc::new(crate::plugin::vertz::VertzPlugin)
    }

    /// Canonicalize a path for test assertions.
    /// On macOS, tempdir paths are under /tmp which is a symlink to /private/tmp.
    fn canon(path: &Path) -> PathBuf {
        path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
    }

    #[test]
    fn test_resolve_relative_js() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        let util_file = tmp.path().join("utils.js");
        std::fs::write(&main_file, "import './utils.js';").unwrap();
        std::fs::write(&util_file, "export const x = 1;").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("./utils.js", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.to_file_path().unwrap(), canon(&util_file));
    }

    #[test]
    fn test_resolve_with_extension_inference() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        let util_file = tmp.path().join("utils.ts");
        std::fs::write(&main_file, "").unwrap();
        std::fs::write(&util_file, "export const x = 1;").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("./utils", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.to_file_path().unwrap(), canon(&util_file));
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

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("./lib", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.to_file_path().unwrap(), canon(&index_file));
    }

    #[test]
    fn test_resolve_missing_module_error() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
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

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("my-pkg", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.to_file_path().unwrap(), canon(&entry));
    }

    #[test]
    fn test_resolve_node_module_missing() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
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

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
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

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
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

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
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
    fn test_resolve_vertz_test_specifier() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("@vertz/test", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.as_str(), "vertz:test");
    }

    #[test]
    fn test_resolve_bun_test_specifier() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("bun:test", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        let resolved = result.unwrap();
        assert_eq!(resolved.as_str(), "vertz:test");
    }

    #[test]
    fn test_load_vertz_test_module() {
        let tmp = create_temp_dir();
        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let specifier = ModuleSpecifier::parse("vertz:test").unwrap();
        let response = loader.load(&specifier, None, false, RequestedModuleType::None);

        match response {
            ModuleLoadResponse::Sync(Ok(source)) => match &source.code {
                deno_core::ModuleSourceCode::String(code) => {
                    let code_str = code.as_str();
                    assert!(
                        code_str.contains("__vertz_test_exports"),
                        "Should reference test harness exports"
                    );
                    assert!(code_str.contains("export"), "Should have export statements");
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

    // --- Phase 5a: node:* synthetic module resolution ---

    #[test]
    fn test_resolve_node_path() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("node:path", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), NODE_PATH_SPECIFIER);
    }

    #[test]
    fn test_resolve_node_os() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("node:os", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), NODE_OS_SPECIFIER);
    }

    #[test]
    fn test_resolve_node_url() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("node:url", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), NODE_URL_SPECIFIER);
    }

    #[test]
    fn test_resolve_node_events() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("node:events", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), NODE_EVENTS_SPECIFIER);
    }

    #[test]
    fn test_resolve_node_process() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("node:process", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), NODE_PROCESS_SPECIFIER);
    }

    #[test]
    fn test_resolve_bare_path_maps_to_node_path() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        // bare "path" (without node: prefix) should also resolve
        let result = loader.resolve("path", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), NODE_PATH_SPECIFIER);
    }

    #[test]
    fn test_load_node_path_module() {
        let tmp = create_temp_dir();
        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let specifier = ModuleSpecifier::parse(NODE_PATH_SPECIFIER).unwrap();
        let response = loader.load(&specifier, None, false, RequestedModuleType::None);

        match response {
            ModuleLoadResponse::Sync(Ok(source)) => match &source.code {
                deno_core::ModuleSourceCode::String(code) => {
                    let code_str = code.as_str();
                    assert!(code_str.contains("export const join"), "Should export join");
                    assert!(
                        code_str.contains("export const relative"),
                        "Should export relative"
                    );
                    assert!(
                        code_str.contains("export default"),
                        "Should have default export"
                    );
                }
                _ => panic!("Expected string source code"),
            },
            ModuleLoadResponse::Sync(Err(e)) => panic!("Module load failed: {}", e),
            _ => panic!("Expected synchronous module load"),
        }
    }

    #[test]
    fn test_load_node_events_module() {
        let tmp = create_temp_dir();
        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let specifier = ModuleSpecifier::parse(NODE_EVENTS_SPECIFIER).unwrap();
        let response = loader.load(&specifier, None, false, RequestedModuleType::None);

        match response {
            ModuleLoadResponse::Sync(Ok(source)) => match &source.code {
                deno_core::ModuleSourceCode::String(code) => {
                    let code_str = code.as_str();
                    assert!(
                        code_str.contains("class EventEmitter"),
                        "Should contain EventEmitter class"
                    );
                    assert!(
                        code_str.contains("export { EventEmitter }"),
                        "Should export EventEmitter"
                    );
                }
                _ => panic!("Expected string source code"),
            },
            ModuleLoadResponse::Sync(Err(e)) => panic!("Module load failed: {}", e),
            _ => panic!("Expected synchronous module load"),
        }
    }

    // --- URL canonicalization (#2071) ---

    #[test]
    fn test_resolve_canonicalizes_dotdot_paths() {
        // Given a file imported via a path with .. components
        // When the same file is also imported via a direct path
        // Then both resolve to the same canonical module URL
        let tmp = create_temp_dir();
        let src_dir = tmp.path().join("src");
        let lib_dir = tmp.path().join("src").join("lib");
        std::fs::create_dir_all(&lib_dir).unwrap();

        let main_file = src_dir.join("main.ts");
        let utils_file = lib_dir.join("utils.ts");
        std::fs::write(&main_file, "").unwrap();
        std::fs::write(&utils_file, "export const x = 1;").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();

        // Direct path
        let direct = loader
            .resolve("./lib/utils.ts", referrer.as_str(), ResolutionKind::Import)
            .unwrap();

        // Path with .. components (goes up then back down)
        let dotdot = loader
            .resolve(
                "../src/lib/../lib/utils.ts",
                referrer.as_str(),
                ResolutionKind::Import,
            )
            .unwrap();

        assert_eq!(
            direct, dotdot,
            "Direct and .. paths should resolve to the same URL"
        );
    }

    #[test]
    fn test_resolve_canonicalizes_symlinked_paths() {
        // Given a workspace package symlinked in node_modules
        // When imported via bare specifier and via relative path
        // Then both resolve to the same module URL
        let tmp = create_temp_dir();

        // Create the real package directory
        let real_pkg_dir = tmp.path().join("packages").join("my-lib");
        let real_dist = real_pkg_dir.join("dist");
        std::fs::create_dir_all(&real_dist).unwrap();
        let real_entry = real_dist.join("index.js");
        std::fs::write(&real_entry, "export const x = 1;").unwrap();
        std::fs::write(
            real_pkg_dir.join("package.json"),
            r#"{ "name": "my-lib", "exports": { ".": "./dist/index.js" } }"#,
        )
        .unwrap();

        // Create a symlink in node_modules pointing to the real package
        let nm_dir = tmp.path().join("node_modules").join("my-lib");
        std::fs::create_dir_all(tmp.path().join("node_modules")).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&real_pkg_dir, &nm_dir).unwrap();
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&real_pkg_dir, &nm_dir).unwrap();

        // Create a source file that could import via either path
        let src_file = tmp.path().join("src").join("app.ts");
        std::fs::create_dir_all(tmp.path().join("src")).unwrap();
        std::fs::write(&src_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&src_file).unwrap();

        // Import via bare specifier (goes through node_modules symlink)
        let via_bare = loader
            .resolve("my-lib", referrer.as_str(), ResolutionKind::Import)
            .unwrap();

        // Import via relative path to the real package directory
        let via_relative = loader
            .resolve(
                "../packages/my-lib/dist/index.js",
                referrer.as_str(),
                ResolutionKind::Import,
            )
            .unwrap();

        assert_eq!(
            via_bare, via_relative,
            "Symlink and relative paths to the same file should resolve to the same URL"
        );
    }

    #[test]
    fn test_canonicalize_cached_returns_consistent_results() {
        let tmp = create_temp_dir();
        let file = tmp.path().join("test.js");
        std::fs::write(&file, "export const x = 1;").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());

        let result1 = loader.canonicalize_cached(&file);
        let result2 = loader.canonicalize_cached(&file);

        assert_eq!(
            result1, result2,
            "Cached canonicalization should be consistent"
        );
        // On macOS, /tmp -> /private/tmp, so canonical path may differ from input
        assert!(result1.is_absolute(), "Canonical path should be absolute");
    }

    /// A custom plugin that adds a marker to compiled output, proving
    /// the module loader delegates compilation to the plugin.
    struct MarkerPlugin;

    impl FrameworkPlugin for MarkerPlugin {
        fn name(&self) -> &str {
            "marker"
        }

        fn compile(
            &self,
            _source: &str,
            _ctx: &crate::plugin::CompileContext,
        ) -> crate::plugin::CompileOutput {
            crate::plugin::CompileOutput {
                code: "/* MARKER_PLUGIN_OUTPUT */ export const x = 1;".to_string(),
                css: None,
                source_map: None,
                diagnostics: vec![],
                mocked_specifiers: std::collections::HashSet::new(),
                mock_preamble: None,
            }
        }

        fn hmr_client_scripts(&self) -> Vec<crate::plugin::ClientScript> {
            vec![]
        }
    }

    #[test]
    fn test_compile_delegates_to_plugin() {
        let tmp = create_temp_dir();
        let ts_file = tmp.path().join("test.ts");
        std::fs::write(&ts_file, "const x: number = 42; export { x };").unwrap();

        let plugin: std::sync::Arc<dyn FrameworkPlugin> = std::sync::Arc::new(MarkerPlugin);
        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), plugin);
        let specifier = ModuleSpecifier::from_file_path(&ts_file).unwrap();
        let response = loader.load(&specifier, None, false, RequestedModuleType::None);

        match response {
            ModuleLoadResponse::Sync(Ok(source)) => match &source.code {
                deno_core::ModuleSourceCode::String(code) => {
                    assert!(
                        code.as_str().contains("MARKER_PLUGIN_OUTPUT"),
                        "Module loader should delegate compilation to the plugin, got: {}",
                        code.as_str()
                    );
                }
                _ => panic!("Expected string source code"),
            },
            ModuleLoadResponse::Sync(Err(e)) => panic!("Module load failed: {}", e),
            _ => panic!("Expected synchronous module load"),
        }
    }

    // --- Package imports (#specifier) resolution ---

    #[test]
    fn test_resolve_package_imports_string_value() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("src").join("main.js");
        let target_file = tmp
            .path()
            .join(".vertz")
            .join("generated")
            .join("client.ts");
        std::fs::create_dir_all(tmp.path().join("src")).unwrap();
        std::fs::create_dir_all(tmp.path().join(".vertz").join("generated")).unwrap();
        std::fs::write(&main_file, "").unwrap();
        std::fs::write(&target_file, "export const api = {};").unwrap();
        std::fs::write(
            tmp.path().join("package.json"),
            r##"{ "imports": { "#generated": "./.vertz/generated/client.ts" } }"##,
        )
        .unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("#generated", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok(), "Failed: {:?}", result.err());
        assert_eq!(result.unwrap().to_file_path().unwrap(), canon(&target_file));
    }

    #[test]
    fn test_resolve_package_imports_condition_map() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        let target_file = tmp.path().join("src").join("utils.js");
        std::fs::create_dir_all(tmp.path().join("src")).unwrap();
        std::fs::write(&main_file, "").unwrap();
        std::fs::write(&target_file, "export const x = 1;").unwrap();
        std::fs::write(
            tmp.path().join("package.json"),
            r##"{ "imports": { "#utils": { "import": "./src/utils.js", "default": "./src/utils.cjs" } } }"##,
        )
        .unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("#utils", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_ok(), "Failed: {:?}", result.err());
        assert_eq!(result.unwrap().to_file_path().unwrap(), canon(&target_file));
    }

    #[test]
    fn test_resolve_package_imports_walks_up_directories() {
        let tmp = create_temp_dir();
        // File is in a subdirectory, package.json is at root
        let sub_dir = tmp.path().join("src").join("api");
        std::fs::create_dir_all(&sub_dir).unwrap();
        let main_file = sub_dir.join("handler.js");
        let target_file = tmp.path().join("generated").join("types.ts");
        std::fs::create_dir_all(tmp.path().join("generated")).unwrap();
        std::fs::write(&main_file, "").unwrap();
        std::fs::write(&target_file, "export type Foo = {};").unwrap();
        std::fs::write(
            tmp.path().join("package.json"),
            r##"{ "imports": { "#generated/types": "./generated/types.ts" } }"##,
        )
        .unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve(
            "#generated/types",
            referrer.as_str(),
            ResolutionKind::Import,
        );
        assert!(result.is_ok(), "Failed: {:?}", result.err());
        assert_eq!(result.unwrap().to_file_path().unwrap(), canon(&target_file));
    }

    #[test]
    fn test_resolve_package_imports_missing_specifier() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();
        std::fs::write(
            tmp.path().join("package.json"),
            r##"{ "imports": { "#foo": "./foo.ts" } }"##,
        )
        .unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("#bar", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("Cannot resolve package import '#bar'"),
            "Error: {}",
            err
        );
    }

    #[test]
    fn test_resolve_package_imports_no_imports_field() {
        let tmp = create_temp_dir();
        let main_file = tmp.path().join("main.js");
        std::fs::write(&main_file, "").unwrap();
        std::fs::write(tmp.path().join("package.json"), r#"{ "name": "my-pkg" }"#).unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve("#missing", referrer.as_str(), ResolutionKind::Import);
        assert!(result.is_err());
    }

    #[test]
    fn test_resolve_imports_mapping_string() {
        let value = serde_json::json!("./src/foo.ts");
        assert_eq!(
            resolve_imports_mapping(&value),
            Some("./src/foo.ts".to_string())
        );
    }

    #[test]
    fn test_resolve_imports_mapping_conditions() {
        let value = serde_json::json!({
            "import": "./src/foo.mjs",
            "default": "./src/foo.cjs"
        });
        assert_eq!(
            resolve_imports_mapping(&value),
            Some("./src/foo.mjs".to_string())
        );
    }

    /// Bare ".." import should resolve to the parent directory's index file,
    /// NOT fall through to node_modules resolution (which would find
    /// package.json and resolve to dist/ instead of src/).
    #[test]
    fn test_resolve_bare_dotdot_as_relative() {
        let tmp = create_temp_dir();
        // Create: src/index.ts and src/__tests__/test.ts
        let src_dir = tmp.path().join("src");
        let tests_dir = src_dir.join("__tests__");
        std::fs::create_dir_all(&tests_dir).unwrap();

        let index_file = src_dir.join("index.ts");
        let test_file = tests_dir.join("test.ts");

        std::fs::write(&index_file, "export const x = 1;").unwrap();
        std::fs::write(&test_file, "import { x } from '..';").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&test_file).unwrap();
        let result = loader.resolve("..", referrer.as_str(), ResolutionKind::Import);

        assert!(result.is_ok(), "resolve('..') should succeed: {:?}", result);
        let resolved = result.unwrap();
        assert_eq!(
            resolved.to_file_path().unwrap(),
            canon(&index_file),
            "bare '..' should resolve to parent directory's index.ts, not dist/"
        );
    }

    /// Bare "." import should resolve to the current directory's index file.
    #[test]
    fn test_resolve_bare_dot_as_relative() {
        let tmp = create_temp_dir();
        let index_file = tmp.path().join("index.ts");
        let main_file = tmp.path().join("main.ts");

        std::fs::write(&index_file, "export const x = 1;").unwrap();
        std::fs::write(&main_file, "import { x } from '.';").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&main_file).unwrap();
        let result = loader.resolve(".", referrer.as_str(), ResolutionKind::Import);

        assert!(result.is_ok(), "resolve('.') should succeed: {:?}", result);
        let resolved = result.unwrap();
        assert_eq!(
            resolved.to_file_path().unwrap(),
            canon(&index_file),
            "bare '.' should resolve to current directory's index.ts"
        );
    }

    /// When a package has node_modules AND src/index.ts, bare ".."
    /// from src/__tests__/ must resolve to src/index.ts (not dist/).
    #[test]
    fn test_resolve_bare_dotdot_prefers_source_over_dist() {
        let tmp = create_temp_dir();

        // Create package structure with both src/ and dist/
        let src_dir = tmp.path().join("src");
        let tests_dir = src_dir.join("__tests__");
        let dist_dir = tmp.path().join("dist");
        let nm_dir = tmp.path().join("node_modules");

        std::fs::create_dir_all(&tests_dir).unwrap();
        std::fs::create_dir_all(&dist_dir).unwrap();
        std::fs::create_dir_all(&nm_dir).unwrap();

        std::fs::write(src_dir.join("index.ts"), "export const x = 1;").unwrap();
        std::fs::write(dist_dir.join("index.js"), "export const x = 1;").unwrap();
        std::fs::write(
            tmp.path().join("package.json"),
            r#"{"name":"test-pkg","main":"dist/index.js","exports":{".":{"import":"./dist/index.js"}}}"#,
        )
        .unwrap();

        let test_file = tests_dir.join("test.ts");
        std::fs::write(&test_file, "import { x } from '..';").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&test_file).unwrap();
        let result = loader.resolve("..", referrer.as_str(), ResolutionKind::Import);

        assert!(result.is_ok(), "resolve('..') should succeed: {:?}", result);
        let resolved = result.unwrap();
        // Must resolve to src/index.ts, not dist/index.js
        assert_eq!(
            resolved.to_file_path().unwrap(),
            canon(&src_dir.join("index.ts")),
            "bare '..' from __tests__ must resolve to src/index.ts, not package.json exports"
        );
    }

    // ── build_newline_index tests ──

    #[test]
    fn test_build_newline_index_multiline() {
        // "abc\ndef\nghi" has newlines at byte 3 and 7
        assert_eq!(build_newline_index("abc\ndef\nghi"), vec![3, 7]);
    }

    #[test]
    fn test_build_newline_index_empty() {
        assert_eq!(build_newline_index(""), Vec::<u32>::new());
    }

    #[test]
    fn test_build_newline_index_no_newlines() {
        assert_eq!(build_newline_index("no newlines"), Vec::<u32>::new());
    }

    #[test]
    fn test_build_newline_index_trailing_newline() {
        // "abc\n" has one newline at byte 3
        assert_eq!(build_newline_index("abc\n"), vec![3]);
    }

    #[test]
    fn test_build_newline_index_only_newlines() {
        assert_eq!(build_newline_index("\n\n\n"), vec![0, 1, 2]);
    }

    // --- Self-referencing package imports (#2145) ---

    #[test]
    fn test_self_reference_main_entry_resolves_to_source() {
        // Given a workspace package with exports pointing to dist/
        // When a test file inside the package imports its own package name
        // Then it resolves to the source entry point (not dist)
        let tmp = create_temp_dir();

        // Create the package structure (no dist/ built)
        let pkg_dir = tmp.path().join("packages").join("my-lib");
        let src_dir = pkg_dir.join("src");
        std::fs::create_dir_all(&src_dir).unwrap();

        let src_entry = src_dir.join("index.ts");
        std::fs::write(&src_entry, "export const x = 1;").unwrap();

        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{ "name": "@scope/my-lib", "exports": { ".": { "import": "./dist/src/index.js" } } }"#,
        )
        .unwrap();

        // Create a test file inside the package
        let test_dir = src_dir.join("__tests__");
        std::fs::create_dir_all(&test_dir).unwrap();
        let test_file = test_dir.join("foo.test.ts");
        std::fs::write(&test_file, "import '@scope/my-lib';").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&test_file).unwrap();
        let result = loader.resolve("@scope/my-lib", referrer.as_str(), ResolutionKind::Import);

        assert!(
            result.is_ok(),
            "Self-reference should resolve: {:?}",
            result
        );
        assert_eq!(result.unwrap().to_file_path().unwrap(), canon(&src_entry));
    }

    #[test]
    fn test_self_reference_subpath_resolves_to_source() {
        // Given a workspace package with subpath exports pointing to dist/
        // When a test file inside the package imports a subpath of its own package
        // Then it resolves to the source file for that subpath
        let tmp = create_temp_dir();

        let pkg_dir = tmp.path().join("packages").join("my-lib");
        let src_dir = pkg_dir.join("src");
        std::fs::create_dir_all(&src_dir).unwrap();

        let internals_file = src_dir.join("internals.ts");
        std::fs::write(&internals_file, "export const y = 2;").unwrap();

        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{ "name": "@scope/my-lib", "exports": { "./internals": { "import": "./dist/src/internals.js" } } }"#,
        )
        .unwrap();

        let test_dir = src_dir.join("__tests__");
        std::fs::create_dir_all(&test_dir).unwrap();
        let test_file = test_dir.join("foo.test.ts");
        std::fs::write(&test_file, "import '@scope/my-lib/internals';").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&test_file).unwrap();
        let result = loader.resolve(
            "@scope/my-lib/internals",
            referrer.as_str(),
            ResolutionKind::Import,
        );

        assert!(
            result.is_ok(),
            "Self-reference subpath should resolve: {:?}",
            result
        );
        assert_eq!(
            result.unwrap().to_file_path().unwrap(),
            canon(&internals_file)
        );
    }

    #[test]
    fn test_self_reference_with_dist_prefers_dist() {
        // Given a workspace package with dist/ already built
        // When a test file imports its own package
        // Then it resolves to the dist entry (normal behavior)
        let tmp = create_temp_dir();

        let pkg_dir = tmp.path().join("packages").join("my-lib");
        let src_dir = pkg_dir.join("src");
        let dist_dir = pkg_dir.join("dist").join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::create_dir_all(&dist_dir).unwrap();

        std::fs::write(src_dir.join("index.ts"), "export const x = 1;").unwrap();
        let dist_entry = dist_dir.join("index.js");
        std::fs::write(&dist_entry, "export const x = 1;").unwrap();

        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{ "name": "@scope/my-lib", "exports": { ".": { "import": "./dist/src/index.js" } } }"#,
        )
        .unwrap();

        let test_dir = src_dir.join("__tests__");
        std::fs::create_dir_all(&test_dir).unwrap();
        let test_file = test_dir.join("foo.test.ts");
        std::fs::write(&test_file, "").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&test_file).unwrap();
        let result = loader.resolve("@scope/my-lib", referrer.as_str(), ResolutionKind::Import);

        assert!(result.is_ok());
        assert_eq!(result.unwrap().to_file_path().unwrap(), canon(&dist_entry));
    }

    #[test]
    fn test_cross_package_import_not_affected() {
        // Given two workspace packages
        // When one package imports the other (not a self-reference)
        // Then normal node_modules resolution is used (not self-reference)
        let tmp = create_temp_dir();

        // Package A
        let pkg_a = tmp.path().join("packages").join("pkg-a");
        let pkg_a_src = pkg_a.join("src");
        std::fs::create_dir_all(&pkg_a_src).unwrap();
        std::fs::write(pkg_a_src.join("index.ts"), "").unwrap();
        std::fs::write(pkg_a.join("package.json"), r#"{ "name": "@scope/pkg-a" }"#).unwrap();

        // Package B (installed in node_modules)
        let nm_pkg_b = tmp.path().join("node_modules").join("@scope").join("pkg-b");
        std::fs::create_dir_all(&nm_pkg_b).unwrap();
        let pkg_b_entry = nm_pkg_b.join("index.js");
        std::fs::write(&pkg_b_entry, "export const b = 1;").unwrap();
        std::fs::write(
            nm_pkg_b.join("package.json"),
            r#"{ "name": "@scope/pkg-b", "main": "index.js" }"#,
        )
        .unwrap();

        let test_file = pkg_a_src.join("app.test.ts");
        std::fs::write(&test_file, "import '@scope/pkg-b';").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&test_file).unwrap();
        let result = loader.resolve("@scope/pkg-b", referrer.as_str(), ResolutionKind::Import);

        assert!(
            result.is_ok(),
            "Cross-package import should resolve via node_modules"
        );
        assert_eq!(result.unwrap().to_file_path().unwrap(), canon(&pkg_b_entry));
    }

    #[test]
    fn test_self_reference_exports_without_src_in_dist_path() {
        // Given a package with exports: "./dist/index.js" (no src/ in dist path)
        // When the source is at src/index.ts
        // Then self-reference resolves to source
        let tmp = create_temp_dir();

        let pkg_dir = tmp.path().join("packages").join("my-server");
        let src_dir = pkg_dir.join("src");
        std::fs::create_dir_all(&src_dir).unwrap();

        let src_entry = src_dir.join("index.ts");
        std::fs::write(&src_entry, "export const x = 1;").unwrap();

        std::fs::write(
            pkg_dir.join("package.json"),
            r#"{ "name": "@scope/server", "exports": { ".": { "import": "./dist/index.js" } } }"#,
        )
        .unwrap();

        let test_dir = src_dir.join("__tests__");
        std::fs::create_dir_all(&test_dir).unwrap();
        let test_file = test_dir.join("app.test.ts");
        std::fs::write(&test_file, "import '@scope/server';").unwrap();

        let loader = VertzModuleLoader::new(&tmp.path().to_string_lossy(), test_plugin());
        let referrer = ModuleSpecifier::from_file_path(&test_file).unwrap();
        let result = loader.resolve("@scope/server", referrer.as_str(), ResolutionKind::Import);

        assert!(
            result.is_ok(),
            "Self-reference with ./dist/index.js exports should resolve: {:?}",
            result
        );
        assert_eq!(result.unwrap().to_file_path().unwrap(), canon(&src_entry));
    }

    // ---------------------------------------------------------------
    // has_esm_syntax tests
    // ---------------------------------------------------------------

    #[test]
    fn test_has_esm_syntax_export_default() {
        assert!(has_esm_syntax("export default function foo() {}"));
    }

    #[test]
    fn test_has_esm_syntax_named_export() {
        assert!(has_esm_syntax("export { foo };"));
    }

    #[test]
    fn test_has_esm_syntax_import_statement() {
        assert!(has_esm_syntax("import { bar } from 'baz';"));
    }

    #[test]
    fn test_has_esm_syntax_import_brace() {
        assert!(has_esm_syntax("import{bar} from 'baz';"));
    }

    #[test]
    fn test_has_esm_syntax_no_esm() {
        assert!(!has_esm_syntax("const x = 1;\nmodule.exports = x;\n"));
    }

    #[test]
    fn test_has_esm_syntax_skips_single_line_comment() {
        assert!(!has_esm_syntax("// export default 42\nconst x = 1;"));
    }

    #[test]
    fn test_has_esm_syntax_skips_block_comment() {
        assert!(!has_esm_syntax(
            "/* export default 42\nexport { foo } */\nconst x = 1;"
        ));
    }

    #[test]
    fn test_has_esm_syntax_after_block_comment() {
        assert!(has_esm_syntax("/* comment */\nexport default 42;"));
    }

    #[test]
    fn test_has_esm_syntax_inline_block_comment_then_esm() {
        // Block comment ends on same line, ESM follows
        assert!(has_esm_syntax("/* comment */ export default 42;"));
    }

    // ---------------------------------------------------------------
    // is_cjs_module_cached tests
    // ---------------------------------------------------------------

    #[test]
    fn test_cjs_detection_cjs_extension() {
        let path = Path::new("/tmp/foo.cjs");
        assert!(is_cjs_module_cached(path, "", None));
    }

    #[test]
    fn test_cjs_detection_mjs_extension() {
        let path = Path::new("/tmp/foo.mjs");
        assert!(!is_cjs_module_cached(path, "", None));
    }

    #[test]
    fn test_cjs_detection_js_with_type_module() {
        let tmp = create_temp_dir();
        std::fs::write(tmp.path().join("package.json"), r#"{ "type": "module" }"#).unwrap();
        let js_path = tmp.path().join("index.js");
        std::fs::write(&js_path, "module.exports = 1;").unwrap();
        assert!(!is_cjs_module_cached(&js_path, "module.exports = 1;", None));
    }

    #[test]
    fn test_cjs_detection_js_with_type_commonjs() {
        let tmp = create_temp_dir();
        std::fs::write(tmp.path().join("package.json"), r#"{ "type": "commonjs" }"#).unwrap();
        let js_path = tmp.path().join("index.js");
        std::fs::write(&js_path, "export default 1;").unwrap();
        assert!(is_cjs_module_cached(&js_path, "export default 1;", None));
    }

    #[test]
    fn test_cjs_detection_js_no_package_json_cjs_source() {
        let tmp = create_temp_dir();
        let js_path = tmp.path().join("index.js");
        std::fs::write(&js_path, "module.exports = { foo: 1 };").unwrap();
        // No package.json → falls back to source heuristic
        assert!(is_cjs_module_cached(
            &js_path,
            "module.exports = { foo: 1 };",
            None
        ));
    }

    #[test]
    fn test_cjs_detection_js_no_package_json_esm_source() {
        let tmp = create_temp_dir();
        let js_path = tmp.path().join("index.js");
        std::fs::write(&js_path, "export default 1;").unwrap();
        // No package.json → source has ESM syntax → not CJS
        assert!(!is_cjs_module_cached(&js_path, "export default 1;", None));
    }

    #[test]
    fn test_cjs_detection_uses_cache() {
        let tmp = create_temp_dir();
        std::fs::write(tmp.path().join("package.json"), r#"{ "type": "module" }"#).unwrap();
        let js_path = tmp.path().join("index.js");
        std::fs::write(&js_path, "").unwrap();

        let cache: RefCell<HashMap<PathBuf, Option<bool>>> = RefCell::new(HashMap::new());
        // First call populates cache
        assert!(!is_cjs_module_cached(&js_path, "", Some(&cache)));
        assert!(!cache.borrow().is_empty());

        // Cache should contain the directory with Some(true) = ESM
        let has_entry = cache.borrow().values().any(|v| *v == Some(true));
        assert!(has_entry, "Cache should contain ESM entry");

        // Second call uses cache (even if we delete the package.json)
        std::fs::remove_file(tmp.path().join("package.json")).unwrap();
        // Reset the file for a clean re-read (source has no ESM syntax, so without
        // cache it would think CJS because package.json is gone)
        assert!(!is_cjs_module_cached(&js_path, "", Some(&cache)));
    }

    // ---------------------------------------------------------------
    // wrap_cjs_module tests
    // ---------------------------------------------------------------

    #[test]
    fn test_wrap_cjs_module_has_default_export() {
        let path = Path::new("/tmp/test/foo.js");
        let result = wrap_cjs_module("module.exports = 42;", path);
        assert!(result.contains("export default __cjs_exports;"));
    }

    #[test]
    fn test_wrap_cjs_module_provides_filename() {
        let path = Path::new("/tmp/test/foo.js");
        let result = wrap_cjs_module("", path);
        assert!(result.contains("__filename"));
        assert!(result.contains("/tmp/test/foo.js"));
    }

    #[test]
    fn test_wrap_cjs_module_provides_dirname() {
        let path = Path::new("/tmp/test/foo.js");
        let result = wrap_cjs_module("", path);
        assert!(result.contains("__dirname"));
        assert!(result.contains("/tmp/test"));
    }

    #[test]
    fn test_wrap_cjs_module_provides_require() {
        let path = Path::new("/tmp/test/foo.js");
        let result = wrap_cjs_module("", path);
        assert!(result.contains("var require = globalThis.__vtz_cjs_require("));
    }

    #[test]
    fn test_wrap_cjs_module_preserves_source() {
        let path = Path::new("/tmp/test/foo.js");
        let src = "const x = 1;\nmodule.exports = x;";
        let result = wrap_cjs_module(src, path);
        assert!(result.contains(src));
    }

    // ---------------------------------------------------------------
    // Named CJS export extraction
    // ---------------------------------------------------------------

    #[test]
    fn test_extract_cjs_named_exports_object_literal() {
        let names = extract_cjs_named_exports("module.exports = { foo, bar };");
        assert_eq!(names, vec!["bar", "foo"]);
    }

    #[test]
    fn test_extract_cjs_named_exports_key_value_pairs() {
        let names = extract_cjs_named_exports("module.exports = { foo: 1, bar: fn };");
        assert_eq!(names, vec!["bar", "foo"]);
    }

    #[test]
    fn test_extract_cjs_named_exports_mixed_shorthand_and_kv() {
        let names = extract_cjs_named_exports("module.exports = { foo, bar: 2, baz };");
        assert_eq!(names, vec!["bar", "baz", "foo"]);
    }

    #[test]
    fn test_extract_cjs_named_exports_multiline() {
        let src = "\
const foo = 1;
const bar = 2;
module.exports = {
  foo,
  bar,
};";
        let names = extract_cjs_named_exports(src);
        assert_eq!(names, vec!["bar", "foo"]);
    }

    #[test]
    fn test_extract_cjs_named_exports_non_object_returns_empty() {
        // module.exports = someValue (not an object literal)
        let names = extract_cjs_named_exports("module.exports = 42;");
        assert!(names.is_empty());
    }

    #[test]
    fn test_extract_cjs_named_exports_dynamic_assignment_returns_empty() {
        let src = "\
if (condition) {
  module.exports = { a: 1 };
} else {
  module.exports = { b: 2 };
}";
        let names = extract_cjs_named_exports(src);
        assert!(names.is_empty());
    }

    #[test]
    fn test_extract_cjs_named_exports_exports_dot_pattern() {
        let src = "\
exports.foo = 1;
exports.bar = fn;";
        let names = extract_cjs_named_exports(src);
        assert_eq!(names, vec!["bar", "foo"]);
    }

    #[test]
    fn test_extract_cjs_named_exports_skips_default_keyword() {
        // "default" is a reserved word, should not be emitted as named export
        let names = extract_cjs_named_exports("module.exports = { default: main, foo };");
        assert_eq!(names, vec!["foo"]);
    }

    #[test]
    fn test_wrap_cjs_module_emits_named_reexports() {
        let path = Path::new("/tmp/test/pkg.js");
        let src = "module.exports = { foo, bar };";
        let result = wrap_cjs_module(src, path);
        assert!(result.contains("export default __cjs_exports;"));
        // Named re-exports destructure from __cjs_exports
        assert!(
            result.contains("export const { bar, foo } = __cjs_exports;"),
            "Expected named re-exports, got:\n{}",
            result
        );
    }

    #[test]
    fn test_wrap_cjs_module_no_named_exports_for_non_object() {
        let path = Path::new("/tmp/test/pkg.js");
        let src = "module.exports = 42;";
        let result = wrap_cjs_module(src, path);
        assert!(result.contains("export default __cjs_exports;"));
        assert!(
            !result.contains("export const {"),
            "Should not have named re-exports for non-object export"
        );
    }

    // --- Review-driven edge case tests ---

    #[test]
    fn test_extract_cjs_named_exports_module_exports_property_assignment() {
        // module.exports.foo = ... should be treated like exports.foo = ...
        let src = "\
module.exports.foo = 1;
module.exports.bar = fn;";
        let names = extract_cjs_named_exports(src);
        assert_eq!(names, vec!["bar", "foo"]);
    }

    #[test]
    fn test_extract_cjs_named_exports_nested_object_no_spurious_keys() {
        // Nested object properties should NOT leak as top-level export names
        let names = extract_cjs_named_exports("module.exports = { foo: { a: 1, b: 2 }, bar };");
        assert_eq!(names, vec!["bar", "foo"]);
    }

    #[test]
    fn test_extract_cjs_named_exports_string_keys() {
        // Quoted keys that are valid identifiers should be extracted
        let names = extract_cjs_named_exports("module.exports = { \"foo\": 1, 'bar': 2 };");
        assert_eq!(names, vec!["bar", "foo"]);
    }

    #[test]
    fn test_extract_cjs_named_exports_comparison_not_counted() {
        // `module.exports === ...` should not be counted as an assignment
        let src = "\
if (module.exports === null) {}
module.exports = { foo: 1 };";
        let names = extract_cjs_named_exports(src);
        assert_eq!(names, vec!["foo"]);
    }

    #[test]
    fn test_extract_cjs_named_exports_spread_ignored() {
        // Spread syntax should be silently skipped (can't statically analyze)
        let names = extract_cjs_named_exports("module.exports = { ...base, foo, bar };");
        assert_eq!(names, vec!["bar", "foo"]);
    }
}
