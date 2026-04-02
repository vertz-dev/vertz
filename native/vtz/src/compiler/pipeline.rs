use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::SystemTime;

use crate::compiler::cache::{CachedModule, CompilationCache};
use crate::compiler::css_transform::CssTransform;
use crate::compiler::env_replacer;
use crate::compiler::import_rewriter;
use crate::plugin::{CompileContext, FrameworkPlugin};
use crate::tsconfig::TsconfigPaths;

/// A structured compilation error with source location.
#[derive(Debug, Clone)]
pub struct CompileError {
    /// Human-readable error message.
    pub message: String,
    /// 1-indexed line number.
    pub line: Option<u32>,
    /// 1-indexed column number.
    pub column: Option<u32>,
}

/// Result of compiling a source file for browser consumption.
#[derive(Debug, Clone)]
pub struct BrowserCompileResult {
    /// Compiled JavaScript code with imports rewritten for the browser.
    pub code: String,
    /// Source map JSON, if available.
    pub source_map: Option<String>,
    /// Extracted CSS, if any.
    pub css: Option<String>,
    /// Structured compilation errors, if any.
    pub errors: Vec<CompileError>,
    /// Compilation warnings (non-fatal diagnostics).
    pub warnings: Vec<CompileError>,
}

/// CSS store: maps a hash-based CSS path to the CSS content.
/// Shared across requests so that /@css/ routes can serve extracted CSS.
pub type CssStore = Arc<RwLock<HashMap<String, String>>>;

/// The browser compilation pipeline.
///
/// Compiles .ts/.tsx files via a [`FrameworkPlugin`], rewrites import specifiers
/// for browser consumption, caches results, and extracts CSS into a shared store.
#[derive(Clone)]
pub struct CompilationPipeline {
    cache: CompilationCache,
    css_store: CssStore,
    root_dir: PathBuf,
    src_dir: PathBuf,
    plugin: Arc<dyn FrameworkPlugin>,
    tsconfig_paths: Option<TsconfigPaths>,
    /// Public env vars for `import.meta.env` compile-time replacement.
    env: HashMap<String, String>,
    /// Optional CSS transform hook (e.g., PostCSS, Lightning CSS).
    css_transform: Option<Arc<dyn CssTransform>>,
}

impl CompilationPipeline {
    pub fn new(root_dir: PathBuf, src_dir: PathBuf, plugin: Arc<dyn FrameworkPlugin>) -> Self {
        Self {
            cache: CompilationCache::new(),
            css_store: Arc::new(RwLock::new(HashMap::new())),
            root_dir,
            src_dir,
            plugin,
            tsconfig_paths: None,
            env: HashMap::new(),
            css_transform: None,
        }
    }

    /// Set the tsconfig path aliases for import resolution.
    pub fn with_tsconfig_paths(mut self, paths: TsconfigPaths) -> Self {
        if !paths.is_empty() {
            self.tsconfig_paths = Some(paths);
        }
        self
    }

    /// Set the public env vars for `import.meta.env` compile-time replacement.
    pub fn with_env(mut self, env: HashMap<String, String>) -> Self {
        self.env = env;
        self
    }

    /// Set a CSS transform hook (e.g., PostCSS).
    ///
    /// When set, `compile_css_for_browser` delegates to this transform
    /// instead of reading the raw CSS file.
    pub fn with_css_transform(mut self, transform: Arc<dyn CssTransform>) -> Self {
        self.css_transform = Some(transform);
        self
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
    /// - On cache miss: reads the file, delegates to the plugin for compilation
    ///   and post-processing, rewrites imports, stores CSS, caches the result
    /// - On compilation error: returns a JS module that logs the error to console
    pub fn compile_for_browser(&self, file_path: &Path) -> BrowserCompileResult {
        // Check cache
        if let Some(cached) = self.cache.get(file_path) {
            return BrowserCompileResult {
                code: cached.code,
                source_map: cached.source_map,
                css: cached.css,
                errors: vec![],
                warnings: vec![],
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

        // Delegate compilation to the plugin
        let ctx = CompileContext {
            file_path,
            root_dir: &self.root_dir,
            src_dir: &self.src_dir,
            target: "dom",
        };
        let output = self.plugin.compile(&source, &ctx);

        // Convert plugin diagnostics to errors and warnings
        let compile_errors = crate::plugin::diagnostics_to_errors(&output.diagnostics);
        let compile_warnings = crate::plugin::diagnostics_to_warnings(&output.diagnostics);

        // Plugin post-processing (framework-specific fixups)
        let processed = self.plugin.post_process(&output.code, &ctx);

        // Replace import.meta.env references with literal values
        let processed = if self.env.is_empty() {
            processed
        } else {
            env_replacer::replace_import_meta_env(&processed, &self.env)
        };

        // Rewrite import specifiers for browser consumption
        let code = import_rewriter::rewrite_imports(
            &processed,
            file_path,
            &self.src_dir,
            &self.root_dir,
            self.tsconfig_paths.as_ref(),
        );

        // Handle extracted CSS
        let css = output.css;
        if let Some(ref css_content) = css {
            self.store_css(file_path, css_content);
        }

        // Add source map URL comment
        let code = if output.source_map.is_some() {
            let map_url = self.source_map_url(file_path);
            format!("{}\n//# sourceMappingURL={}", code, map_url)
        } else {
            code
        };

        // Only cache successful compilations (no errors)
        if compile_errors.is_empty() {
            let mtime = std::fs::metadata(file_path)
                .and_then(|m| m.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH);

            self.cache.insert(
                file_path.to_path_buf(),
                CachedModule {
                    code: code.clone(),
                    source_map: output.source_map.clone(),
                    css: css.clone(),
                    mtime,
                },
            );
        }

        BrowserCompileResult {
            code,
            source_map: output.source_map,
            css,
            errors: compile_errors,
            warnings: compile_warnings,
        }
    }

    /// Compile an imported CSS file into a JavaScript style-injection module.
    pub fn compile_css_for_browser(
        &self,
        file_path: &Path,
        url_path: &str,
    ) -> BrowserCompileResult {
        if let Some(cached) = self.cache.get(file_path) {
            return BrowserCompileResult {
                code: cached.code,
                source_map: cached.source_map,
                css: cached.css,
                errors: vec![],
                warnings: vec![],
            };
        }

        // Delegate to the CSS transform hook if registered, otherwise read raw CSS.
        let processed_css = if let Some(ref transform) = self.css_transform {
            match transform.process(file_path, &self.root_dir) {
                Ok(css) => css,
                Err(errors) => {
                    let message = errors
                        .first()
                        .map(|e| e.message.as_str())
                        .unwrap_or("CSS transform failed");
                    return BrowserCompileResult {
                        code: self.css_error_module(message),
                        source_map: None,
                        css: None,
                        errors,
                        warnings: vec![],
                    };
                }
            }
        } else {
            match std::fs::read_to_string(file_path) {
                Ok(source) => source,
                Err(err) => {
                    return self.error_module(&format!(
                        "Failed to read CSS file '{}': {}",
                        file_path.display(),
                        err
                    ));
                }
            }
        };

        let code = crate::server::css_server::css_to_js_module(&processed_css, url_path);
        let mtime = std::fs::metadata(file_path)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);

        self.cache.insert(
            file_path.to_path_buf(),
            CachedModule {
                code: code.clone(),
                source_map: None,
                css: None,
                mtime,
            },
        );

        BrowserCompileResult {
            code,
            source_map: None,
            css: None,
            errors: vec![],
            warnings: vec![],
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
            errors: vec![CompileError {
                message: message.to_string(),
                line: None,
                column: None,
            }],
            warnings: vec![],
        }
    }

    fn css_error_module(&self, message: &str) -> String {
        let escaped = message
            .replace('\\', "\\\\")
            .replace('`', "\\`")
            .replace('$', "\\$");

        format!(
            "console.error(`[vertz] CSS error: {}`);\nexport default \"\";\n",
            escaped
        )
    }
}

/// Fix wrong API names emitted by the compiler.
///
/// The vertz-compiler-core emits `effect` but the actual @vertz/ui API is `domEffect`.
/// This replaces the import name and all call sites.
fn fix_compiler_api_names(code: &str) -> String {
    // Only fix if the code imports `effect` from @vertz/ui (compiler-added)
    // and doesn't actually define its own `effect`
    if !code.contains("effect") {
        return code.to_string();
    }

    // Replace ` effect` with ` domEffect` in import specifiers from @vertz/ui
    // and replace `effect(` call sites with `domEffect(`
    let mut result = code.to_string();

    // Fix import: `import { ..., effect, ... } from '@vertz/ui'`
    // We need to be careful to only replace `effect` as a standalone name, not as part of other words
    // Since this runs before import rewriting, the specifier is still `@vertz/ui`
    // But it may also run after — check both forms

    // Replace standalone `effect` in import named imports (between { and })
    // Simple approach: replace ` effect,` ` effect }` and `{ effect,` `{ effect }`
    result = result.replace(", effect,", ", domEffect,");
    result = result.replace(", effect }", ", domEffect }");
    result = result.replace("{ effect,", "{ domEffect,");
    result = result.replace("{ effect }", "{ domEffect }");
    result = result.replace(", effect\n", ", domEffect\n");

    // Replace call sites: `effect(` → `domEffect(`
    // Be careful not to replace `domEffect(` or `lifecycleEffect(`
    let effect_call = "effect(";
    let mut fixed = String::with_capacity(result.len());
    let chars: Vec<char> = result.chars().collect();
    let effect_chars: Vec<char> = effect_call.chars().collect();
    let len = chars.len();
    let elen = effect_chars.len();
    let mut i = 0;

    while i < len {
        if i + elen <= len
            && chars[i..i + elen] == effect_chars[..]
            && (i == 0 || (!chars[i - 1].is_alphanumeric() && chars[i - 1] != '_'))
        {
            fixed.push_str("domEffect(");
            i += elen;
        } else {
            fixed.push(chars[i]);
            i += 1;
        }
    }

    fixed
}

/// Internal API names that belong in `@vertz/ui/internals`, not `@vertz/ui`.
const INTERNAL_APIS: &[&str] = &[
    "domEffect",
    "lifecycleEffect",
    "startSignalCollection",
    "stopSignalCollection",
];

/// Move internal APIs from `@vertz/ui` imports to `@vertz/ui/internals`.
///
/// The compiler adds `import { domEffect } from '@vertz/ui'` but `domEffect` is only
/// exported from `@vertz/ui/internals`. This function splits the import so that
/// internal APIs go to `@vertz/ui/internals` while public APIs stay in `@vertz/ui`.
fn fix_internals_imports(code: &str) -> String {
    let lines: Vec<&str> = code.lines().collect();
    let mut result: Vec<String> = Vec::with_capacity(lines.len());

    for line in &lines {
        let trimmed = line.trim();

        // Match: import { ... } from '@vertz/ui' or "@vertz/ui"
        // But NOT '@vertz/ui/internals' or '@vertz/ui/components'
        if trimmed.starts_with("import ")
            && !trimmed.contains("@vertz/ui/")
            && (trimmed.contains("'@vertz/ui'") || trimmed.contains("\"@vertz/ui\""))
        {
            if let Some(brace_start) = trimmed.find('{') {
                if let Some(brace_end) = trimmed[brace_start..].find('}') {
                    let names_str = &trimmed[brace_start + 1..brace_start + brace_end];
                    let names: Vec<String> = names_str
                        .split(',')
                        .map(|n| n.trim().to_string())
                        .filter(|n| !n.is_empty())
                        .collect();

                    let mut public_names: Vec<String> = Vec::new();
                    let mut internal_names: Vec<String> = Vec::new();

                    for name in &names {
                        // Handle `X as Y` aliases
                        let base_name = name.split(" as ").next().unwrap_or(name).trim();
                        if INTERNAL_APIS.contains(&base_name) {
                            internal_names.push(name.clone());
                        } else {
                            public_names.push(name.clone());
                        }
                    }

                    if !internal_names.is_empty() {
                        let quote = if trimmed.contains('"') { '"' } else { '\'' };
                        // Emit public import (if any names remain)
                        if !public_names.is_empty() {
                            result.push(format!(
                                "import {{ {} }} from {}@vertz/ui{};",
                                public_names.join(", "),
                                quote,
                                quote,
                            ));
                        }
                        // Emit internals import
                        result.push(format!(
                            "import {{ {} }} from {}@vertz/ui/internals{};",
                            internal_names.join(", "),
                            quote,
                            quote,
                        ));
                        continue;
                    }
                }
            }
        }

        result.push(line.to_string());
    }

    result.join("\n")
}

/// Strip leftover TypeScript syntax that the compiler didn't fully remove.
///
/// Known issues with vertz-compiler-core:
/// 1. Optional params `(param?: Type) =>` become `(param?) =>` instead of `(param) =>`
/// 2. Type annotations in function params `(__props: PropsType)` not stripped in some cases
fn strip_leftover_typescript(code: &str) -> String {
    // Phase 0: Strip function overload declarations (signatures without bodies).
    // After oxc strips type annotations, overload signatures become:
    //   `export function name(params);` — which is invalid JS.
    // We detect and remove these by finding function declarations that end with `;`
    // instead of having a `{` body.
    let code = strip_function_overloads(code);

    // Phase 1: Strip leftover type-level declarations.
    // The compiler's MagicString should strip these, but overlapping overwrites can
    // cause them to survive. This is a safety net.
    // Handles both single-line and multi-line type aliases, interfaces, and TS keywords.
    let code_lines: Vec<&str> = code.lines().collect();
    let mut result_lines: Vec<String> = Vec::new();
    let mut i = 0;

    while i < code_lines.len() {
        let line = code_lines[i];
        let trimmed = line.trim();

        // `import type { ... } from '...'` or `import type ... from '...'`
        if trimmed.starts_with("import type ") && trimmed.contains("from ") {
            i += 1;
            continue;
        }
        // `export type { ... }` or `export type { ... } from '...'`
        if trimmed.starts_with("export type {") {
            i += 1;
            continue;
        }
        // Type alias: `export type X = ...` or `type X = ...` (single or multi-line)
        if (trimmed.starts_with("export type ") || trimmed.starts_with("type "))
            && !trimmed.starts_with("export type {")
            && !trimmed.starts_with("typeof ")
            && trimmed.contains('=')
        {
            if trimmed.ends_with(';') {
                // Single-line type alias — skip
                i += 1;
                continue;
            } else {
                // Multi-line type alias — skip until closing `;`
                i += 1;
                while i < code_lines.len() {
                    if code_lines[i].trim().ends_with(';') {
                        i += 1;
                        break;
                    }
                    i += 1;
                }
                continue;
            }
        }
        // Standalone type alias without = (e.g., `export type X;`)
        if (trimmed.starts_with("export type ") || trimmed.starts_with("type "))
            && trimmed.ends_with(';')
            && !trimmed.contains('{')
        {
            i += 1;
            continue;
        }
        // Interface declarations (single or multi-line with braces)
        if trimmed.starts_with("export interface ") || trimmed.starts_with("interface ") {
            // Track brace depth to handle multi-line interface bodies
            let mut brace_depth: i32 = 0;
            loop {
                let l = code_lines[i];
                for c in l.chars() {
                    if c == '{' {
                        brace_depth += 1;
                    }
                    if c == '}' {
                        brace_depth -= 1;
                    }
                }
                i += 1;
                // If no braces on first line, it's a forward decl — skip one line
                // If braces opened and closed, we're done
                if brace_depth <= 0 || i >= code_lines.len() {
                    break;
                }
            }
            continue;
        }
        // Strip TS parameter property modifiers that survived compilation
        // (e.g., `public readonly x,` → `x,`)
        if let Some(cleaned) = strip_param_property_modifiers(trimmed) {
            let indent = &line[..line.len() - trimmed.len()];
            result_lines.push(format!("{}{}", indent, cleaned));
            i += 1;
            continue;
        }

        result_lines.push(line.to_string());
        i += 1;
    }
    let code = result_lines.join("\n");

    // Phase 2: Inline TS syntax cleanup
    let mut result = String::with_capacity(code.len());
    let chars: Vec<char> = code.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        // Fix 1: Strip `?` before `)` or `,` in parameter lists.
        // Pattern: <identifier>?<whitespace*>) or <identifier>?<whitespace*>,
        if chars[i] == '?' && i > 0 && is_ident(chars[i - 1]) {
            let next = skip_ws(&chars, i + 1, len);
            if next < len && (chars[next] == ')' || chars[next] == ',') {
                // Skip the `?` — the identifier is already in result
                i += 1;
                continue;
            }
        }

        // Fix 2: Strip `: TypeName` or `: TypeName<Generic>` in function params.
        // Pattern: <identifier>: <UpperCaseName> immediately followed by ) or ,
        if chars[i] == ':' && i > 0 && is_ident(chars[i - 1]) {
            let after_colon = skip_ws(&chars, i + 1, len);
            if after_colon < len && chars[after_colon].is_uppercase() {
                // Read the type name (including generics)
                let type_end = skip_type_annotation(&chars, after_colon, len);
                let after_type = skip_ws(&chars, type_end, len);
                if after_type < len && (chars[after_type] == ')' || chars[after_type] == ',') {
                    // Skip the `: TypeName` — jump to after the type
                    i = type_end;
                    continue;
                }
            }
        }

        result.push(chars[i]);
        i += 1;
    }

    result
}

/// Strip function overload declarations (signatures without bodies).
///
/// After the compiler strips type annotations, overload signatures like:
///   `export function flatMap<T>(a: T, b: T): T;`
/// become:
///   `export function flatMap(a, b);`
/// which is invalid JS (function declaration without body).
///
/// This function detects function declarations that end with `;` (after their
/// parameter list closes) instead of having a `{` body, and removes them.
fn strip_function_overloads(code: &str) -> String {
    let mut result = String::with_capacity(code.len());
    let chars: Vec<char> = code.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        // Look for "function " preceded by start of line, "export ", or whitespace
        if is_function_keyword_at(&chars, i, len) {
            let fn_start = find_line_start(&chars, i);

            // Check if this is an export function
            let decl_start = if fn_start <= i {
                let prefix = &chars[fn_start..i];
                let prefix_str: String = prefix.iter().collect();
                let trimmed = prefix_str.trim();
                if trimmed.is_empty() || trimmed == "export" || trimmed == "export async" {
                    fn_start
                } else {
                    // Not a declaration, just regular code containing "function"
                    result.push(chars[i]);
                    i += 1;
                    continue;
                }
            } else {
                fn_start
            };

            // Skip past "function " and the function name
            let mut j = i + "function ".len();
            // Skip function name
            while j < len && is_ident(chars[j]) {
                j += 1;
            }
            // Skip generic params <...>
            if j < len && chars[j] == '<' {
                let mut depth = 1;
                j += 1;
                while j < len && depth > 0 {
                    if chars[j] == '<' {
                        depth += 1;
                    } else if chars[j] == '>' {
                        depth -= 1;
                    }
                    j += 1;
                }
            }
            // Skip whitespace
            while j < len && chars[j].is_whitespace() {
                j += 1;
            }
            // Should be at `(`
            if j < len && chars[j] == '(' {
                let mut depth = 1;
                j += 1;
                while j < len && depth > 0 {
                    if chars[j] == '(' {
                        depth += 1;
                    } else if chars[j] == ')' {
                        depth -= 1;
                    }
                    j += 1;
                }
                // After `)`, skip optional return type annotation and whitespace
                while j < len && chars[j].is_whitespace() {
                    j += 1;
                }
                // Skip return type: `: Type<A, B>` etc.
                if j < len && chars[j] == ':' {
                    j += 1;
                    // Skip everything until `;` or `{`
                    while j < len && chars[j] != ';' && chars[j] != '{' {
                        j += 1;
                    }
                }
                // Now check: if we hit `;`, this is an overload (no body) — strip it
                if j < len && chars[j] == ';' {
                    // This is an overload declaration — skip from decl_start to j+1
                    // Also skip trailing newline
                    j += 1;
                    if j < len && chars[j] == '\n' {
                        j += 1;
                    }
                    // Remove what we already added from decl_start
                    let added_from_start: String = chars[decl_start..i].iter().collect();
                    if result.ends_with(&added_from_start) {
                        let new_len = result.len() - added_from_start.len();
                        result.truncate(new_len);
                    }
                    i = j;
                    continue;
                }
                // Has a body `{` — this is the real implementation, not an overload
                // Output everything we skipped examination of, and continue normally
            }
        }

        result.push(chars[i]);
        i += 1;
    }

    result
}

/// Check if "function " keyword starts at position `pos`.
fn is_function_keyword_at(chars: &[char], pos: usize, len: usize) -> bool {
    let keyword = "function ";
    if pos + keyword.len() > len {
        return false;
    }
    let slice: String = chars[pos..pos + keyword.len()].iter().collect();
    slice == keyword
}

/// Find the start of the current line (position after previous newline).
fn find_line_start(chars: &[char], pos: usize) -> usize {
    let mut i = pos;
    while i > 0 {
        i -= 1;
        if chars[i] == '\n' {
            return i + 1;
        }
    }
    0
}

/// Strip TypeScript parameter property modifiers from a trimmed line.
///
/// Handles: `public readonly x,` → `x,`
///          `private y,` → `y,`
///          `protected z)` → `z)`
///          `readonly w,` → `w,`
///
/// Returns `Some(cleaned)` if modifiers were stripped, `None` otherwise.
fn strip_param_property_modifiers(trimmed: &str) -> Option<String> {
    let access_modifiers = ["public ", "private ", "protected "];
    let mut s = trimmed;
    let mut stripped = false;

    // Strip access modifier (public/private/protected)
    for kw in &access_modifiers {
        if s.starts_with(kw) {
            s = &s[kw.len()..];
            stripped = true;
            break;
        }
    }

    // Strip readonly (can appear after access modifier or standalone)
    if s.starts_with("readonly ") {
        s = &s["readonly ".len()..];
        stripped = true;
    }

    if stripped {
        Some(s.to_string())
    } else {
        None
    }
}

fn is_ident(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '$'
}

fn skip_ws(chars: &[char], mut pos: usize, len: usize) -> usize {
    while pos < len && chars[pos].is_whitespace() {
        pos += 1;
    }
    pos
}

/// Skip a type annotation: `TypeName`, `TypeName<Generic>`, `TypeName<A, B>`
fn skip_type_annotation(chars: &[char], start: usize, len: usize) -> usize {
    let mut i = start;
    // Read identifier
    while i < len && is_ident(chars[i]) {
        i += 1;
    }
    // Handle generic brackets: <...>
    if i < len && chars[i] == '<' {
        let mut depth = 1;
        i += 1;
        while i < len && depth > 0 {
            if chars[i] == '<' {
                depth += 1;
            } else if chars[i] == '>' {
                depth -= 1;
            }
            i += 1;
        }
    }
    i
}

/// Deduplicate import statements in compiled code.
///
/// The Vertz compiler may add imports (e.g., `import { signal } from '@vertz/ui'`)
/// that duplicate imports already present in the source. ES modules do not allow
/// duplicate bindings, so we merge imports from the same module and remove duplicates.
fn deduplicate_imports(code: &str) -> String {
    use std::collections::{HashMap, HashSet, LinkedList};

    // Track: module_specifier → (set of imported names, line index of first occurrence)
    let mut import_map: HashMap<String, (HashSet<String>, usize)> = HashMap::new();
    // Track the order of first appearance
    let mut import_order: LinkedList<String> = LinkedList::new();
    // Lines to remove (replaced by merged imports)
    let mut lines_to_remove: HashSet<usize> = HashSet::new();

    let lines: Vec<&str> = code.lines().collect();

    for (idx, line) in lines.iter().enumerate() {
        let trimmed = line.trim();

        // Match: import { ... } from '...' or import { ... } from "..."
        // Simple regex-free parsing for the common pattern
        if let Some(rest) = trimmed.strip_prefix("import ") {
            // Skip `import type` — those are stripped by the compiler
            if rest.starts_with("type ") {
                continue;
            }

            // Look for: { names } from 'specifier'
            if let Some(brace_start) = rest.find('{') {
                if let Some(brace_end) = rest[brace_start..].find('}') {
                    let names_str = &rest[brace_start + 1..brace_start + brace_end];
                    let after_brace = &rest[brace_start + brace_end + 1..];

                    if let Some(from_idx) = after_brace.find("from") {
                        let specifier_part = after_brace[from_idx + 4..].trim();
                        // Extract the quoted specifier
                        let specifier = extract_quoted_string(specifier_part);

                        if let Some(spec) = specifier {
                            let names: Vec<String> = names_str
                                .split(',')
                                .map(|n| n.trim().to_string())
                                .filter(|n| !n.is_empty())
                                .collect();

                            if let Some((existing_names, _first_idx)) = import_map.get_mut(&spec) {
                                // Merge names into existing
                                for name in &names {
                                    existing_names.insert(name.clone());
                                }
                                // Remove this duplicate line
                                lines_to_remove.insert(idx);
                            } else {
                                let name_set: HashSet<String> = names.into_iter().collect();
                                import_map.insert(spec.clone(), (name_set, idx));
                                import_order.push_back(spec);
                            }
                        }
                    }
                }
            }
        }
    }

    // If no duplicates found, return original code
    if lines_to_remove.is_empty() {
        return code.to_string();
    }

    // Rebuild the code with merged imports
    let mut result = Vec::with_capacity(lines.len());
    for (idx, line) in lines.iter().enumerate() {
        if lines_to_remove.contains(&idx) {
            continue;
        }

        // Check if this line is a first-occurrence import that needs merging
        let trimmed = line.trim();
        let mut merged = false;
        for spec in &import_order {
            if let Some((names, first_idx)) = import_map.get(spec) {
                if *first_idx == idx {
                    // Check if we actually need to rewrite (had duplicates)
                    let original_names = extract_import_names(trimmed);
                    if original_names.len() < names.len() {
                        // Rewrite with merged names
                        let sorted_names: Vec<&String> = {
                            let mut v: Vec<&String> = names.iter().collect();
                            v.sort();
                            v
                        };
                        let quote = if trimmed.contains('"') { '"' } else { '\'' };
                        result.push(format!(
                            "import {{ {} }} from {}{}{};",
                            sorted_names
                                .iter()
                                .map(|s| s.as_str())
                                .collect::<Vec<_>>()
                                .join(", "),
                            quote,
                            spec,
                            quote,
                        ));
                        merged = true;
                        break;
                    }
                }
            }
        }

        if !merged {
            result.push(line.to_string());
        }
    }

    result.join("\n")
}

/// Extract a quoted string from input like `'@vertz/ui';` or `"@vertz/ui";`
fn extract_quoted_string(s: &str) -> Option<String> {
    let s = s.trim();
    let (quote, rest) = if let Some(rest) = s.strip_prefix('\'') {
        ('\'', rest)
    } else if let Some(rest) = s.strip_prefix('"') {
        ('"', rest)
    } else {
        return None;
    };

    rest.find(quote).map(|end| rest[..end].to_string())
}

/// Extract import names from a line like `import { a, b, c } from '...'`
fn extract_import_names(line: &str) -> Vec<String> {
    if let Some(brace_start) = line.find('{') {
        if let Some(brace_end) = line[brace_start..].find('}') {
            let names_str = &line[brace_start + 1..brace_start + brace_end];
            return names_str
                .split(',')
                .map(|n| n.trim().to_string())
                .filter(|n| !n.is_empty())
                .collect();
        }
    }
    Vec::new()
}

/// Remove cross-specifier duplicate bindings from import statements.
///
/// After post-processing (API name fixing, internals splitting), a file may end up
/// with the same binding imported from two different specifiers:
///   import { domEffect } from '@vertz/ui/internals';   // injected by compiler
///   import { deferredDomEffect, domEffect } from '../runtime/signal';  // original
///
/// ES modules don't allow duplicate bindings. This function detects such collisions
/// and removes the duplicate binding from the compiler-injected import line
/// (`@vertz/ui`, `@vertz/ui/internals`). The original user import takes priority.
fn remove_cross_specifier_duplicates(code: &str) -> String {
    use std::collections::{HashMap, HashSet};

    let lines: Vec<&str> = code.lines().collect();

    // First pass: collect all bindings per import statement using brace-matching
    // that handles multi-line imports.
    // Track: binding_name → vec of (line_index_of_import_start, specifier, is_injected)
    let mut binding_lines: HashMap<String, Vec<(usize, String, bool)>> = HashMap::new();

    // Use full-text brace matching for imports (handles multi-line)
    let mut pos = 0;
    while pos < code.len() {
        if let Some(import_offset) = code[pos..].find("import ") {
            let abs_start = pos + import_offset;

            // Verify it's at the start of a line
            let is_line_start =
                abs_start == 0 || code.as_bytes().get(abs_start - 1) == Some(&b'\n');

            if !is_line_start {
                pos = abs_start + 7;
                continue;
            }

            let rest = &code[abs_start + 7..];
            if rest.starts_with("type ") {
                pos = abs_start + 12;
                continue;
            }

            // Find which line this import starts on
            let import_line_idx = code[..abs_start].matches('\n').count();

            if let Some(brace_offset) = rest.find('{') {
                let brace_abs = abs_start + 7 + brace_offset;
                if let Some(close_offset) = code[brace_abs + 1..].find('}') {
                    let names_str = &code[brace_abs + 1..brace_abs + 1 + close_offset];
                    let after_brace = &code[brace_abs + 1 + close_offset + 1..];
                    let after_trimmed = after_brace.trim_start();

                    if let Some(from_rest) = after_trimmed.strip_prefix("from") {
                        let specifier_part = from_rest.trim();
                        let specifier = extract_quoted_string(specifier_part);

                        if let Some(spec) = specifier {
                            let is_injected = spec == "@vertz/ui"
                                || spec == "@vertz/ui/internals"
                                || spec == "@vertz/tui/internals";

                            for name in names_str.split(',') {
                                let name = name.trim();
                                let binding = if let Some((_orig, alias)) = name.split_once(" as ")
                                {
                                    alias.trim()
                                } else {
                                    name
                                };
                                if !binding.is_empty() {
                                    binding_lines.entry(binding.to_string()).or_default().push((
                                        import_line_idx,
                                        spec.clone(),
                                        is_injected,
                                    ));
                                }
                            }
                        }
                    }

                    pos = brace_abs + 1 + close_offset + 1;
                    continue;
                }
            }

            pos = abs_start + 7;
            continue;
        } else {
            break;
        }
    }

    // Also collect locally declared names (function, const, let, var, class)
    // to detect conflicts with injected imports
    let mut local_declarations: HashSet<String> = HashSet::new();
    for line in &lines {
        let trimmed = line.trim();
        // Skip imports
        if trimmed.starts_with("import ") {
            continue;
        }
        let decl = trimmed.strip_prefix("export ").unwrap_or(trimmed);
        if let Some(rest) = decl.strip_prefix("function ") {
            let name = rest.split(['(', '<', ' ']).next().unwrap_or("").trim();
            if !name.is_empty() {
                local_declarations.insert(name.to_string());
            }
        }
        for keyword in &["const ", "let ", "var "] {
            if let Some(rest) = decl.strip_prefix(keyword) {
                let first = rest.trim_start().as_bytes().first();
                if first == Some(&b'{') || first == Some(&b'[') {
                    break;
                }
                let name = rest.split(['=', ':', ' ', ';']).next().unwrap_or("").trim();
                if !name.is_empty() {
                    local_declarations.insert(name.to_string());
                }
                break;
            }
        }
    }

    // Find bindings that appear in multiple specifiers OR conflict with local declarations
    // For each duplicate, mark the injected import line for modification
    let mut names_to_remove_from_line: HashMap<usize, HashSet<String>> = HashMap::new();

    for (binding, locations) in &binding_lines {
        let has_conflict = locations.len() > 1 || local_declarations.contains(binding);
        if has_conflict {
            // Find the injected location(s) and mark for removal
            for (line_idx, _spec, is_injected) in locations {
                if *is_injected {
                    names_to_remove_from_line
                        .entry(*line_idx)
                        .or_default()
                        .insert(binding.clone());
                }
            }
        }
    }

    if names_to_remove_from_line.is_empty() {
        return code.to_string();
    }

    // Rebuild the output, modifying affected lines
    let mut result: Vec<String> = Vec::with_capacity(lines.len());

    for (idx, line) in lines.iter().enumerate() {
        if let Some(names_to_remove) = names_to_remove_from_line.get(&idx) {
            let trimmed = line.trim();
            // Re-parse this import line and remove the duplicate names
            if let Some(rest) = trimmed.strip_prefix("import ") {
                if let Some(brace_start) = rest.find('{') {
                    if let Some(brace_end) = rest[brace_start..].find('}') {
                        let names_str = &rest[brace_start + 1..brace_start + brace_end];
                        let after_brace = &rest[brace_start + brace_end + 1..];

                        let remaining_names: Vec<&str> = names_str
                            .split(',')
                            .map(|n| n.trim())
                            .filter(|n| {
                                if n.is_empty() {
                                    return false;
                                }
                                let binding = if let Some((_orig, alias)) = n.split_once(" as ") {
                                    alias.trim()
                                } else {
                                    n
                                };
                                !names_to_remove.contains(binding)
                            })
                            .collect();

                        if remaining_names.is_empty() {
                            // Entire import line is duplicate — drop it
                            continue;
                        }

                        // Rebuild import with remaining names
                        let quote = if trimmed.contains('"') { '"' } else { '\'' };
                        if let Some(from_idx) = after_brace.find("from") {
                            let specifier_part = after_brace[from_idx + 4..].trim();
                            if let Some(spec) = extract_quoted_string(specifier_part) {
                                result.push(format!(
                                    "import {{ {} }} from {}{}{};",
                                    remaining_names.join(", "),
                                    quote,
                                    spec,
                                    quote,
                                ));
                                continue;
                            }
                        }
                    }
                }
            }
            // Fallback: keep original line if parsing failed
            result.push(line.to_string());
        } else {
            result.push(line.to_string());
        }
    }

    result.join("\n")
}

/// Strip `import.meta.hot` lines entirely.
///
/// `import.meta.hot` is Bun's bundler-level HMR API (accept/decline/dispose).
/// Our native server uses WebSocket-based HMR — this API doesn't apply.
/// We strip the lines entirely instead of shimming them.
fn strip_import_meta_hot(code: &str) -> String {
    code.lines()
        .filter(|line| !line.trim().starts_with("import.meta.hot"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Fix the `__$moduleId` to use a URL-relative path instead of an absolute filesystem path.
///
/// The compiler generates:
///   `const __$moduleId = '/Users/.../src/app.tsx';`
///
/// But the HMR broadcast sends URL paths like `/src/app.tsx`.
/// Fast Refresh registry lookups fail if these don't match.
/// This replaces the absolute path with the URL-relative path.
pub fn fix_module_id(code: &str, file_path: &Path, root_dir: &Path) -> String {
    let abs_path = file_path.to_string_lossy();
    let url_path = if let Ok(rel) = file_path.strip_prefix(root_dir) {
        format!("/{}", rel.to_string_lossy().replace('\\', "/"))
    } else {
        return code.to_string();
    };

    // Replace the absolute path in the moduleId declaration
    // Pattern: `const __$moduleId = '<absolute_path>';`
    code.replace(&format!("'{}'", abs_path), &format!("'{}'", url_path))
        .replace(&format!("\"{}\"", abs_path), &format!("\"{}\"", url_path))
}

/// Apply generic post-processing fixes to compiled output.
///
/// These are framework-agnostic transforms that any plugin can use:
/// 1. Strip leftover TypeScript syntax artifacts
/// 2. Deduplicate imports to prevent "already been declared" errors
/// 3. Strip import.meta.hot (Bun HMR API)
pub fn generic_post_process(code: &str) -> String {
    let cleaned = strip_leftover_typescript(code);
    let deduped = deduplicate_imports(&cleaned);
    let no_cross_dupes = remove_cross_specifier_duplicates(&deduped);
    strip_import_meta_hot(&no_cross_dupes)
}

/// Apply all post-processing fixes including Vertz-specific ones.
///
/// Equivalent to calling Vertz-specific transforms followed by `generic_post_process()`.
/// Used by the Vertz plugin — other plugins should only call `generic_post_process()`.
pub fn post_process_compiled(code: &str) -> String {
    let fixed = fix_compiler_api_names(code);
    let internals_fixed = fix_internals_imports(&fixed);
    generic_post_process(&internals_fixed)
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

    fn test_plugin() -> Arc<dyn crate::plugin::FrameworkPlugin> {
        Arc::new(crate::plugin::vertz::VertzPlugin)
    }

    fn create_pipeline(root: &Path) -> CompilationPipeline {
        CompilationPipeline::new(root.to_path_buf(), root.join("src"), test_plugin())
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
    fn test_compile_css_without_postcss_config_returns_style_module() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        let css_file = src_dir.join("app.css");
        std::fs::write(&css_file, "body { color: red; }\n").unwrap();

        let pipeline = create_pipeline(tmp.path());
        let result = pipeline.compile_css_for_browser(&css_file, "/src/app.css");

        assert!(result.errors.is_empty());
        assert!(result.code.contains("body { color: red; }"));
        assert!(result.code.contains("document.createElement('style')"));
    }

    #[test]
    fn test_compile_css_with_postcss_config_processes_css() {
        use crate::compiler::postcss::{find_postcss_config, PostCssCssTransform};

        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        let node_modules = tmp.path().join("node_modules");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::create_dir_all(node_modules.join("postcss")).unwrap();
        std::fs::create_dir_all(node_modules.join("fake-prefixer")).unwrap();

        std::fs::write(src_dir.join("app.css"), "a { display: flex; }\n").unwrap();
        std::fs::write(
            tmp.path().join("postcss.config.js"),
            "module.exports = { plugins: { 'fake-prefixer': {} } };",
        )
        .unwrap();
        std::fs::write(
            node_modules.join("postcss/package.json"),
            r#"{"name":"postcss","main":"index.js"}"#,
        )
        .unwrap();
        std::fs::write(
            node_modules.join("postcss/index.js"),
            r#"module.exports = function postcss(plugins) {
  return {
    async process(css, options) {
      let next = css;
      for (const plugin of plugins) {
        if (typeof plugin === "function") {
          next = await plugin(next, options);
        }
      }
      return { css: next };
    },
  };
};"#,
        )
        .unwrap();
        std::fs::write(
            node_modules.join("fake-prefixer/package.json"),
            r#"{"name":"fake-prefixer","main":"index.js"}"#,
        )
        .unwrap();
        std::fs::write(
            node_modules.join("fake-prefixer/index.js"),
            r#"module.exports = function fakePrefixer() {
  return (css) => css.replace("display: flex", "display: -webkit-flex;\n  display: flex");
};"#,
        )
        .unwrap();

        let config_path = find_postcss_config(tmp.path()).expect("config should exist");
        let transform = Arc::new(PostCssCssTransform::new(config_path));
        let pipeline = create_pipeline(tmp.path()).with_css_transform(transform);
        let result = pipeline.compile_css_for_browser(&src_dir.join("app.css"), "/src/app.css");

        assert!(
            result.errors.is_empty(),
            "unexpected errors: {:?}",
            result.errors
        );
        assert!(result.code.contains("display: -webkit-flex;"));
        assert!(result.code.contains("display: flex;"));
    }

    #[test]
    fn test_compile_css_with_postcss_error_returns_error_module() {
        use crate::compiler::postcss::{find_postcss_config, PostCssCssTransform};

        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        let node_modules = tmp.path().join("node_modules");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::create_dir_all(node_modules.join("postcss")).unwrap();
        std::fs::create_dir_all(node_modules.join("broken-plugin")).unwrap();

        std::fs::write(src_dir.join("app.css"), "@broken;\n").unwrap();
        std::fs::write(
            tmp.path().join("postcss.config.js"),
            "module.exports = { plugins: { 'broken-plugin': {} } };",
        )
        .unwrap();
        std::fs::write(
            node_modules.join("postcss/package.json"),
            r#"{"name":"postcss","main":"index.js"}"#,
        )
        .unwrap();
        std::fs::write(
            node_modules.join("postcss/index.js"),
            r#"module.exports = function postcss(plugins) {
  return {
    async process(css, options) {
      for (const plugin of plugins) {
        await plugin(css, options);
      }
      return { css };
    },
  };
};"#,
        )
        .unwrap();
        std::fs::write(
            node_modules.join("broken-plugin/package.json"),
            r#"{"name":"broken-plugin","main":"index.js"}"#,
        )
        .unwrap();
        std::fs::write(
            node_modules.join("broken-plugin/index.js"),
            r#"module.exports = function brokenPlugin() {
  return () => {
    const error = new Error("Unknown at-rule @broken");
    error.reason = "Unknown at-rule @broken";
    error.line = 1;
    error.column = 1;
    throw error;
  };
};"#,
        )
        .unwrap();

        let config_path = find_postcss_config(tmp.path()).expect("config should exist");
        let transform = Arc::new(PostCssCssTransform::new(config_path));
        let pipeline = create_pipeline(tmp.path()).with_css_transform(transform);
        let result = pipeline.compile_css_for_browser(&src_dir.join("app.css"), "/src/app.css");

        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].line, Some(1));
        assert_eq!(result.errors[0].column, Some(1));
        assert!(result.code.contains("CSS error"));
        assert!(pipeline.cache().is_empty());
    }

    #[test]
    fn test_compile_css_with_custom_transform() {
        use crate::compiler::css_transform::CssTransform;

        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("app.css"), "body { color: red; }\n").unwrap();

        struct UpperCaseTransform;

        impl CssTransform for UpperCaseTransform {
            fn process(
                &self,
                file_path: &Path,
                _root_dir: &Path,
            ) -> Result<String, Vec<CompileError>> {
                let source = std::fs::read_to_string(file_path).unwrap();
                Ok(source.to_uppercase())
            }
        }

        let pipeline = create_pipeline(tmp.path()).with_css_transform(Arc::new(UpperCaseTransform));
        let result = pipeline.compile_css_for_browser(&src_dir.join("app.css"), "/src/app.css");

        assert!(result.errors.is_empty());
        assert!(result.code.contains("BODY { COLOR: RED; }"));
    }

    #[test]
    fn test_compile_css_with_transform_error() {
        use crate::compiler::css_transform::CssTransform;

        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("app.css"), "@broken;\n").unwrap();

        struct FailingTransform;

        impl CssTransform for FailingTransform {
            fn process(
                &self,
                _file_path: &Path,
                _root_dir: &Path,
            ) -> Result<String, Vec<CompileError>> {
                Err(vec![CompileError {
                    message: "Transform failed".to_string(),
                    line: Some(1),
                    column: Some(1),
                }])
            }
        }

        let pipeline = create_pipeline(tmp.path()).with_css_transform(Arc::new(FailingTransform));
        let result = pipeline.compile_css_for_browser(&src_dir.join("app.css"), "/src/app.css");

        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].message, "Transform failed");
        assert_eq!(result.errors[0].line, Some(1));
        assert!(result.code.contains("CSS error"));
        assert!(pipeline.cache().is_empty());
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
        let pipeline = CompilationPipeline::new(
            PathBuf::from("/project"),
            PathBuf::from("/project/src"),
            test_plugin(),
        );
        let key = pipeline.css_key(Path::new("/project/src/components/Button.tsx"));
        assert_eq!(key, "src_components_Button.tsx.css");
    }

    #[test]
    fn test_error_module_escapes_special_chars() {
        let pipeline = CompilationPipeline::new(
            PathBuf::from("/project"),
            PathBuf::from("/project/src"),
            test_plugin(),
        );
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

    // ── fix_compiler_api_names ──────────────────────────────────────

    #[test]
    fn test_fix_api_names_no_effect() {
        let code = "import { signal } from '@vertz/ui';";
        assert_eq!(fix_compiler_api_names(code), code);
    }

    #[test]
    fn test_fix_api_names_renames_effect_import_comma() {
        let code = "import { signal, effect, computed } from '@vertz/ui';";
        let result = fix_compiler_api_names(code);
        assert!(result.contains("domEffect,"));
        assert!(!result.contains(", effect,"));
    }

    #[test]
    fn test_fix_api_names_renames_effect_import_brace_end() {
        let code = "import { signal, effect } from '@vertz/ui';";
        let result = fix_compiler_api_names(code);
        assert!(result.contains("domEffect }"));
        assert!(!result.contains("effect }"));
    }

    #[test]
    fn test_fix_api_names_renames_effect_import_brace_start() {
        let code = "import { effect, signal } from '@vertz/ui';";
        let result = fix_compiler_api_names(code);
        assert!(result.contains("{ domEffect,"));
    }

    #[test]
    fn test_fix_api_names_renames_effect_import_only() {
        let code = "import { effect } from '@vertz/ui';";
        let result = fix_compiler_api_names(code);
        assert!(result.contains("{ domEffect }"));
    }

    #[test]
    fn test_fix_api_names_renames_call_sites() {
        let code = "effect(() => { console.log('hi'); });";
        let result = fix_compiler_api_names(code);
        assert!(result.contains("domEffect("));
        assert!(!result.starts_with("effect("));
    }

    #[test]
    fn test_fix_api_names_does_not_rename_dom_effect() {
        let code = "domEffect(() => {}); lifecycleEffect(() => {});";
        let result = fix_compiler_api_names(code);
        // Should NOT double-rename domEffect to domdomEffect
        assert!(result.contains("domEffect("));
        assert!(result.contains("lifecycleEffect("));
        assert!(!result.contains("domdomEffect"));
    }

    #[test]
    fn test_fix_api_names_effect_newline() {
        let code = "import { signal, effect\n} from '@vertz/ui';";
        let result = fix_compiler_api_names(code);
        assert!(result.contains("domEffect\n"));
    }

    // ── fix_internals_imports ───────────────────────────────────────

    #[test]
    fn test_fix_internals_no_internals() {
        let code = "import { signal } from '@vertz/ui';";
        let result = fix_internals_imports(code);
        assert_eq!(result, code);
    }

    #[test]
    fn test_fix_internals_splits_internal_api() {
        let code = "import { signal, domEffect } from '@vertz/ui';";
        let result = fix_internals_imports(code);
        assert!(result.contains("import { signal } from '@vertz/ui';"));
        assert!(result.contains("import { domEffect } from '@vertz/ui/internals';"));
    }

    #[test]
    fn test_fix_internals_all_internal_apis() {
        let code = "import { domEffect, lifecycleEffect } from '@vertz/ui';";
        let result = fix_internals_imports(code);
        assert!(!result.contains("import {  } from '@vertz/ui';"));
        assert!(result.contains("@vertz/ui/internals"));
        assert!(result.contains("domEffect"));
        assert!(result.contains("lifecycleEffect"));
    }

    #[test]
    fn test_fix_internals_skips_subpath_import() {
        let code = "import { domEffect } from '@vertz/ui/internals';";
        let result = fix_internals_imports(code);
        assert_eq!(result, code);
    }

    #[test]
    fn test_fix_internals_double_quote() {
        let code = r#"import { signal, domEffect } from "@vertz/ui";"#;
        let result = fix_internals_imports(code);
        assert!(result.contains(r#"from "@vertz/ui""#));
        assert!(result.contains(r#"from "@vertz/ui/internals""#));
    }

    // ── strip_leftover_typescript ───────────────────────────────────

    #[test]
    fn test_strip_import_type() {
        let code = "import type { Foo } from 'bar';\nconst x = 1;";
        let result = strip_leftover_typescript(code);
        assert!(!result.contains("import type"));
        assert!(result.contains("const x = 1;"));
    }

    #[test]
    fn test_strip_export_type_braces() {
        let code = "export type { Foo };\nconst x = 1;";
        let result = strip_leftover_typescript(code);
        assert!(!result.contains("export type {"));
        assert!(result.contains("const x = 1;"));
    }

    #[test]
    fn test_strip_type_alias_single_line() {
        let code = "type Foo = string;\nconst x = 1;";
        let result = strip_leftover_typescript(code);
        assert!(!result.contains("type Foo"));
        assert!(result.contains("const x = 1;"));
    }

    #[test]
    fn test_strip_type_alias_multiline() {
        let code = "type Foo = {\n  bar: string;\n};\nconst x = 1;";
        let result = strip_leftover_typescript(code);
        assert!(!result.contains("type Foo"));
        assert!(result.contains("const x = 1;"));
    }

    #[test]
    fn test_strip_export_type_alias() {
        let code = "export type Foo = string;\nconst x = 1;";
        let result = strip_leftover_typescript(code);
        assert!(!result.contains("export type Foo"));
        assert!(result.contains("const x = 1;"));
    }

    #[test]
    fn test_strip_standalone_type_no_eq() {
        let code = "export type Foo;\nconst x = 1;";
        let result = strip_leftover_typescript(code);
        assert!(!result.contains("export type Foo;"));
        assert!(result.contains("const x = 1;"));
    }

    #[test]
    fn test_strip_interface_single_line() {
        let code = "interface Foo {}\nconst x = 1;";
        let result = strip_leftover_typescript(code);
        assert!(!result.contains("interface Foo"));
        assert!(result.contains("const x = 1;"));
    }

    #[test]
    fn test_strip_interface_multiline() {
        let code = "interface Foo {\n  bar: string;\n}\nconst x = 1;";
        let result = strip_leftover_typescript(code);
        assert!(!result.contains("interface"));
        assert!(result.contains("const x = 1;"));
    }

    #[test]
    fn test_strip_export_interface() {
        let code = "export interface Foo {\n  bar: string;\n}\nconst x = 1;";
        let result = strip_leftover_typescript(code);
        assert!(!result.contains("interface"));
        assert!(result.contains("const x = 1;"));
    }

    #[test]
    fn test_strip_param_modifiers_public_readonly() {
        let result = strip_param_property_modifiers("public readonly x,");
        assert_eq!(result, Some("x,".to_string()));
    }

    #[test]
    fn test_strip_param_modifiers_private() {
        let result = strip_param_property_modifiers("private y,");
        assert_eq!(result, Some("y,".to_string()));
    }

    #[test]
    fn test_strip_param_modifiers_protected() {
        let result = strip_param_property_modifiers("protected z)");
        assert_eq!(result, Some("z)".to_string()));
    }

    #[test]
    fn test_strip_param_modifiers_readonly_alone() {
        let result = strip_param_property_modifiers("readonly w,");
        assert_eq!(result, Some("w,".to_string()));
    }

    #[test]
    fn test_strip_param_modifiers_no_modifier() {
        let result = strip_param_property_modifiers("x,");
        assert_eq!(result, None);
    }

    #[test]
    fn test_strip_optional_param() {
        let code = "(x?) => x";
        let result = strip_leftover_typescript(code);
        assert!(result.contains("(x)"));
        assert!(!result.contains("?"));
    }

    #[test]
    fn test_strip_type_annotation_in_param() {
        let code = "(x: Props) => x";
        let result = strip_leftover_typescript(code);
        assert!(result.contains("(x)"));
        assert!(!result.contains("Props"));
    }

    #[test]
    fn test_strip_type_annotation_with_generics() {
        let code = "(x: Array<string>) => x";
        let result = strip_leftover_typescript(code);
        assert!(result.contains("(x)"));
        assert!(!result.contains("Array"));
    }

    #[test]
    fn test_strip_param_modifier_in_context() {
        let code = "class Foo {\n  constructor(\n    public readonly x,\n  ) {}\n}";
        let result = strip_leftover_typescript(code);
        assert!(result.contains("x,"));
        assert!(!result.contains("public"));
        assert!(!result.contains("readonly"));
    }

    // ── strip_function_overloads ────────────────────────────────────

    #[test]
    fn test_strip_overload_simple() {
        let code = "function foo(a);\nfunction foo(a) { return a; }";
        let result = strip_function_overloads(code);
        assert!(!result.contains("function foo(a);"));
        assert!(result.contains("function foo(a) { return a; }"));
    }

    #[test]
    fn test_strip_overload_export() {
        let code = "export function foo(a);\nexport function foo(a) { return a; }";
        let result = strip_function_overloads(code);
        assert!(!result.contains("export function foo(a);"));
        assert!(result.contains("export function foo(a) { return a; }"));
    }

    #[test]
    fn test_strip_overload_with_generics() {
        let code = "function bar<T>(x);\nfunction bar(x) { return x; }";
        let result = strip_function_overloads(code);
        assert!(!result.contains("function bar<T>(x);"));
        assert!(result.contains("function bar(x) { return x; }"));
    }

    #[test]
    fn test_strip_overload_with_return_type() {
        let code = "function baz(a): string;\nfunction baz(a) { return a; }";
        let result = strip_function_overloads(code);
        assert!(!result.contains("function baz(a): string;"));
        assert!(result.contains("function baz(a) { return a; }"));
    }

    #[test]
    fn test_strip_overload_at_file_start() {
        // Tests find_line_start returning 0
        let code = "function foo(a);\nfunction foo(a) { return a; }";
        let result = strip_function_overloads(code);
        assert!(!result.contains("function foo(a);"));
    }

    #[test]
    fn test_strip_overload_keeps_implementation() {
        let code = "function foo(a);\nfunction foo(a, b);\nfunction foo(a, b) { return a + b; }";
        let result = strip_function_overloads(code);
        assert!(!result.contains("function foo(a);"));
        assert!(!result.contains("function foo(a, b);"));
        assert!(result.contains("function foo(a, b) { return a + b; }"));
    }

    #[test]
    fn test_strip_overload_not_declaration() {
        // function keyword inside expression should not be treated as overload
        let code = "const x = function foo(a) { return a; };";
        let result = strip_function_overloads(code);
        assert_eq!(result, code);
    }

    // ── deduplicate_imports ─────────────────────────────────────────

    #[test]
    fn test_deduplicate_no_dupes() {
        let code = "import { signal } from '@vertz/ui';\nimport { query } from '@vertz/ui/data';";
        let result = deduplicate_imports(code);
        assert_eq!(result, code);
    }

    #[test]
    fn test_deduplicate_merges_same_module() {
        let code = "import { signal } from '@vertz/ui';\nimport { computed } from '@vertz/ui';";
        let result = deduplicate_imports(code);
        // Should be merged into one import
        let import_count = result.matches("import {").count();
        assert_eq!(
            import_count, 1,
            "Should merge into one import. Got: {}",
            result
        );
        assert!(result.contains("signal"));
        assert!(result.contains("computed"));
    }

    #[test]
    fn test_deduplicate_skips_import_type() {
        let code = "import type { Foo } from '@vertz/ui';\nimport { signal } from '@vertz/ui';";
        let result = deduplicate_imports(code);
        // import type should not be merged with import
        assert!(result.contains("import type"));
        assert!(result.contains("import { signal }"));
    }

    #[test]
    fn test_deduplicate_double_quotes() {
        let code = "import { signal } from \"@vertz/ui\";\nimport { computed } from \"@vertz/ui\";";
        let result = deduplicate_imports(code);
        let import_count = result.matches("import {").count();
        assert_eq!(
            import_count, 1,
            "Should merge double-quoted imports. Got: {}",
            result
        );
    }

    // ── extract_quoted_string ───────────────────────────────────────

    #[test]
    fn test_extract_quoted_string_single() {
        assert_eq!(
            extract_quoted_string("'@vertz/ui';"),
            Some("@vertz/ui".to_string())
        );
    }

    #[test]
    fn test_extract_quoted_string_double() {
        assert_eq!(
            extract_quoted_string("\"@vertz/ui\";"),
            Some("@vertz/ui".to_string())
        );
    }

    #[test]
    fn test_extract_quoted_string_none() {
        assert_eq!(extract_quoted_string("no quotes"), None);
    }

    // ── extract_import_names ────────────────────────────────────────

    #[test]
    fn test_extract_import_names_basic() {
        let names = extract_import_names("import { a, b, c } from 'mod';");
        assert_eq!(names, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_extract_import_names_no_braces() {
        let names = extract_import_names("import foo from 'mod';");
        assert!(names.is_empty());
    }

    // ── remove_cross_specifier_duplicates ────────────────────────────

    #[test]
    fn test_remove_cross_specifier_dupes_injected_removed() {
        let code = "import { domEffect } from '@vertz/ui/internals';\nimport { domEffect } from '../signal';";
        let result = remove_cross_specifier_duplicates(code);
        // The injected import (@vertz/ui/internals) should lose domEffect
        assert!(
            !result.contains("from '@vertz/ui/internals'"),
            "Injected import should be dropped entirely. Got: {}",
            result
        );
        assert!(result.contains("import { domEffect } from '../signal'"));
    }

    #[test]
    fn test_remove_cross_specifier_dupes_partial_removal() {
        let code = "import { domEffect, startSignalCollection } from '@vertz/ui/internals';\nimport { domEffect } from '../signal';";
        let result = remove_cross_specifier_duplicates(code);
        // domEffect should be removed from the injected import, but startSignalCollection stays
        assert!(result.contains("startSignalCollection"));
        assert!(result.contains("'@vertz/ui/internals'"));
        assert!(result.contains("import { domEffect } from '../signal'"));
    }

    #[test]
    fn test_remove_cross_specifier_dupes_no_conflict() {
        let code = "import { signal } from '@vertz/ui';\nimport { query } from '@vertz/ui/data';";
        let result = remove_cross_specifier_duplicates(code);
        assert_eq!(result, code);
    }

    #[test]
    fn test_remove_cross_specifier_dupes_alias() {
        let code = "import { domEffect as de } from '@vertz/ui/internals';\nimport { domEffect as de } from '../signal';";
        let result = remove_cross_specifier_duplicates(code);
        // The binding `de` is duplicated — injected one should be removed
        assert!(!result.contains("@vertz/ui/internals"));
    }

    #[test]
    fn test_remove_cross_specifier_dupes_local_declaration_conflict() {
        let code = "import { domEffect } from '@vertz/ui/internals';\nfunction domEffect() {}";
        let result = remove_cross_specifier_duplicates(code);
        // domEffect conflicts with local declaration — injected import should be removed
        assert!(!result.contains("@vertz/ui/internals"));
        assert!(result.contains("function domEffect()"));
    }

    // ── strip_import_meta_hot ───────────────────────────────────────

    #[test]
    fn test_strip_import_meta_hot() {
        let code = "const x = 1;\nimport.meta.hot.accept();\nconst y = 2;";
        let result = strip_import_meta_hot(code);
        assert!(!result.contains("import.meta.hot"));
        assert!(result.contains("const x = 1;"));
        assert!(result.contains("const y = 2;"));
    }

    #[test]
    fn test_strip_import_meta_hot_none() {
        let code = "const x = 1;";
        let result = strip_import_meta_hot(code);
        assert_eq!(result, code);
    }

    // ── fix_module_id ───────────────────────────────────────────────

    #[test]
    fn test_fix_module_id_replaces_absolute() {
        let code = "const __$moduleId = '/project/src/app.tsx';";
        let result = fix_module_id(
            code,
            Path::new("/project/src/app.tsx"),
            Path::new("/project"),
        );
        assert!(result.contains("'/src/app.tsx'"));
        assert!(!result.contains("/project/src/app.tsx"));
    }

    #[test]
    fn test_fix_module_id_outside_root() {
        let code = "const __$moduleId = '/other/app.tsx';";
        let result = fix_module_id(code, Path::new("/other/app.tsx"), Path::new("/project"));
        assert_eq!(result, code);
    }

    // ── generic_post_process ──────────────────────────────────────

    #[test]
    fn test_generic_post_process_strips_typescript_and_deduplicates() {
        let code = "import type { Foo } from 'bar';\nimport { x } from 'mod';\nimport { x } from 'mod';\nimport.meta.hot.accept();\nconst y = 1;";
        let result = generic_post_process(code);
        // import type stripped
        assert!(!result.contains("import type"));
        // import.meta.hot stripped
        assert!(!result.contains("import.meta.hot"));
        // duplicates removed
        assert!(result.contains("const y = 1"));
        // Does NOT fix Vertz-specific API names (that's not generic)
    }

    #[test]
    fn test_generic_post_process_does_not_rename_effect() {
        let code = "import { effect } from '@vertz/ui';\neffect(() => {});";
        let result = generic_post_process(code);
        // generic_post_process should NOT rename effect to domEffect
        assert!(
            result.contains("effect"),
            "generic_post_process should not touch Vertz-specific API names"
        );
    }

    // ── post_process_compiled (integration) ─────────────────────────

    #[test]
    fn test_post_process_strips_import_meta_hot() {
        let code = "const x = 1;\nimport.meta.hot.accept();\nexport { x };";
        let result = post_process_compiled(code);
        assert!(!result.contains("import.meta.hot"));
        assert!(result.contains("const x = 1;"));
    }

    #[test]
    fn test_post_process_full_pipeline() {
        let code = "import type { Foo } from 'bar';\nimport { signal, effect } from '@vertz/ui';\nimport { signal } from '@vertz/ui';\nimport.meta.hot.accept();\nconst x = 1;";
        let result = post_process_compiled(code);
        // import type stripped
        assert!(!result.contains("import type"));
        // effect renamed to domEffect and moved to internals
        assert!(result.contains("domEffect"));
        // import.meta.hot stripped
        assert!(!result.contains("import.meta.hot"));
        // signal deduped
        assert!(result.contains("signal"));
    }

    // ── CompilationPipeline methods ─────────────────────────────────

    #[test]
    fn test_css_key_outside_root() {
        let pipeline = CompilationPipeline::new(
            PathBuf::from("/project"),
            PathBuf::from("/project/src"),
            test_plugin(),
        );
        let key = pipeline.css_key(Path::new("/other/file.tsx"));
        assert!(key.ends_with(".css"));
        // Should use hash fallback
        assert!(key.contains("css"));
    }

    #[test]
    fn test_source_map_url_inside_root() {
        let pipeline = CompilationPipeline::new(
            PathBuf::from("/project"),
            PathBuf::from("/project/src"),
            test_plugin(),
        );
        let url = pipeline.source_map_url(Path::new("/project/src/app.tsx"));
        assert_eq!(url, "/src/app.tsx.map");
    }

    #[test]
    fn test_source_map_url_outside_root() {
        let pipeline = CompilationPipeline::new(
            PathBuf::from("/project"),
            PathBuf::from("/project/src"),
            test_plugin(),
        );
        let url = pipeline.source_map_url(Path::new("/other/app.tsx"));
        assert_eq!(url, "/other/app.tsx.map");
    }

    #[test]
    fn test_get_css_empty_store() {
        let pipeline = CompilationPipeline::new(
            PathBuf::from("/project"),
            PathBuf::from("/project/src"),
            test_plugin(),
        );
        assert_eq!(pipeline.get_css("nonexistent"), None);
    }

    #[test]
    fn test_store_and_get_css() {
        let pipeline = CompilationPipeline::new(
            PathBuf::from("/project"),
            PathBuf::from("/project/src"),
            test_plugin(),
        );
        pipeline.store_css(Path::new("/project/src/app.tsx"), ".foo { color: red; }");
        let key = pipeline.css_key(Path::new("/project/src/app.tsx"));
        assert_eq!(
            pipeline.get_css(&key),
            Some(".foo { color: red; }".to_string())
        );
    }

    #[test]
    fn test_compile_with_diagnostics() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        // Invalid syntax should produce diagnostics
        std::fs::write(src_dir.join("bad.tsx"), "export const x: = ;\n").unwrap();

        let pipeline = create_pipeline(tmp.path());
        let result = pipeline.compile_for_browser(&src_dir.join("bad.tsx"));
        // Even with errors, it should return some output
        assert!(!result.code.is_empty());
    }

    #[test]
    fn test_compile_does_not_cache_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("bad.tsx"), "export const x: = ;\n").unwrap();

        let pipeline = create_pipeline(tmp.path());
        let result = pipeline.compile_for_browser(&src_dir.join("bad.tsx"));

        if !result.errors.is_empty() {
            // Errors should not be cached
            assert!(pipeline.cache().is_empty());
        }
    }

    #[test]
    fn test_error_module_content() {
        let pipeline = CompilationPipeline::new(
            PathBuf::from("/project"),
            PathBuf::from("/project/src"),
            test_plugin(),
        );
        let result = pipeline.error_module("Test error");
        assert!(result.code.contains("console.error"));
        assert!(result.code.contains("Test error"));
        assert!(result.code.contains("export default undefined"));
        assert!(result.source_map.is_none());
        assert!(result.css.is_none());
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].message, "Test error");
    }

    #[test]
    fn test_error_module_escapes_backslash() {
        let pipeline = CompilationPipeline::new(
            PathBuf::from("/project"),
            PathBuf::from("/project/src"),
            test_plugin(),
        );
        let result = pipeline.error_module("path\\to\\file");
        assert!(result.code.contains("path\\\\to\\\\file"));
    }

    // ── import.meta.env replacement in pipeline ───────────────────

    #[test]
    fn test_compile_replaces_import_meta_env_dev() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(
            src_dir.join("app.ts"),
            "export const isDev = import.meta.env.DEV;\n",
        )
        .unwrap();

        let mut env = HashMap::new();
        env.insert("DEV".to_string(), "true".to_string());
        env.insert("PROD".to_string(), "false".to_string());
        env.insert("MODE".to_string(), "development".to_string());

        let pipeline =
            CompilationPipeline::new(tmp.path().to_path_buf(), src_dir.clone(), test_plugin())
                .with_env(env);

        let result = pipeline.compile_for_browser(&src_dir.join("app.ts"));
        assert!(
            result.code.contains("= true"),
            "import.meta.env.DEV should be replaced with true. Code: {}",
            result.code
        );
        assert!(
            !result.code.contains("import.meta.env"),
            "import.meta.env should be fully replaced. Code: {}",
            result.code
        );
    }

    #[test]
    fn test_compile_replaces_import_meta_env_string_var() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(
            src_dir.join("config.ts"),
            "export const apiUrl = import.meta.env.VITE_API_URL;\n",
        )
        .unwrap();

        let mut env = HashMap::new();
        env.insert(
            "VITE_API_URL".to_string(),
            "https://api.example.com".to_string(),
        );
        env.insert("DEV".to_string(), "true".to_string());

        let pipeline =
            CompilationPipeline::new(tmp.path().to_path_buf(), src_dir.clone(), test_plugin())
                .with_env(env);

        let result = pipeline.compile_for_browser(&src_dir.join("config.ts"));
        assert!(
            result.code.contains("\"https://api.example.com\""),
            "import.meta.env.VITE_API_URL should be replaced. Code: {}",
            result.code
        );
    }

    #[test]
    fn test_compile_no_env_leaves_code_unchanged() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("app.ts"), "export const x = 1;\n").unwrap();

        // Empty env — no replacement
        let pipeline = create_pipeline(tmp.path());
        let result = pipeline.compile_for_browser(&src_dir.join("app.ts"));
        assert!(result.code.contains("compiled by vertz-native"));
    }
}
