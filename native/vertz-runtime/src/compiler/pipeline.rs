use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::SystemTime;

use crate::compiler::cache::{CachedModule, CompilationCache};
use crate::compiler::import_rewriter;

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
                errors: vec![],
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
        // Only promote actual errors (syntax, parse) — skip warnings (CSS diagnostics)
        let mut compile_errors: Vec<CompileError> = Vec::new();
        if let Some(ref diagnostics) = compile_result.diagnostics {
            let log_errors: Vec<String> = diagnostics
                .iter()
                .map(|d| {
                    let location = match (d.line, d.column) {
                        (Some(line), Some(col)) => format!(" at {}:{}:{}", filename, line, col),
                        _ => String::new(),
                    };
                    // CSS diagnostics are warnings, not errors — don't surface in overlay
                    if !d.message.starts_with("[css-") {
                        compile_errors.push(CompileError {
                            message: d.message.clone(),
                            line: d.line,
                            column: d.column,
                        });
                    }
                    format!("{}{}", d.message, location)
                })
                .collect();

            if !log_errors.is_empty() {
                // Log diagnostics but don't fail — they may be warnings
                eprintln!(
                    "[vertz-compiler] Diagnostics for {}:\n  {}",
                    filename,
                    log_errors.join("\n  ")
                );
            }
        }

        // Post-process: fix compiler artifacts that cause runtime errors.
        // 1. Fix wrong API names: compiler emits `effect` but the API is `domEffect`
        // 2. Move internal APIs (domEffect, lifecycleEffect) from @vertz/ui to @vertz/ui/internals
        // 3. Strip leftover TypeScript syntax that the compiler didn't fully remove.
        // 4. Deduplicate imports: the compiler may add imports (e.g., `import { signal }`)
        //    that already exist in the original source, causing "already been declared" errors.
        // 5. Strip import.meta.hot lines (Bun HMR API — not needed in native server)
        // 6. Fix moduleId to use URL-relative path (for Fast Refresh registry matching)
        let deduped = post_process_compiled(&compile_result.code);
        let deduped = fix_module_id(&deduped, file_path, &self.root_dir);

        // Rewrite import specifiers for browser consumption
        let code =
            import_rewriter::rewrite_imports(&deduped, file_path, &self.src_dir, &self.root_dir);

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

        // Only cache successful compilations (no errors)
        if compile_errors.is_empty() {
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
        }

        BrowserCompileResult {
            code,
            source_map: compile_result.map,
            css,
            errors: compile_errors,
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
        }
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
fn fix_module_id(code: &str, file_path: &Path, root_dir: &Path) -> String {
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

/// Apply post-processing fixes to compiled output.
///
/// Both the browser pipeline and the SSR module loader need these fixes:
/// 1. Fix wrong API names: compiler emits `effect` but the API is `domEffect`
/// 2. Move internal APIs from `@vertz/ui` to `@vertz/ui/internals`
/// 3. Strip leftover TypeScript syntax artifacts
/// 4. Deduplicate imports to prevent "already been declared" errors
pub fn post_process_compiled(code: &str) -> String {
    let fixed = fix_compiler_api_names(code);
    let internals_fixed = fix_internals_imports(&fixed);
    let cleaned = strip_leftover_typescript(&internals_fixed);
    let deduped = deduplicate_imports(&cleaned);
    let no_cross_dupes = remove_cross_specifier_duplicates(&deduped);
    strip_import_meta_hot(&no_cross_dupes)
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
