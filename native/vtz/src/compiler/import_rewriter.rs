use std::path::{Path, PathBuf};

use crate::deps::resolve;
use crate::tsconfig::TsconfigPaths;

/// Rewrite import specifiers in compiled JavaScript for browser consumption.
///
/// Transforms:
/// - Bare specifiers (`@vertz/ui`, `zod`) → `/@deps/@vertz/ui`, `/@deps/zod`
/// - Path aliases (`@/components/Button`) → resolved file path via tsconfig paths
/// - Relative specifiers (`./Foo`, `../utils/format`) → absolute paths with extensions
/// - Already-absolute URLs (`http://`, `https://`) → unchanged
/// - Already-rewritten paths (`/@deps/`, `/@css/`) → unchanged
pub fn rewrite_imports(
    code: &str,
    file_path: &Path,
    src_dir: &Path,
    root_dir: &Path,
    tsconfig_paths: Option<&TsconfigPaths>,
) -> String {
    let mut result = String::with_capacity(code.len() + 256);
    let chars: Vec<char> = code.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        // Look for import/export statements and dynamic import()
        if i + 6 < len && matches_word(&chars, i, "import") {
            // Could be: import ... from '...', import '...', import('...')
            let start = i;
            i += 6;
            i = skip_whitespace(&chars, i, len);

            // Dynamic import: import(
            if i < len && chars[i] == '(' {
                // Write everything up to the opening paren
                result.push_str(&collect_chars(&chars, start, i + 1));
                i += 1;
                i = skip_whitespace(&chars, i, len);
                i = rewrite_string_specifier(
                    &chars,
                    i,
                    len,
                    file_path,
                    src_dir,
                    root_dir,
                    tsconfig_paths,
                    &mut result,
                );
                continue;
            }

            // Static import — find the 'from' keyword or bare string
            // import 'side-effect'
            if i < len && (chars[i] == '\'' || chars[i] == '"') {
                result.push_str(&collect_chars(&chars, start, i));
                i = rewrite_string_specifier(
                    &chars,
                    i,
                    len,
                    file_path,
                    src_dir,
                    root_dir,
                    tsconfig_paths,
                    &mut result,
                );
                continue;
            }

            // import ... from '...'
            if let Some(from_pos) = find_from_keyword(&chars, i, len) {
                let after_from = from_pos + 4;
                let after_ws = skip_whitespace(&chars, after_from, len);
                if after_ws < len && (chars[after_ws] == '\'' || chars[after_ws] == '"') {
                    result.push_str(&collect_chars(&chars, start, after_ws));
                    i = rewrite_string_specifier(
                        &chars,
                        after_ws,
                        len,
                        file_path,
                        src_dir,
                        root_dir,
                        tsconfig_paths,
                        &mut result,
                    );
                    continue;
                }
            }

            // Not an import we recognize — just write "import" and continue
            result.push_str(&collect_chars(&chars, start, i));
            continue;
        }

        // Look for export ... from '...'
        if i + 6 < len && matches_word(&chars, i, "export") {
            let start = i;
            i += 6;

            if let Some(from_pos) = find_from_keyword(&chars, i, len) {
                let after_from = from_pos + 4;
                let after_ws = skip_whitespace(&chars, after_from, len);
                if after_ws < len && (chars[after_ws] == '\'' || chars[after_ws] == '"') {
                    result.push_str(&collect_chars(&chars, start, after_ws));
                    i = rewrite_string_specifier(
                        &chars,
                        after_ws,
                        len,
                        file_path,
                        src_dir,
                        root_dir,
                        tsconfig_paths,
                        &mut result,
                    );
                    continue;
                }
            }

            result.push_str(&collect_chars(&chars, start, i));
            continue;
        }

        result.push(chars[i]);
        i += 1;
    }

    result
}

/// Check if the characters at position `pos` match the given word,
/// preceded by a non-identifier character (or start of input).
fn matches_word(chars: &[char], pos: usize, word: &str) -> bool {
    let word_chars: Vec<char> = word.chars().collect();
    let end = pos + word_chars.len();

    if end > chars.len() {
        return false;
    }

    // Check that the word matches
    for (j, wc) in word_chars.iter().enumerate() {
        if chars[pos + j] != *wc {
            return false;
        }
    }

    // Check that it's preceded by a non-identifier char (or start of string)
    if pos > 0 && is_ident_char(chars[pos - 1]) {
        return false;
    }

    // Check that it's followed by a non-identifier char
    if end < chars.len() && is_ident_char(chars[end]) {
        return false;
    }

    true
}

fn is_ident_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '$'
}

fn skip_whitespace(chars: &[char], mut pos: usize, len: usize) -> usize {
    while pos < len && chars[pos].is_whitespace() {
        pos += 1;
    }
    pos
}

fn collect_chars(chars: &[char], start: usize, end: usize) -> String {
    chars[start..end].iter().collect()
}

/// Find the 'from' keyword starting from `pos`, looking ahead within the same statement.
/// Returns the position of the 'f' in 'from'.
fn find_from_keyword(chars: &[char], start: usize, len: usize) -> Option<usize> {
    let mut i = start;
    // We only search within a reasonable distance (one statement)
    let limit = len.min(start + 2000);

    while i < limit {
        // Skip string literals to avoid matching 'from' inside strings
        if i < len && (chars[i] == '\'' || chars[i] == '"') {
            let quote = chars[i];
            i += 1;
            while i < len && chars[i] != quote {
                if chars[i] == '\\' {
                    i += 1;
                }
                i += 1;
            }
            if i < len {
                i += 1;
            }
            continue;
        }

        // End of statement
        if i < len && (chars[i] == ';' || chars[i] == '\n') {
            // For newline, check if the next non-whitespace is 'from'
            if chars[i] == '\n' {
                let next = skip_whitespace(chars, i + 1, len);
                if next + 4 <= len && matches_word(chars, next, "from") {
                    return Some(next);
                }
            }
            // For semicolons, we stop searching
            if chars[i] == ';' {
                return None;
            }
        }

        if i + 4 <= len && matches_word(chars, i, "from") {
            return Some(i);
        }

        i += 1;
    }

    None
}

/// Rewrite a string-quoted specifier at position `pos`.
/// `pos` points to the opening quote character.
/// Returns the new position after the closing quote.
// All parameters are needed: chars+pos+len for parsing, file_path+src_dir+root_dir+tsconfig_paths
// for resolution, result for output.
#[allow(clippy::too_many_arguments)]
fn rewrite_string_specifier(
    chars: &[char],
    pos: usize,
    len: usize,
    file_path: &Path,
    src_dir: &Path,
    root_dir: &Path,
    tsconfig_paths: Option<&TsconfigPaths>,
    result: &mut String,
) -> usize {
    if pos >= len {
        return pos;
    }

    let quote = chars[pos];
    if quote != '\'' && quote != '"' {
        result.push(chars[pos]);
        return pos + 1;
    }

    // Find the closing quote
    let mut end = pos + 1;
    while end < len && chars[end] != quote {
        if chars[end] == '\\' {
            end += 1;
        }
        end += 1;
    }

    let specifier: String = chars[pos + 1..end].iter().collect();
    let rewritten = rewrite_specifier(&specifier, file_path, src_dir, root_dir, tsconfig_paths);

    result.push(quote);
    result.push_str(&rewritten);
    if end < len {
        result.push(chars[end]); // closing quote
    }

    end + 1
}

/// Rewrite a single import specifier.
pub fn rewrite_specifier(
    specifier: &str,
    file_path: &Path,
    src_dir: &Path,
    root_dir: &Path,
    tsconfig_paths: Option<&TsconfigPaths>,
) -> String {
    let url = rewrite_specifier_inner(specifier, file_path, src_dir, root_dir, tsconfig_paths);

    // Append ?import for asset URLs so the module server generates a synthetic
    // JS module (`export default '<url>'`) instead of trying to compile the file.
    if let Some(dot_pos) = url.rfind('.') {
        let ext = &url[dot_pos + 1..];
        if is_asset_extension(ext) {
            return format!("{}?import", url);
        }
    }

    url
}

/// Inner implementation of specifier rewriting (without the asset `?import` post-processing).
fn rewrite_specifier_inner(
    specifier: &str,
    file_path: &Path,
    src_dir: &Path,
    root_dir: &Path,
    tsconfig_paths: Option<&TsconfigPaths>,
) -> String {
    // Already-absolute URLs — don't touch
    if specifier.starts_with("http://")
        || specifier.starts_with("https://")
        || specifier.starts_with("data:")
        || specifier.starts_with("blob:")
    {
        return specifier.to_string();
    }

    // Already-rewritten paths — don't touch
    if specifier.starts_with("/@deps/") || specifier.starts_with("/@css/") {
        return specifier.to_string();
    }

    // Relative specifiers: ./foo, ../bar
    if specifier.starts_with("./") || specifier.starts_with("../") {
        return resolve_relative_specifier(specifier, file_path, src_dir, root_dir);
    }

    // Path aliases: resolve via tsconfig.json compilerOptions.paths
    // This must happen before bare specifier handling so that aliases like
    // `@/components/Button` don't get routed to `/@deps/@/components/Button`.
    if let Some(paths) = tsconfig_paths {
        if let Some(resolved) = paths.resolve_alias(specifier, root_dir) {
            // Convert resolved absolute path to a URL path relative to root_dir
            if let Ok(rel) = resolved.strip_prefix(root_dir) {
                let rel_str = rel.to_string_lossy().replace('\\', "/");
                return format!("/{}", rel_str);
            }
        }
    }

    // Bare specifiers: resolve via package.json exports to get full file path,
    // so that relative imports within packages resolve correctly in the browser.
    // e.g., `@vertz/ui/internals` → `/@deps/@vertz/ui/dist/src/internals.js`
    //
    // Use the file's parent directory as the resolution starting point — this matches
    // Node.js resolution behavior and is critical for monorepos where transitive deps
    // may be installed in a different workspace's node_modules.
    let resolve_from = file_path.parent().unwrap_or(root_dir);
    resolve::resolve_to_deps_url_from(specifier, root_dir, resolve_from)
}

/// Resolve a relative specifier to an absolute URL path.
fn resolve_relative_specifier(
    specifier: &str,
    file_path: &Path,
    src_dir: &Path,
    root_dir: &Path,
) -> String {
    let base_dir = file_path.parent().unwrap_or(src_dir);
    let resolved = normalize_path(&base_dir.join(specifier));

    // Try to resolve the extension
    let with_ext = resolve_extension(&resolved, root_dir);

    // Convert to a URL path relative to root_dir.
    // Files inside node_modules/ use the /@deps/ prefix so the browser
    // routes them through the dependency handler.
    if let Ok(rel) = with_ext.strip_prefix(root_dir) {
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        if let Some(rest) = rel_str.strip_prefix("node_modules/") {
            format!("/@deps/{}", rest)
        } else {
            format!("/{}", rel_str)
        }
    } else {
        // Fallback: use the specifier as-is
        specifier.to_string()
    }
}

/// Resolve a path by adding an extension if the path doesn't have one
/// and a file with a known extension exists.
fn resolve_extension(path: &Path, _root_dir: &Path) -> PathBuf {
    // If the path already has a known extension, return as-is
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        if matches!(ext, "ts" | "tsx" | "js" | "jsx" | "mjs" | "css") || is_asset_extension(ext) {
            return path.to_path_buf();
        }
    }

    // Try common extensions
    let extensions = [".tsx", ".ts", ".jsx", ".js", ".mjs"];
    for ext in &extensions {
        let with_ext = PathBuf::from(format!("{}{}", path.display(), ext));
        if with_ext.exists() {
            return with_ext;
        }
    }

    // Try as directory with index
    if path.is_dir() {
        let index_files = ["index.tsx", "index.ts", "index.jsx", "index.js"];
        for index in &index_files {
            let index_path = path.join(index);
            if index_path.exists() {
                return index_path;
            }
        }
    }

    // Fallback: append .tsx (most likely for Vertz apps)
    PathBuf::from(format!("{}.tsx", path.display()))
}

/// Check if a file extension is a static asset (image, font, etc.).
///
/// Asset imports are handled differently from code imports: the import rewriter
/// appends `?import` so the module server generates a synthetic JS module
/// that exports the asset's URL string.
pub fn is_asset_extension(ext: &str) -> bool {
    matches!(
        ext,
        "svg" | "png" | "jpg" | "jpeg" | "gif" | "webp" | "ico" | "woff" | "woff2" | "ttf" | "eot"
    )
}

/// Normalize a path by resolving `.` and `..` components.
fn normalize_path(path: &Path) -> PathBuf {
    let mut components = Vec::new();

    for component in path.components() {
        match component {
            std::path::Component::ParentDir => {
                components.pop();
            }
            std::path::Component::CurDir => {}
            other => {
                components.push(other);
            }
        }
    }

    components.iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Asset extension detection tests ──

    #[test]
    fn test_is_asset_extension_returns_true_for_images() {
        assert!(is_asset_extension("svg"));
        assert!(is_asset_extension("png"));
        assert!(is_asset_extension("jpg"));
        assert!(is_asset_extension("jpeg"));
        assert!(is_asset_extension("gif"));
        assert!(is_asset_extension("webp"));
        assert!(is_asset_extension("ico"));
    }

    #[test]
    fn test_is_asset_extension_returns_true_for_fonts() {
        assert!(is_asset_extension("woff"));
        assert!(is_asset_extension("woff2"));
        assert!(is_asset_extension("ttf"));
        assert!(is_asset_extension("eot"));
    }

    #[test]
    fn test_is_asset_extension_returns_false_for_code() {
        assert!(!is_asset_extension("ts"));
        assert!(!is_asset_extension("tsx"));
        assert!(!is_asset_extension("js"));
        assert!(!is_asset_extension("jsx"));
        assert!(!is_asset_extension("css"));
    }

    #[test]
    fn test_rewrite_bare_specifier_to_deps() {
        let result = rewrite_specifier(
            "@vertz/ui",
            Path::new("/project/src/app.tsx"),
            Path::new("/project/src"),
            Path::new("/project"),
            None,
        );
        assert_eq!(result, "/@deps/@vertz/ui");
    }

    #[test]
    fn test_rewrite_bare_package_to_deps() {
        let result = rewrite_specifier(
            "zod",
            Path::new("/project/src/app.tsx"),
            Path::new("/project/src"),
            Path::new("/project"),
            None,
        );
        assert_eq!(result, "/@deps/zod");
    }

    #[test]
    fn test_rewrite_scoped_package_subpath() {
        let result = rewrite_specifier(
            "@vertz/ui/components",
            Path::new("/project/src/app.tsx"),
            Path::new("/project/src"),
            Path::new("/project"),
            None,
        );
        assert_eq!(result, "/@deps/@vertz/ui/components");
    }

    #[test]
    fn test_rewrite_http_url_unchanged() {
        let result = rewrite_specifier(
            "https://cdn.example.com/lib.js",
            Path::new("/project/src/app.tsx"),
            Path::new("/project/src"),
            Path::new("/project"),
            None,
        );
        assert_eq!(result, "https://cdn.example.com/lib.js");
    }

    #[test]
    fn test_rewrite_already_rewritten_deps_unchanged() {
        let result = rewrite_specifier(
            "/@deps/@vertz/ui",
            Path::new("/project/src/app.tsx"),
            Path::new("/project/src"),
            Path::new("/project"),
            None,
        );
        assert_eq!(result, "/@deps/@vertz/ui");
    }

    #[test]
    fn test_rewrite_already_rewritten_css_unchanged() {
        let result = rewrite_specifier(
            "/@css/button.css",
            Path::new("/project/src/app.tsx"),
            Path::new("/project/src"),
            Path::new("/project"),
            None,
        );
        assert_eq!(result, "/@css/button.css");
    }

    #[test]
    fn test_rewrite_relative_specifier_with_file_on_disk() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(src_dir.join("components")).unwrap();
        std::fs::write(src_dir.join("components/Button.tsx"), "").unwrap();

        let result = rewrite_specifier(
            "./components/Button",
            &src_dir.join("app.tsx"),
            &src_dir,
            tmp.path(),
            None,
        );
        assert_eq!(result, "/src/components/Button.tsx");
    }

    #[test]
    fn test_rewrite_relative_parent_specifier() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(src_dir.join("components")).unwrap();
        std::fs::create_dir_all(src_dir.join("utils")).unwrap();
        std::fs::write(src_dir.join("utils/format.ts"), "").unwrap();

        let result = rewrite_specifier(
            "../utils/format",
            &src_dir.join("components/Button.tsx"),
            &src_dir,
            tmp.path(),
            None,
        );
        assert_eq!(result, "/src/utils/format.ts");
    }

    #[test]
    fn test_rewrite_imports_static_import() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();

        let code = r#"import { signal } from '@vertz/ui';
import { z } from 'zod';
const x = 1;"#;

        let result = rewrite_imports(code, &src_dir.join("app.tsx"), &src_dir, tmp.path(), None);

        assert!(
            result.contains("from '/@deps/@vertz/ui'"),
            "Result: {}",
            result
        );
        assert!(result.contains("from '/@deps/zod'"), "Result: {}", result);
    }

    #[test]
    fn test_rewrite_imports_dynamic_import() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();

        let code = r#"const mod = import('@vertz/ui');"#;

        let result = rewrite_imports(code, &src_dir.join("app.tsx"), &src_dir, tmp.path(), None);

        assert!(
            result.contains("import('/@deps/@vertz/ui')"),
            "Result: {}",
            result
        );
    }

    #[test]
    fn test_rewrite_imports_export_from() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();

        let code = r#"export { signal } from '@vertz/ui';"#;

        let result = rewrite_imports(code, &src_dir.join("app.tsx"), &src_dir, tmp.path(), None);

        assert!(
            result.contains("from '/@deps/@vertz/ui'"),
            "Result: {}",
            result
        );
    }

    #[test]
    fn test_rewrite_imports_side_effect_import() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();

        let code = r#"import '@vertz/ui/styles';"#;

        let result = rewrite_imports(code, &src_dir.join("app.tsx"), &src_dir, tmp.path(), None);

        assert!(
            result.contains("import '/@deps/@vertz/ui/styles'"),
            "Result: {}",
            result
        );
    }

    #[test]
    fn test_rewrite_imports_preserves_non_import_code() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();

        let code = r#"const x = 1;
function foo() { return x + 2; }
export default foo;"#;

        let result = rewrite_imports(code, &src_dir.join("app.tsx"), &src_dir, tmp.path(), None);

        assert_eq!(result, code);
    }

    #[test]
    fn test_normalize_path() {
        let p = normalize_path(Path::new("/project/src/components/../utils/format"));
        assert_eq!(p, PathBuf::from("/project/src/utils/format"));
    }

    #[test]
    fn test_rewrite_relative_css_import() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("styles.css"), "body { margin: 0; }").unwrap();

        let result = rewrite_specifier(
            "./styles.css",
            &src_dir.join("app.tsx"),
            &src_dir,
            tmp.path(),
            None,
        );
        assert_eq!(result, "/src/styles.css");
    }

    #[test]
    fn test_rewrite_css_import_in_full_code() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("App.css"), ".app { display: flex; }").unwrap();

        let code = r#"import './App.css';
import { signal } from '@vertz/ui';
const x = 1;"#;

        let result = rewrite_imports(code, &src_dir.join("app.tsx"), &src_dir, tmp.path(), None);

        assert!(
            result.contains("import '/src/App.css'"),
            "CSS import should be rewritten to absolute path. Result: {}",
            result
        );
        assert!(
            result.contains("from '/@deps/@vertz/ui'"),
            "Other imports should still work. Result: {}",
            result
        );
    }

    #[test]
    fn test_normalize_path_with_dot() {
        let p = normalize_path(Path::new("/project/src/./utils/format"));
        assert_eq!(p, PathBuf::from("/project/src/utils/format"));
    }

    // ── Path alias tests ──

    #[test]
    fn test_rewrite_path_alias_to_resolved_url() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let src_dir = root.join("src");
        std::fs::create_dir_all(src_dir.join("components")).unwrap();
        std::fs::write(src_dir.join("components/Button.tsx"), "").unwrap();

        let paths = TsconfigPaths {
            base_url: None,
            paths: vec![("@/*".to_string(), vec!["./src/*".to_string()])],
        };

        let result = rewrite_specifier(
            "@/components/Button",
            &src_dir.join("app.tsx"),
            &src_dir,
            root,
            Some(&paths),
        );
        assert_eq!(result, "/src/components/Button.tsx");
    }

    #[test]
    fn test_rewrite_alias_falls_through_to_bare_specifier() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let src_dir = root.join("src");
        std::fs::create_dir_all(&src_dir).unwrap();

        let paths = TsconfigPaths {
            base_url: None,
            paths: vec![("@/*".to_string(), vec!["./src/*".to_string()])],
        };

        // "react" doesn't match @/* so it falls through to bare specifier handling
        let result = rewrite_specifier(
            "react",
            &src_dir.join("app.tsx"),
            &src_dir,
            root,
            Some(&paths),
        );
        assert_eq!(result, "/@deps/react");
    }

    #[test]
    fn test_rewrite_imports_with_path_alias() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let src_dir = root.join("src");
        std::fs::create_dir_all(src_dir.join("components")).unwrap();
        std::fs::write(src_dir.join("components/Button.tsx"), "").unwrap();

        let paths = TsconfigPaths {
            base_url: None,
            paths: vec![("@/*".to_string(), vec!["./src/*".to_string()])],
        };

        let code = "import Button from '@/components/Button';";
        let result = rewrite_imports(code, &src_dir.join("app.tsx"), &src_dir, root, Some(&paths));

        assert!(
            result.contains("from '/src/components/Button.tsx'"),
            "Result: {}",
            result
        );
    }

    #[test]
    fn test_rewrite_alias_unresolved_file_falls_through() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let src_dir = root.join("src");
        std::fs::create_dir_all(&src_dir).unwrap();

        let paths = TsconfigPaths {
            base_url: None,
            paths: vec![("@/*".to_string(), vec!["./src/*".to_string()])],
        };

        // @/nonexistent matches the alias pattern, but no file exists.
        // Falls through to bare specifier handling.
        let result = rewrite_specifier(
            "@/nonexistent",
            &src_dir.join("app.tsx"),
            &src_dir,
            root,
            Some(&paths),
        );
        // When alias matches but file not found, falls through to /@deps/
        assert_eq!(result, "/@deps/@/nonexistent");
    }

    // ── Asset import tests ──

    #[test]
    fn test_rewrite_relative_svg_import_appends_import_query() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("logo.svg"), "<svg></svg>").unwrap();

        let result = rewrite_specifier(
            "./logo.svg",
            &src_dir.join("app.tsx"),
            &src_dir,
            tmp.path(),
            None,
        );
        assert_eq!(result, "/src/logo.svg?import");
    }

    #[test]
    fn test_rewrite_relative_png_import_appends_import_query() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(src_dir.join("assets")).unwrap();
        std::fs::write(src_dir.join("assets/hero.png"), "").unwrap();

        let result = rewrite_specifier(
            "./assets/hero.png",
            &src_dir.join("app.tsx"),
            &src_dir,
            tmp.path(),
            None,
        );
        assert_eq!(result, "/src/assets/hero.png?import");
    }

    #[test]
    fn test_rewrite_relative_font_import_appends_import_query() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(src_dir.join("fonts")).unwrap();
        std::fs::write(src_dir.join("fonts/inter.woff2"), "").unwrap();

        let result = rewrite_specifier(
            "./fonts/inter.woff2",
            &src_dir.join("app.tsx"),
            &src_dir,
            tmp.path(),
            None,
        );
        assert_eq!(result, "/src/fonts/inter.woff2?import");
    }

    #[test]
    fn test_rewrite_asset_import_in_full_code() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("logo.svg"), "<svg></svg>").unwrap();

        let code = r#"import logo from './logo.svg';
import { signal } from '@vertz/ui';
const x = 1;"#;

        let result = rewrite_imports(code, &src_dir.join("app.tsx"), &src_dir, tmp.path(), None);

        assert!(
            result.contains("from '/src/logo.svg?import'"),
            "Asset import should have ?import query. Result: {}",
            result
        );
        assert!(
            result.contains("from '/@deps/@vertz/ui'"),
            "Other imports should still work. Result: {}",
            result
        );
    }

    #[test]
    fn test_rewrite_dynamic_import_of_asset() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("logo.svg"), "<svg></svg>").unwrap();

        let code = r#"const logo = import('./logo.svg');"#;
        let result = rewrite_imports(code, &src_dir.join("app.tsx"), &src_dir, tmp.path(), None);

        assert!(
            result.contains("import('/src/logo.svg?import')"),
            "Dynamic asset import should have ?import. Result: {}",
            result
        );
    }

    #[test]
    fn test_rewrite_side_effect_asset_import() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("logo.svg"), "<svg></svg>").unwrap();

        let code = r#"import './logo.svg';"#;
        let result = rewrite_imports(code, &src_dir.join("app.tsx"), &src_dir, tmp.path(), None);

        assert!(
            result.contains("import '/src/logo.svg?import'"),
            "Side-effect asset import should have ?import. Result: {}",
            result
        );
    }

    #[test]
    fn test_rewrite_export_from_asset() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("logo.svg"), "<svg></svg>").unwrap();

        let code = r#"export { default as logo } from './logo.svg';"#;
        let result = rewrite_imports(code, &src_dir.join("app.tsx"), &src_dir, tmp.path(), None);

        assert!(
            result.contains("from '/src/logo.svg?import'"),
            "Re-export of asset should have ?import. Result: {}",
            result
        );
    }

    #[test]
    fn test_rewrite_path_alias_svg_import_appends_import_query() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let src_dir = root.join("src");
        std::fs::create_dir_all(src_dir.join("assets")).unwrap();
        std::fs::write(src_dir.join("assets/logo.svg"), "<svg></svg>").unwrap();

        let paths = TsconfigPaths {
            base_url: None,
            paths: vec![("@/*".to_string(), vec!["./src/*".to_string()])],
        };

        let result = rewrite_specifier(
            "@/assets/logo.svg",
            &src_dir.join("app.tsx"),
            &src_dir,
            root,
            Some(&paths),
        );
        assert_eq!(result, "/src/assets/logo.svg?import");
    }

    #[test]
    fn test_rewrite_css_import_not_appended_import_query() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("styles.css"), "body{}").unwrap();

        let result = rewrite_specifier(
            "./styles.css",
            &src_dir.join("app.tsx"),
            &src_dir,
            tmp.path(),
            None,
        );
        // CSS imports should NOT have ?import — they're handled differently
        assert_eq!(result, "/src/styles.css");
    }

    #[test]
    fn test_resolve_extension_keeps_svg() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("logo.svg"), "<svg></svg>").unwrap();

        let result = resolve_extension(&src_dir.join("logo.svg"), tmp.path());
        assert_eq!(result, src_dir.join("logo.svg"));
    }

    #[test]
    fn test_resolve_extension_keeps_png() {
        let tmp = tempfile::tempdir().unwrap();
        let src_dir = tmp.path().join("src");
        std::fs::create_dir_all(&src_dir).unwrap();
        std::fs::write(src_dir.join("icon.png"), "").unwrap();

        let result = resolve_extension(&src_dir.join("icon.png"), tmp.path());
        assert_eq!(result, src_dir.join("icon.png"));
    }
}
