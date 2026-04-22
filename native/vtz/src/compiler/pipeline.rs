use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::SystemTime;

use crate::compiler::cache::{CachedModule, CompilationCache};
use crate::compiler::css_transform::CssTransform;
use crate::compiler::env_replacer;
use crate::compiler::import_rewriter;
use crate::plugin::{CompileContext, VtzPlugin};
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
/// Compiles .ts/.tsx files via a [`VtzPlugin`], rewrites import specifiers
/// for browser consumption, caches results, and extracts CSS into a shared store.
#[derive(Clone)]
pub struct CompilationPipeline {
    cache: CompilationCache,
    css_store: CssStore,
    root_dir: PathBuf,
    src_dir: PathBuf,
    plugin: Arc<dyn VtzPlugin>,
    tsconfig_paths: Option<TsconfigPaths>,
    /// Public env vars for `import.meta.env` compile-time replacement.
    env: HashMap<String, String>,
    /// Optional CSS transform hook (e.g., PostCSS, Lightning CSS).
    css_transform: Option<Arc<dyn CssTransform>>,
}

impl CompilationPipeline {
    pub fn new(root_dir: PathBuf, src_dir: PathBuf, plugin: Arc<dyn VtzPlugin>) -> Self {
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
            test_mode: false,
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

        // Inject CSS at module load time (before import rewriting so the
        // `@vertz/ui` specifier gets resolved to `/@deps/...` automatically).
        // This is the browser pipeline — uses @vertz/ui's injectCSS for client-side
        // CSS injection (DOM <style> tags or adoptedStyleSheets).
        let css = output.css;
        let processed = if let Some(ref css_content) = css {
            self.store_css(file_path, css_content);
            let escaped = css_content
                .replace('\\', "\\\\")
                .replace('`', "\\`")
                .replace("${", "\\${");
            format!(
                "import {{ injectCSS as __injectCSS }} from '@vertz/ui';\n__injectCSS(`{}`);\n{}",
                escaped, processed
            )
        } else {
            processed
        };

        // Rewrite import specifiers for browser consumption
        let code = import_rewriter::rewrite_imports(
            &processed,
            file_path,
            &self.src_dir,
            &self.root_dir,
            self.tsconfig_paths.as_ref(),
        );

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
/// This replaces the standalone identifier `effect` everywhere in code — imports and
/// call sites alike — while skipping string literals (`'`, `"`, `` ` ``) and comments
/// (`//`, `/* */`) so rewrites never leak into string/comment content. (See #2801.)
///
/// Assumption: this only runs on compiler-emitted JS, which never contains a
/// user-authored `effect` binding nor regex literals like `/effect\(/`. Interpolated
/// expressions inside template literals (`${effect()}`) are therefore NOT rewritten —
/// the entire template is treated as a skip region.
fn fix_compiler_api_names(code: &str) -> String {
    if !code.contains("effect") {
        return code.to_string();
    }

    let bytes = code.as_bytes();
    let len = bytes.len();
    let mut result = String::with_capacity(len);
    let mut i = 0;
    let mut copy_start = 0;

    fn is_ident_byte(b: u8) -> bool {
        b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
    }

    while i < len {
        let b = bytes[i];

        // Line comment: // ... \n
        if b == b'/' && i + 1 < len && bytes[i + 1] == b'/' {
            i += 2;
            while i < len && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }

        // Block comment: /* ... */
        if b == b'/' && i + 1 < len && bytes[i + 1] == b'*' {
            i += 2;
            while i + 1 < len && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                i += 1;
            }
            if i + 1 < len {
                i += 2;
            } else {
                i = len;
            }
            continue;
        }

        // String / template literal
        if b == b'\'' || b == b'"' || b == b'`' {
            let quote = b;
            i += 1;
            while i < len {
                let c = bytes[i];
                if c == b'\\' && i + 1 < len {
                    i += 2;
                    continue;
                }
                if c == quote {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }

        // Match standalone identifier `effect` and rewrite to `domEffect`.
        if b == b'e' && i + 6 <= len && &bytes[i..i + 6] == b"effect" {
            let prev_is_ident = i > 0 && is_ident_byte(bytes[i - 1]);
            let next_is_ident = i + 6 < len && is_ident_byte(bytes[i + 6]);
            if !prev_is_ident && !next_is_ident {
                result.push_str(&code[copy_start..i]);
                result.push_str("domEffect");
                i += 6;
                copy_start = i;
                continue;
            }
        }

        i += 1;
    }

    result.push_str(&code[copy_start..]);
    result
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
/// Returns true if a line starting with `type ` or `export type ` has a valid
/// identifier name after the keyword — distinguishing `type Foo = string` (type alias)
/// from `type = 'value'` (variable assignment). See #2599.
fn starts_with_type_name(trimmed: &str) -> bool {
    let after_keyword = trimmed
        .strip_prefix("export type ")
        .or_else(|| trimmed.strip_prefix("type "))
        .unwrap_or("");
    after_keyword
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_alphabetic() || c == '_' || c == '$')
}

/// Build a per-line mask indicating whether each line is inside a template literal.
///
/// Returns a `Vec<bool>` where `mask[i] == true` means line `i` is (at least
/// partially) inside a backtick-delimited template string and should not be
/// processed by import deduplication, TypeScript stripping, or other
/// line-level transforms.
///
/// The mask uses the state at the *start* of each line so that a line
/// containing the closing backtick is still treated as template content.
fn template_literal_mask(lines: &[&str]) -> Vec<bool> {
    let mut mask = Vec::with_capacity(lines.len());
    let mut in_template = false;

    for line in lines {
        // Capture state at the start of this line.
        let was_in_template = in_template;

        let chars: Vec<char> = line.chars().collect();
        let mut ci = 0;
        while ci < chars.len() {
            if chars[ci] == '\\' {
                ci += 2; // skip escaped char
                continue;
            }
            // Skip single/double quoted strings (they can't contain unescaped backticks)
            if chars[ci] == '\'' || chars[ci] == '"' {
                let q = chars[ci];
                ci += 1;
                while ci < chars.len() && chars[ci] != q {
                    if chars[ci] == '\\' {
                        ci += 1;
                    }
                    ci += 1;
                }
                if ci < chars.len() {
                    ci += 1;
                }
                continue;
            }
            if chars[ci] == '`' {
                in_template = !in_template;
            }
            ci += 1;
        }

        mask.push(was_in_template);
    }

    mask
}

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
    let mask = template_literal_mask(&code_lines);
    let mut result_lines: Vec<String> = Vec::new();
    let mut i = 0;

    while i < code_lines.len() {
        let line = code_lines[i];
        let trimmed = line.trim();

        // Inside a template literal — preserve all lines as-is.
        if mask[i] {
            result_lines.push(line.to_string());
            i += 1;
            continue;
        }

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
        // `export type * from '...'` or `export type * as Ns from '...'`
        if trimmed.starts_with("export type *") {
            i += 1;
            continue;
        }
        // Type alias: `export type X = ...` or `type X = ...` (single or multi-line)
        // Guard: the token after `type ` must be an identifier (e.g., `type Foo =`),
        // NOT an operator like `=` or `+=`. Otherwise `type = 'value'` (a variable
        // assignment) would be incorrectly stripped. See #2599.
        if (trimmed.starts_with("export type ") || trimmed.starts_with("type "))
            && !trimmed.starts_with("export type {")
            && trimmed.contains('=')
            && starts_with_type_name(trimmed)
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
            && starts_with_type_name(trimmed)
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
    // Track nesting context with a stack to distinguish function params `(...)`
    // from object literals `{...}`. Each entry is '(' or '{'.
    // The old approach used flat depth counters (paren_depth > brace_depth) which
    // broke when an object literal was nested inside multiple parens, e.g.:
    //   expect(fn({ key: Value }))  →  paren=2, brace=1  →  incorrectly stripped `: Value`
    // The stack approach checks the INNERMOST context: if the top of the stack is '{',
    // we're inside an object literal and `: Value` is a property, not a type annotation.
    let mut nesting_stack: Vec<char> = Vec::new();

    while i < len {
        // Skip single-line comments (`// ...`) so quotes inside them don't
        // trigger string scanning mode.  E.g. `// Import each module's factory`
        // contains a `'` that would otherwise open an unterminated string.
        if chars[i] == '/' && i + 1 < len && chars[i + 1] == '/' {
            while i < len && chars[i] != '\n' {
                result.push(chars[i]);
                i += 1;
            }
            continue;
        }
        // Skip block comments (`/* ... */`) for the same reason.
        if chars[i] == '/' && i + 1 < len && chars[i + 1] == '*' {
            result.push(chars[i]);
            result.push(chars[i + 1]);
            i += 2;
            while i < len {
                if chars[i] == '*' && i + 1 < len && chars[i + 1] == '/' {
                    result.push(chars[i]);
                    result.push(chars[i + 1]);
                    i += 2;
                    break;
                }
                result.push(chars[i]);
                i += 1;
            }
            continue;
        }

        // Skip string literals so unbalanced braces/parens inside them don't affect depth.
        if chars[i] == '\'' || chars[i] == '"' || chars[i] == '`' {
            let quote = chars[i];
            result.push(chars[i]);
            i += 1;
            while i < len {
                if chars[i] == '\\' && i + 1 < len {
                    result.push(chars[i]);
                    result.push(chars[i + 1]);
                    i += 2;
                    continue;
                }
                if chars[i] == quote {
                    result.push(chars[i]);
                    i += 1;
                    break;
                }
                result.push(chars[i]);
                i += 1;
            }
            continue;
        }

        // Track nesting context with a stack
        match chars[i] {
            '(' | '{' => nesting_stack.push(chars[i]),
            ')' if nesting_stack.last() == Some(&'(') => {
                nesting_stack.pop();
            }
            '}' if nesting_stack.last() == Some(&'{') => {
                nesting_stack.pop();
            }
            _ => {}
        }

        // The innermost nesting context determines whether `:` is a type annotation
        // (inside parens) or a property separator (inside braces).
        let innermost_is_paren = nesting_stack.last() == Some(&'(');

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
        // Only apply when the innermost nesting context is a paren `(` — that means
        // we're inside a function parameter list. If the innermost context is a brace
        // `{`, we're inside an object literal where `:` separates key from value.
        if chars[i] == ':' && i > 0 && is_ident(chars[i - 1]) && innermost_is_paren {
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
    let mask = template_literal_mask(&lines);

    for (idx, line) in lines.iter().enumerate() {
        // Skip lines inside template literals — they're string content, not real imports.
        if mask[idx] {
            continue;
        }

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
    let mask = template_literal_mask(&lines);

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

            // Find which line this import starts on
            let import_line_idx = code[..abs_start].matches('\n').count();

            // Skip imports inside template literals — they're string content.
            if import_line_idx < mask.len() && mask[import_line_idx] {
                pos = abs_start + 7;
                continue;
            }

            let rest = &code[abs_start + 7..];
            if rest.starts_with("type ") {
                pos = abs_start + 12;
                continue;
            }

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
    for (idx, line) in lines.iter().enumerate() {
        // Skip lines inside template literals
        if mask[idx] {
            continue;
        }
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

/// Rewrite `import.meta.hot` references to the Vertz runtime hot-context lookup.
///
/// The native vtz dev server doesn't use Bun's bundler-level `import.meta.hot`
/// API. Instead, the HMR client runtime exposes a per-module hot context via
/// `globalThis.__vtz_hot(moduleUrl)`. We rewrite source references so that code
/// written against the standard `import.meta.hot` API resolves to our runtime
/// at evaluation time.
///
/// In production (no HMR runtime present) `globalThis.__vtz_hot` is undefined,
/// so the optional-call chain short-circuits to `undefined` — preserving the
/// `ImportMetaHot | undefined` type contract exposed in `vertz/client`.
///
/// Rewrite rules:
/// - Replace every `import.meta.hot` occurrence with
///   `globalThis.__vtz_hot?.(import.meta.url)`.
/// - Skip occurrences inside string literals (`'…'`, `"…"`), template literals
///   (backticks), and comments (`// …`, `/* … */`).
fn rewrite_import_meta_hot(code: &str) -> String {
    const NEEDLE: &str = "import.meta.hot";
    const REPLACEMENT: &str = "globalThis.__vtz_hot?.(import.meta.url)";

    let bytes = code.as_bytes();
    let len = bytes.len();
    let mut result = String::with_capacity(len);
    let mut i = 0;

    // Advance `i` past the next char starting at byte `i`, pushing that char's
    // bytes to `result` verbatim. Preserves UTF-8 multi-byte sequences because
    // we advance by the full codepoint width each step.
    let step = |result: &mut String, i: &mut usize| {
        let start = *i;
        let byte = bytes[start];
        let width = if byte < 0x80 {
            1
        } else if byte < 0xC0 {
            // Continuation byte appearing outside a multi-byte sequence — treat
            // as a single byte so we never slice in the middle of a codepoint.
            1
        } else if byte < 0xE0 {
            2
        } else if byte < 0xF0 {
            3
        } else {
            4
        };
        let end = (start + width).min(len);
        result.push_str(&code[start..end]);
        *i = end;
    };

    while i < len {
        let c = bytes[i];

        // Line comment: preserve verbatim to end of line.
        if c == b'/' && i + 1 < len && bytes[i + 1] == b'/' {
            while i < len && bytes[i] != b'\n' {
                step(&mut result, &mut i);
            }
            continue;
        }

        // Block comment: preserve verbatim through closing `*/`.
        if c == b'/' && i + 1 < len && bytes[i + 1] == b'*' {
            result.push_str("/*");
            i += 2;
            while i + 1 < len && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                step(&mut result, &mut i);
            }
            if i + 1 < len {
                result.push_str("*/");
                i += 2;
            }
            continue;
        }

        // String or template literal: preserve contents verbatim.
        if c == b'\'' || c == b'"' || c == b'`' {
            result.push(c as char);
            i += 1;
            while i < len && bytes[i] != c {
                if bytes[i] == b'\\' && i + 1 < len {
                    // Copy escape byte + next char (may be multi-byte).
                    result.push('\\');
                    i += 1;
                    if i < len {
                        step(&mut result, &mut i);
                    }
                    continue;
                }
                step(&mut result, &mut i);
            }
            if i < len {
                result.push(c as char);
                i += 1;
            }
            continue;
        }

        // Regex literal: preserve verbatim. Uses the classic "previous token is
        // an operator" heuristic to distinguish from division. If this `/` does
        // not start a regex (i.e. it is division), we fall through to the normal
        // step and the rewrite check.
        if c == b'/' && is_regex_start(bytes, i) {
            let end = skip_regex_literal(bytes, i);
            result.push_str(&code[i..end]);
            i = end;
            continue;
        }

        // Replace `import.meta.hot` when it appears as a bare token.
        let prev_is_ident = i > 0 && is_ident_char(bytes[i - 1]);
        let prev_is_dot = i > 0 && bytes[i - 1] == b'.';
        if i + NEEDLE.len() <= len
            && &bytes[i..i + NEEDLE.len()] == NEEDLE.as_bytes()
            && !prev_is_ident
            && !prev_is_dot
            && (i + NEEDLE.len() == len || !is_ident_char(bytes[i + NEEDLE.len()]))
        {
            result.push_str(REPLACEMENT);
            i += NEEDLE.len();
            continue;
        }

        step(&mut result, &mut i);
    }

    result
}

/// True if `/` at `pos` in `bytes` starts a regex literal (versus a division
/// operator). Classic heuristic: the previous non-whitespace token must not
/// produce a value (identifier, number, `)`, `]`, `}`).
fn is_regex_start(bytes: &[u8], pos: usize) -> bool {
    if pos + 1 >= bytes.len() {
        return false;
    }
    let next = bytes[pos + 1];
    // Comments have already been handled earlier; a regex body can't begin
    // with `*` or `/`.
    if next == b'/' || next == b'*' {
        return false;
    }
    // Walk back to the previous non-whitespace byte.
    let mut j = pos;
    loop {
        if j == 0 {
            return true;
        }
        j -= 1;
        if !matches!(bytes[j], b' ' | b'\t' | b'\n' | b'\r') {
            break;
        }
    }
    let prev = bytes[j];
    // If the previous token ends with a value-producing char, `/` is division.
    if is_ident_char(prev) || matches!(prev, b')' | b']') {
        return false;
    }
    // `}` is ambiguous (block close vs object-literal close). Regex after `}`
    // is rare in practice; treat as division to stay conservative — matches
    // the existing heuristic in `vertz-compiler-core/src/import_injection.rs`.
    if prev == b'}' {
        return false;
    }
    true
}

/// Walk past a regex literal starting at `pos` (where `bytes[pos] == b'/'`).
/// Returns the byte index one past the closing `/` + flags. Handles escapes
/// and character classes (brackets) so that `/[^/]*/` is read as one regex.
fn skip_regex_literal(bytes: &[u8], pos: usize) -> usize {
    let len = bytes.len();
    let mut i = pos + 1;
    let mut in_class = false;
    while i < len {
        let c = bytes[i];
        if c == b'\\' && i + 1 < len {
            i += 2;
            continue;
        }
        if c == b'[' {
            in_class = true;
        } else if c == b']' {
            in_class = false;
        } else if c == b'/' && !in_class {
            i += 1;
            // Skip trailing flags (letters).
            while i < len && bytes[i].is_ascii_alphabetic() {
                i += 1;
            }
            return i;
        } else if c == b'\n' {
            // Unterminated regex — bail out at end of line.
            return i;
        }
        i += 1;
    }
    len
}

/// True if `b` is a valid continuation character for a JavaScript identifier.
fn is_ident_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$'
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
/// 3. Rewrite `import.meta.hot` references to the Vertz runtime hot-context lookup
pub fn generic_post_process(code: &str) -> String {
    let cleaned = strip_leftover_typescript(code);
    let deduped = deduplicate_imports(&cleaned);
    let no_cross_dupes = remove_cross_specifier_duplicates(&deduped);
    rewrite_import_meta_hot(&no_cross_dupes)
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

    fn test_plugin() -> Arc<dyn crate::plugin::VtzPlugin> {
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

    #[test]
    fn test_fix_api_names_does_not_rewrite_inside_single_quoted_string() {
        // Regression for #2801 — `effect(` inside a string literal must stay intact.
        let code = "it('flags effect() call', () => {});";
        let result = fix_compiler_api_names(code);
        assert!(
            result.contains("'flags effect() call'"),
            "string literal content must not be rewritten; got: {result}",
        );
        assert!(!result.contains("domEffect"));
    }

    #[test]
    fn test_fix_api_names_does_not_rewrite_inside_double_quoted_string() {
        let code = r#"const label = "calls effect() internally";"#;
        let result = fix_compiler_api_names(code);
        assert!(result.contains(r#""calls effect() internally""#));
        assert!(!result.contains("domEffect"));
    }

    #[test]
    fn test_fix_api_names_does_not_rewrite_inside_template_literal() {
        let code = "const msg = `run effect( here)`;";
        let result = fix_compiler_api_names(code);
        assert!(result.contains("`run effect( here)`"));
        assert!(!result.contains("domEffect"));
    }

    #[test]
    fn test_fix_api_names_does_not_rewrite_inside_line_comment() {
        let code = "// call effect() here\nconst x = 1;";
        let result = fix_compiler_api_names(code);
        assert!(result.contains("// call effect() here"));
        assert!(!result.contains("domEffect"));
    }

    #[test]
    fn test_fix_api_names_does_not_rewrite_inside_block_comment() {
        let code = "/* effect( */ const x = 1;";
        let result = fix_compiler_api_names(code);
        assert!(result.contains("/* effect( */"));
        assert!(!result.contains("domEffect"));
    }

    #[test]
    fn test_fix_api_names_rewrites_call_and_preserves_string_in_same_file() {
        let code = "import { effect } from '@vertz/ui';\n\
                    effect(() => {});\n\
                    it('flags effect() call', () => {});";
        let result = fix_compiler_api_names(code);
        // Import rewritten
        assert!(result.contains("{ domEffect }"));
        // Call site rewritten
        assert!(result.contains("domEffect(() => {});"));
        // String content preserved
        assert!(result.contains("'flags effect() call'"));
    }

    #[test]
    fn test_fix_api_names_handles_escaped_quote_inside_string() {
        // The closing quote is escaped, so the string continues.
        let code = r#"const s = 'can\'t call effect() here'; effect();"#;
        let result = fix_compiler_api_names(code);
        // Inside the string — preserved
        assert!(result.contains(r#"'can\'t call effect() here'"#));
        // Outside the string — rewritten
        assert!(result.contains("domEffect();"));
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

    #[test]
    fn test_deduplicate_inside_template_literal() {
        // Lines inside template literals that look like imports must NOT be
        // merged or removed — they're string content, not real imports.
        let code = "export function tpl() {\n  return `import { Button } from '@vertz/ui/components';\nimport { Dialog } from '@vertz/ui/components';\nconst x = 1;`;\n}";
        let result = deduplicate_imports(code);
        // Both import lines should survive (they're inside a template string)
        assert!(
            result.contains("import { Button } from '@vertz/ui/components'"),
            "Button import inside template should be preserved. Got:\n{}",
            result
        );
        assert!(
            result.contains("import { Dialog } from '@vertz/ui/components'"),
            "Dialog import inside template should be preserved. Got:\n{}",
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

    // ── rewrite_import_meta_hot ─────────────────────────────────────

    #[test]
    fn test_rewrite_import_meta_hot_replaces_reference() {
        let code = "const x = 1;\nimport.meta.hot?.accept();\nconst y = 2;";
        let result = rewrite_import_meta_hot(code);
        assert!(
            !result.contains("import.meta.hot"),
            "raw import.meta.hot should be rewritten, got:\n{}",
            result
        );
        assert!(
            result.contains("globalThis.__vtz_hot?.(import.meta.url)?.accept();"),
            "expected rewritten call, got:\n{}",
            result
        );
        assert!(result.contains("const x = 1;"));
        assert!(result.contains("const y = 2;"));
    }

    #[test]
    fn test_rewrite_import_meta_hot_no_references_passthrough() {
        let code = "const x = 1;";
        let result = rewrite_import_meta_hot(code);
        assert_eq!(result, code);
    }

    #[test]
    fn test_rewrite_import_meta_hot_preserves_template_literal() {
        let code = "const tpl = `\nimport.meta.hot.accept();\n`;";
        let result = rewrite_import_meta_hot(code);
        assert!(
            result.contains("`\nimport.meta.hot.accept();\n`"),
            "import.meta.hot inside template literal should be preserved. Got:\n{}",
            result
        );
    }

    #[test]
    fn test_rewrite_import_meta_hot_preserves_string_literals() {
        let code = "const msg = \"import.meta.hot is cool\";\nimport.meta.hot?.accept();";
        let result = rewrite_import_meta_hot(code);
        assert!(
            result.contains("\"import.meta.hot is cool\""),
            "string literal contents should be untouched, got:\n{}",
            result
        );
        assert!(
            result.contains("globalThis.__vtz_hot?.(import.meta.url)?.accept();"),
            "code reference should be rewritten, got:\n{}",
            result
        );
    }

    #[test]
    fn test_rewrite_import_meta_hot_preserves_comments() {
        let code = "// example: import.meta.hot.accept()\nimport.meta.hot?.decline();";
        let result = rewrite_import_meta_hot(code);
        assert!(
            result.contains("// example: import.meta.hot.accept()"),
            "comment contents should be untouched, got:\n{}",
            result
        );
        assert!(
            result.contains("globalThis.__vtz_hot?.(import.meta.url)?.decline();"),
            "code reference should be rewritten, got:\n{}",
            result
        );
    }

    #[test]
    fn test_rewrite_import_meta_hot_preserves_utf8() {
        let code = "const greeting = '日本語';\nimport.meta.hot?.accept();\n// comment 🎉\nconst emoji = \"🎨\";";
        let result = rewrite_import_meta_hot(code);
        assert!(
            result.contains("'日本語'"),
            "UTF-8 string contents must survive rewrite intact, got:\n{}",
            result
        );
        assert!(
            result.contains("🎉"),
            "UTF-8 in comments must survive rewrite intact, got:\n{}",
            result
        );
        assert!(
            result.contains("\"🎨\""),
            "UTF-8 in double-quoted strings must survive, got:\n{}",
            result
        );
        assert!(
            result.contains("globalThis.__vtz_hot?.(import.meta.url)?.accept();"),
            "rewrite should still apply, got:\n{}",
            result
        );
    }

    #[test]
    fn test_rewrite_import_meta_hot_preserves_regex_literal() {
        let code = "const re = /import\\.meta\\.hot/g;\nimport.meta.hot?.accept();";
        let result = rewrite_import_meta_hot(code);
        assert!(
            result.contains("/import\\.meta\\.hot/g"),
            "regex literal should be preserved, got:\n{}",
            result
        );
        assert!(
            result.contains("globalThis.__vtz_hot?.(import.meta.url)?.accept();"),
            "code reference should still be rewritten, got:\n{}",
            result
        );
    }

    #[test]
    fn test_rewrite_import_meta_hot_rewrites_at_file_start() {
        let code = "import.meta.hot?.accept();";
        let result = rewrite_import_meta_hot(code);
        assert_eq!(result, "globalThis.__vtz_hot?.(import.meta.url)?.accept();");
    }

    #[test]
    fn test_rewrite_import_meta_hot_skips_character_class_with_slashes() {
        // Regex with `/` inside a [class] must read as one regex, not split.
        let code = "const re = /[/]import\\.meta\\.hot/;";
        let result = rewrite_import_meta_hot(code);
        assert_eq!(result, code, "regex with inner `/` got corrupted");
    }

    #[test]
    fn test_rewrite_import_meta_hot_division_not_treated_as_regex() {
        // After an identifier or `)` — `/` is division, so the `import.meta.hot`
        // that follows must still be rewritten.
        let code = "const q = x / y;\nimport.meta.hot?.decline();";
        let result = rewrite_import_meta_hot(code);
        assert!(
            result.contains("const q = x / y;"),
            "division should be preserved, got:\n{}",
            result
        );
        assert!(
            result.contains("globalThis.__vtz_hot?.(import.meta.url)?.decline();"),
            "code reference should be rewritten, got:\n{}",
            result
        );
    }

    #[test]
    fn test_rewrite_import_meta_hot_rewrites_inside_if_guard() {
        let code = "if (import.meta.hot) { import.meta.hot.accept(); }";
        let result = rewrite_import_meta_hot(code);
        assert!(
            !result.contains("import.meta.hot)"),
            "raw import.meta.hot in guard should be rewritten, got:\n{}",
            result
        );
        assert_eq!(
            result
                .matches("globalThis.__vtz_hot?.(import.meta.url)")
                .count(),
            2,
            "both occurrences on one line should be rewritten, got:\n{}",
            result
        );
    }

    #[test]
    fn test_remove_cross_specifier_dupes_preserves_template_literal() {
        // An import inside a template literal that matches an injected specifier
        // must NOT be removed.
        let code = "import { signal } from '@vertz/ui';\nexport function tpl() {\n  return `import { signal } from '../runtime/signal';\n`;\n}";
        let result = remove_cross_specifier_duplicates(code);
        assert!(
            result.contains("from '../runtime/signal'"),
            "Import inside template literal should be preserved. Got:\n{}",
            result
        );
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
        // import.meta.hot rewritten to runtime hot-context lookup
        assert!(!result.contains(" import.meta.hot"));
        assert!(result.contains("globalThis.__vtz_hot?.(import.meta.url).accept();"));
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
    fn test_post_process_rewrites_import_meta_hot() {
        let code = "const x = 1;\nimport.meta.hot.accept();\nexport { x };";
        let result = post_process_compiled(code);
        assert!(
            result.contains("globalThis.__vtz_hot?.(import.meta.url).accept();"),
            "expected rewritten call, got:\n{}",
            result
        );
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
        // import.meta.hot rewritten to runtime hot-context lookup
        assert!(result.contains("globalThis.__vtz_hot?.(import.meta.url).accept();"));
        // signal deduped
        assert!(result.contains("signal"));
    }

    // ── strip_leftover_typescript: Fix 2 context-awareness ────────

    #[test]
    fn test_strip_leftover_preserves_uppercase_values_in_object_literals() {
        // Object literal: `address: Address,` must NOT be stripped.
        // Previously, Fix 2 would strip `: Address` because it matched
        // the pattern `<ident>: <UpperCase>,` — but that's a property
        // value, not a type annotation.
        let code = "const User = {\n  address: Address,\n};";
        let result = strip_leftover_typescript(code);
        assert!(
            result.contains("address: Address,"),
            "Object property value should be preserved. Got: {}",
            result
        );
    }

    #[test]
    fn test_strip_leftover_still_strips_type_annotations_in_params() {
        // Function param: `(x: Foo)` should still have `: Foo` stripped.
        let code = "function test(x: Foo) { return x; }";
        let result = strip_leftover_typescript(code);
        assert!(
            !result.contains(": Foo"),
            "Type annotation in params should be stripped. Got: {}",
            result
        );
    }

    #[test]
    fn test_strip_leftover_strips_type_in_multi_param() {
        // Multiple params: `(a: Bar, b: Baz)` — both should be stripped.
        let code = "function test(a: Bar, b: Baz) { return a; }";
        let result = strip_leftover_typescript(code);
        assert!(
            !result.contains(": Bar") && !result.contains(": Baz"),
            "Type annotations in multi-param should be stripped. Got: {}",
            result
        );
    }

    #[test]
    fn test_strip_leftover_preserves_destructured_object_param() {
        // Destructured object param: `({ schema: Schema })` — `: Schema` is a
        // value binding, not a type annotation. paren_depth == brace_depth here.
        let code = "function test({ schema: Schema }) { return Schema; }";
        let result = strip_leftover_typescript(code);
        assert!(
            result.contains("schema: Schema"),
            "Destructured object param value should be preserved. Got: {}",
            result
        );
    }

    #[test]
    fn test_strip_leftover_preserves_object_in_nested_parens() {
        // #2576: Object literal inside nested parens must NOT have property
        // values stripped. `expect(fn({ key: Value }))` has paren_depth=2
        // and brace_depth=1 — the old paren_depth > brace_depth check
        // incorrectly stripped `: Value`.
        let code =
            "await expect(asyncFn({ toolCtx: OUTER_VALUE, msg: 'test' })).rejects.toThrow('x');";
        let result = strip_leftover_typescript(code);
        assert!(
            result.contains("toolCtx: OUTER_VALUE"),
            "Object property in nested parens should be preserved. Got: {}",
            result
        );
    }

    #[test]
    fn test_strip_leftover_preserves_object_in_deeply_nested_parens() {
        // Even deeper nesting: 3 parens, 1 brace
        let code = "outer(middle(inner({ key: Value, other: Another })))";
        let result = strip_leftover_typescript(code);
        assert!(
            result.contains("key: Value") && result.contains("other: Another"),
            "Object properties in deeply nested parens should be preserved. Got: {}",
            result
        );
    }

    #[test]
    fn test_strip_leftover_strips_type_in_arrow_inside_parens() {
        // Arrow function param inside parens: `((x: Type) => x)` — still strip `: Type`
        let code = "const fn = ((x: Foo) => x);";
        let result = strip_leftover_typescript(code);
        assert!(
            !result.contains(": Foo"),
            "Type annotation in arrow param inside parens should be stripped. Got: {}",
            result
        );
    }

    #[test]
    fn test_strip_leftover_skips_string_literals_with_unbalanced_braces() {
        // String literal contains unbalanced `{` — depth tracker must skip it.
        let code = "function test(x: Foo) { const s = \"hello { world\"; return s; }";
        let result = strip_leftover_typescript(code);
        assert!(
            !result.contains(": Foo"),
            "Type annotation should still be stripped despite string with unbalanced brace. Got: {}",
            result
        );
        assert!(
            result.contains("\"hello { world\""),
            "String literal should be preserved. Got: {}",
            result
        );
    }

    #[test]
    fn test_strip_leftover_skips_comments_with_quotes() {
        // A single quote inside a JS comment (like `module's`) must NOT trigger
        // the string scanner in Phase 2.  If it does, the scanner enters string
        // mode, consumes characters across lines until it finds a matching quote
        // (possibly inside a template literal), and corrupts nesting state —
        // causing later string-literal content to be modified.
        let code = r#"export function emitClientFile(moduleNames) {
  const lines = ['// Auto-generated', ''];

  // Import each module's factory
  for (const name of moduleNames) {
    const pascalName = capitalize(name);
    lines.push(`import { create${pascalName}Module } from './modules/${name}';`);
  }

  lines.push('');
  lines.push('export function createClient(client: HttpClient) {');
  lines.push('  return {');

  lines.push('  };');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}"#;

        let result = strip_leftover_typescript(code);

        // The `: HttpClient` is INSIDE a string literal — must be preserved.
        assert!(
            result.contains("client: HttpClient"),
            "String literal content `: HttpClient` was incorrectly stripped. Got:\n{}",
            result
        );
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
    fn test_strip_preserves_type_variable_assignment() {
        // Variable named `type` must NOT be stripped — it's a valid JS identifier, not a type alias.
        // See: https://github.com/vertz-dev/vertz/issues/2599
        let code = "let type = '';\ntype = 'event: data'.slice(7).trim();";
        let result = strip_leftover_typescript(code);
        assert!(
            result.contains("type = 'event: data'"),
            "Variable assignment `type = ...` should be preserved. Got: {}",
            result
        );
        assert!(
            result.contains("let type = ''"),
            "Variable declaration `let type = ''` should be preserved. Got: {}",
            result
        );
    }

    #[test]
    fn test_strip_preserves_type_compound_assignment() {
        let code = "let type = '';\ntype += 'suffix';";
        let result = strip_leftover_typescript(code);
        assert!(
            result.contains("type += 'suffix'"),
            "Compound assignment `type += ...` should be preserved. Got: {}",
            result
        );
    }

    #[test]
    fn test_strip_still_removes_real_type_aliases() {
        // Ensure the fix doesn't break actual type alias stripping
        let code = "type Foo = string;\ntype Bar = { x: number };\nconst x = 1;";
        let result = strip_leftover_typescript(code);
        assert!(
            !result.contains("type Foo"),
            "Type alias should still be stripped"
        );
        assert!(
            !result.contains("type Bar"),
            "Type alias should still be stripped"
        );
        assert!(result.contains("const x = 1;"));
    }

    #[test]
    fn test_strip_removes_underscore_and_dollar_type_aliases() {
        let code = "type _Internal = number;\ntype $Computed = boolean;\nconst x = 1;";
        let result = strip_leftover_typescript(code);
        assert!(
            !result.contains("type _Internal"),
            "Type alias with underscore should be stripped"
        );
        assert!(
            !result.contains("type $Computed"),
            "Type alias with dollar should be stripped"
        );
        assert!(result.contains("const x = 1;"));
    }

    #[test]
    fn test_strip_preserves_type_comparison() {
        let code = "if (type == 'string') {}";
        let result = strip_leftover_typescript(code);
        assert!(
            result.contains("type == 'string'"),
            "Comparison should be preserved. Got: {}",
            result
        );
    }

    #[test]
    fn test_strip_preserves_export_type_variable_assignment() {
        // `export type =` is not a valid TS type alias; preserve it
        let code = "export type = 'value';";
        let result = strip_leftover_typescript(code);
        assert!(
            result.contains("export type = 'value'"),
            "Export variable assignment should be preserved. Got: {}",
            result
        );
    }

    #[test]
    fn test_strip_preserves_standalone_type_variable() {
        // `type;` as a standalone expression statement
        let code = "type;\nconst x = 1;";
        let result = strip_leftover_typescript(code);
        assert!(
            result.contains("const x = 1;"),
            "Non-type code should be preserved"
        );
    }

    #[test]
    fn test_strip_export_type_star_from() {
        let code = "export type * from './types';\nconst x = 1;";
        let result = strip_leftover_typescript(code);
        assert!(
            !result.contains("export type"),
            "export type * from should be stripped. Got: {}",
            result
        );
        assert!(result.contains("const x = 1;"));
    }

    #[test]
    fn test_strip_export_type_star_as_namespace_from() {
        let code = "export type * as Types from './types';\nconst x = 1;";
        let result = strip_leftover_typescript(code);
        assert!(
            !result.contains("export type"),
            "export type * as namespace from should be stripped. Got: {}",
            result
        );
        assert!(result.contains("const x = 1;"));
    }

    /// Lines inside template literals must not be stripped, even if they
    /// look like TypeScript syntax (e.g., documentation code examples).
    #[test]
    fn test_strip_preserves_type_syntax_inside_template_literals() {
        let code = "export function tpl() {\n  return `export type * from '#generated/types';\nexport type Foo = string;\nimport type { Bar } from './bar';`;\n}";
        let result = strip_leftover_typescript(code);
        assert!(
            result.contains("export type * from '#generated/types'"),
            "export type * inside template literal should be preserved. Got: {}",
            result
        );
        assert!(
            result.contains("export type Foo = string"),
            "export type alias inside template literal should be preserved. Got: {}",
            result
        );
        assert!(
            result.contains("import type { Bar } from './bar'"),
            "import type inside template literal should be preserved. Got: {}",
            result
        );
    }

    /// Full compilation pipeline for a file with template strings containing
    /// TypeScript syntax and `@vertz/ui` imports — nothing should leak.
    #[test]
    fn test_compile_templates_no_vertz_ui_leak() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(
            src_dir.join("templates.ts"),
            r#"export function ruleTemplate(): string {
  return `import { useDialogStack } from '@vertz/ui';
export type * from '#generated/types';
import type { Foo } from './foo';
const d = useDialogStack();`;
}
export function appTemplate(): string {
  return `import { css } from 'vertz/ui';
export function App() {
  const s = signal(0);
  return '<div>' + s + '</div>';
}`;
}
"#,
        )
        .unwrap();

        let pipeline = create_pipeline(tmp.path());
        let result = pipeline.compile_for_browser(&src_dir.join("templates.ts"));

        // Check that no @vertz/ui import leaked outside template strings
        let mut in_template = false;
        for line in result.code.lines() {
            let was = in_template;
            for ch in line.chars() {
                if ch == '`' {
                    in_template = !in_template;
                }
            }
            if !was && line.trim().starts_with("import ") && line.contains("@vertz/ui") {
                panic!(
                    "Found @vertz/ui import outside template string:\n  {}\n\nFull code:\n{}",
                    line, result.code
                );
            }
        }
        // Template content should be preserved (not stripped)
        assert!(
            result.code.contains("@vertz/ui"),
            "Template content with @vertz/ui should be preserved"
        );
        assert!(
            result.code.contains("export type *"),
            "Template content with export type * should be preserved"
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

    /// Regression test for #2668: the full pipeline (AST strip + strip_leftover_typescript)
    /// must not modify string literal content in large files.
    #[test]
    fn test_full_pipeline_preserves_string_literal_type_annotations() {
        // Use the actual spike.ts content from the compiler package
        let spike_ts =
            include_str!("../../../../packages/compiler/src/__tests__/codegen-poc/spike.ts");

        // Run the AST stripper (same as vertz_compiler_core::compile does)
        let compile_result = vertz_compiler_core::compile(
            spike_ts,
            vertz_compiler_core::CompileOptions {
                filename: Some("spike.ts".to_string()),
                target: Some("server".to_string()),
                fast_refresh: Some(false),
                skip_css_transform: Some(true),
                ..Default::default()
            },
        );

        // Run strip_leftover_typescript on the AST-stripped output
        let result = strip_leftover_typescript(&compile_result.code);

        // First, check what the AST stripper produced (before strip_leftover_typescript)
        // This helps us understand what strip_leftover_typescript receives
        let ast_output_has_it = compile_result
            .code
            .contains("'export function createClient(client: HttpClient) {'");
        if !ast_output_has_it {
            panic!(
                "BUG IS IN AST STRIPPER: The AST stripper itself corrupted the string literal.\n\
                 Lines containing 'createClient' in AST output:\n{}",
                compile_result
                    .code
                    .lines()
                    .filter(|l| l.contains("createClient"))
                    .collect::<Vec<_>>()
                    .join("\n")
            );
        }

        // The string literal 'export function createClient(client: HttpClient) {'
        // must NOT have `: HttpClient` stripped from it.
        assert!(
            result.contains("'export function createClient(client: HttpClient) {'"),
            "BUG IS IN strip_leftover_typescript: The `: HttpClient` inside the string was \
             incorrectly stripped. AST output was correct but strip_leftover_typescript corrupted it.\n\
             Lines containing 'createClient' after strip_leftover_typescript:\n{}",
            result.lines()
                .filter(|l| l.contains("createClient"))
                .collect::<Vec<_>>()
                .join("\n")
        );
    }

    #[test]
    fn test_strip_leftover_skips_block_comments_with_quotes() {
        // Block comments can also contain quotes that confuse the scanner.
        let code = "function test() { /* it's a comment */ const s = 'hello: World'; return s; }";
        let result = strip_leftover_typescript(code);
        assert!(
            result.contains("'hello: World'"),
            "String after block comment with quote must be preserved. Got: {}",
            result
        );
    }
}
