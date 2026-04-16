//! Export interposition for `spyOn()` support on ESM module exports.
//!
//! In test mode, this transform converts export declarations to use `let`
//! bindings with setter registration. This enables `spyOn()` on ESM module
//! exports by leveraging ESM live binding semantics — when the setter
//! reassigns the variable, all importers see the new value.
//!
//! ## Transform
//!
//! ```text
//! // Input:
//! export function createAction(opts) { ... }
//! export const VERSION = '1.0';
//!
//! // Output:
//! let createAction = function createAction(opts) { ... };
//! let VERSION = '1.0';
//! export { createAction, VERSION };
//! const __vertz_module_id__ = import.meta.url;
//! export { __vertz_module_id__ };
//! globalThis.__vertz_module_setters ??= {};
//! globalThis.__vertz_module_setters[import.meta.url] = {
//!   createAction: (__v) => { createAction = __v; },
//!   VERSION: (__v) => { VERSION = __v; },
//! };
//! ```

use crate::magic_string::MagicString;
use oxc_ast::ast::*;

/// Collected export name for setter registration.
struct ExportName(String);

/// Transform export declarations for spy support.
///
/// Converts `export function/const/class` declarations to `let` bindings,
/// then appends a grouped `export { ... }` statement and setter registration.
///
/// Uses targeted MagicString edits rather than copying from the original source,
/// so prior transforms (e.g., TypeScript stripping) are preserved.
pub fn transform_spy_exports(ms: &mut MagicString, program: &Program, source: &str) {
    let mut export_names: Vec<ExportName> = Vec::new();

    // Collect all names bound by import declarations so we can detect conflicts
    // with re-export transformations.
    let mut imported_names: std::collections::HashSet<String> = std::collections::HashSet::new();
    for stmt in &program.body {
        if let Statement::ImportDeclaration(import) = stmt {
            if let Some(ref specifiers) = import.specifiers {
                for spec in specifiers {
                    match spec {
                        ImportDeclarationSpecifier::ImportSpecifier(named) => {
                            imported_names.insert(named.local.name.to_string());
                        }
                        ImportDeclarationSpecifier::ImportDefaultSpecifier(def) => {
                            imported_names.insert(def.local.name.to_string());
                        }
                        ImportDeclarationSpecifier::ImportNamespaceSpecifier(ns) => {
                            imported_names.insert(ns.local.name.to_string());
                        }
                    }
                }
            }
        }
    }

    /// Re-export that needs to be transformed into import + let binding.
    struct ReExport {
        /// The exported (local) name
        exported_name: String,
        /// The imported (remote) name (may differ if `export { foo as bar }`)
        imported_name: String,
    }
    /// Names from the original re-export that were skipped (conflict with imports).
    struct SkippedReExport {
        exported_name: String,
        imported_name: String,
    }
    /// A single re-export statement to transform.
    struct ReExportStmt {
        source: String,
        names: Vec<ReExport>,
        /// Names kept as-is in a residual re-export (conflicted with imports)
        skipped: Vec<SkippedReExport>,
        span_start: u32,
        span_end: u32,
    }
    let mut reexport_stmts: Vec<ReExportStmt> = Vec::new();

    for stmt in &program.body {
        let Statement::ExportNamedDeclaration(export) = stmt else {
            continue;
        };

        // Handle re-exports: `export { x, y } from './other'`
        // Transform to: import + let bindings so spyOn setters can intercept
        if let Some(ref src) = export.source {
            if export.specifiers.is_empty() {
                continue;
            }
            // Skip `export type { ... } from` (TS type-only re-exports)
            if matches!(export.export_kind, ImportOrExportKind::Type) {
                continue;
            }
            let mut names = Vec::new();
            let mut skipped = Vec::new();
            for spec in &export.specifiers {
                // Skip type-only specifiers
                if matches!(spec.export_kind, ImportOrExportKind::Type) {
                    continue;
                }
                let exported_name = spec.exported.name().to_string();
                let imported_name = spec.local.name().to_string();
                // Names that already exist as imports can't get a new let binding
                // (would cause "has already been declared"). Keep them as a residual
                // re-export so the module's public API is preserved.
                if imported_names.contains(&exported_name) {
                    skipped.push(SkippedReExport {
                        exported_name,
                        imported_name,
                    });
                    continue;
                }
                names.push(ReExport {
                    exported_name,
                    imported_name,
                });
            }
            if !names.is_empty() || !skipped.is_empty() {
                reexport_stmts.push(ReExportStmt {
                    source: src.value.to_string(),
                    names,
                    skipped,
                    span_start: export.span.start,
                    span_end: export.span.end,
                });
            }
            continue;
        }

        // Skip `export { x, y }` without declaration (no local binding to intercept)
        let Some(ref decl) = export.declaration else {
            continue;
        };

        match decl {
            Declaration::FunctionDeclaration(func) => {
                let Some(ref id) = func.id else { continue };
                // Skip TypeScript function overload signatures (no body)
                if func.body.is_none() {
                    continue;
                }
                let name = id.name.to_string();

                // `export function foo(...){}` → `let foo = function foo(...){};\n`
                // Overwrite `export ` prefix (from export start to function start)
                // with `let foo = `, preserving the function body as-is in MagicString.
                ms.overwrite(
                    export.span.start,
                    func.span.start,
                    &format!("let {name} = "),
                );
                // Append semicolon after the function (function declarations don't have one)
                ms.prepend_left(export.span.end, ";");

                export_names.push(ExportName(name));
            }
            Declaration::VariableDeclaration(var_decl) => {
                // Handle `export const foo = expr;` / `export let foo = expr;`
                // Only single declarators (not `export const a = 1, b = 2;`)
                if var_decl.declarations.len() != 1 {
                    continue;
                }
                let declarator = &var_decl.declarations[0];
                let BindingPattern::BindingIdentifier(ref id) = declarator.id else {
                    continue;
                };
                let name = id.name.to_string();

                // Remove `export ` prefix
                ms.overwrite(export.span.start, var_decl.span.start, "");

                // Change `const`/`var` to `let` if needed
                let keyword_start = var_decl.span.start as usize;
                let keyword_src = &source[keyword_start..];
                if keyword_src.starts_with("const ") {
                    ms.overwrite(var_decl.span.start, var_decl.span.start + 5, "let");
                } else if keyword_src.starts_with("var ") {
                    ms.overwrite(var_decl.span.start, var_decl.span.start + 3, "let");
                }

                export_names.push(ExportName(name));
            }
            Declaration::ClassDeclaration(class) => {
                let Some(ref id) = class.id else { continue };
                let name = id.name.to_string();

                // `export class Foo {}` → `let Foo = class Foo {};`
                ms.overwrite(
                    export.span.start,
                    class.span.start,
                    &format!("let {name} = "),
                );
                ms.prepend_left(export.span.end, ";");

                export_names.push(ExportName(name));
            }
            _ => {}
        }
    }

    // Transform re-export statements into import + let bindings.
    // Names that conflict with existing imports are kept as-is in a residual
    // re-export statement.
    for re in &reexport_stmts {
        // Nothing to transform — leave original statement unchanged
        if re.names.is_empty() {
            continue;
        }

        let import_specs: Vec<String> = re
            .names
            .iter()
            .map(|n| format!("{} as __re_{}", n.imported_name, n.exported_name))
            .collect();
        let let_bindings: Vec<String> = re
            .names
            .iter()
            .map(|n| format!("let {} = __re_{};", n.exported_name, n.exported_name))
            .collect();

        let mut replacement = format!(
            "import {{ {} }} from '{}';\n{}",
            import_specs.join(", "),
            re.source,
            let_bindings.join("\n"),
        );

        // If some names were skipped (conflict with imports), add a residual
        // re-export so the module's public API is preserved.
        if !re.skipped.is_empty() {
            let residual_specs: Vec<String> = re
                .skipped
                .iter()
                .map(|s| {
                    if s.imported_name == s.exported_name {
                        s.exported_name.clone()
                    } else {
                        format!("{} as {}", s.imported_name, s.exported_name)
                    }
                })
                .collect();
            replacement.push_str(&format!(
                "\nexport {{ {} }} from '{}';",
                residual_specs.join(", "),
                re.source,
            ));
        }

        ms.overwrite(re.span_start, re.span_end, &replacement);

        for n in &re.names {
            export_names.push(ExportName(n.exported_name.clone()));
        }
    }

    if export_names.is_empty() {
        return;
    }

    // Append grouped export statement
    let names: Vec<&str> = export_names.iter().map(|e| e.0.as_str()).collect();
    let export_stmt = format!("\nexport {{ {} }};", names.join(", "));

    // Append __vertz_module_id__ export and setter registration
    let setters: Vec<String> = export_names
        .iter()
        .map(|e| format!("  {}: (__v) => {{ {} = __v; }}", e.0, e.0))
        .collect();

    let suffix = format!(
        "{}\nconst __vertz_module_id__ = import.meta.url;\nexport {{ __vertz_module_id__ }};\nglobalThis.__vertz_module_setters ??= {{}};\nglobalThis.__vertz_module_setters[import.meta.url] = {{\n{}\n}};\n",
        export_stmt,
        setters.join(",\n"),
    );

    ms.append(&suffix);
}

#[cfg(test)]
mod tests {
    use super::*;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    fn transform(source: &str) -> String {
        let allocator = oxc_allocator::Allocator::default();
        let source_type = SourceType::from_path("test.ts").unwrap_or_default();
        let ret = Parser::new(&allocator, source, source_type).parse();
        let mut ms = MagicString::new(source);
        transform_spy_exports(&mut ms, &ret.program, source);
        ms.to_string()
    }

    #[test]
    fn transforms_export_function() {
        let source = "export function createAction(opts) { return opts; }";
        let result = transform(source);
        assert!(
            result.contains("let createAction = function createAction(opts) { return opts; };"),
            "Should convert to let binding: {}",
            result
        );
        assert!(
            result.contains("export { createAction"),
            "Should have grouped export: {}",
            result
        );
        assert!(
            result.contains("__vertz_module_setters"),
            "Should have setter registration: {}",
            result
        );
    }

    #[test]
    fn transforms_export_const() {
        let source = "export const VERSION = '1.0';";
        let result = transform(source);
        assert!(
            result.contains("let VERSION = '1.0'"),
            "Should change const to let: {}",
            result
        );
        assert!(
            result.contains("export { VERSION }"),
            "Should have grouped export: {}",
            result
        );
    }

    #[test]
    fn transforms_export_class() {
        let source = "export class Builder { build() {} }";
        let result = transform(source);
        assert!(
            result.contains("let Builder = class Builder { build() {} };"),
            "Should convert to let binding: {}",
            result
        );
    }

    #[test]
    fn transforms_reexports() {
        let source = "export { foo } from './other';";
        let result = transform(source);
        assert!(
            result.contains("import { foo as __re_foo } from './other'"),
            "Should import re-exported name: {}",
            result
        );
        assert!(
            result.contains("let foo = __re_foo;"),
            "Should create let binding: {}",
            result
        );
        assert!(
            result.contains("export { foo"),
            "Should have grouped export: {}",
            result
        );
        assert!(
            result.contains("foo: (__v) => { foo = __v; }"),
            "Should register setter: {}",
            result
        );
    }

    #[test]
    fn transforms_reexports_with_rename() {
        let source = "export { foo as bar } from './other';";
        let result = transform(source);
        assert!(
            result.contains("import { foo as __re_bar } from './other'"),
            "Should import with original name: {}",
            result
        );
        assert!(
            result.contains("let bar = __re_bar;"),
            "Should create let binding with exported name: {}",
            result
        );
        assert!(
            result.contains("export { bar"),
            "Should export the renamed binding: {}",
            result
        );
    }

    #[test]
    fn transforms_multiple_reexports() {
        let source = "export { foo, bar } from './other';";
        let result = transform(source);
        assert!(
            result.contains("import { foo as __re_foo, bar as __re_bar } from './other'"),
            "Should import all re-exported names: {}",
            result
        );
        assert!(
            result.contains("let foo = __re_foo;"),
            "Should create let binding for foo: {}",
            result
        );
        assert!(
            result.contains("let bar = __re_bar;"),
            "Should create let binding for bar: {}",
            result
        );
    }

    #[test]
    fn skips_export_without_declaration() {
        let source = "const x = 1;\nexport { x };";
        let result = transform(source);
        // Should be unchanged
        assert_eq!(result, source);
    }

    #[test]
    fn skips_reexport_names_conflicting_with_imports() {
        // When a name is both imported and re-exported, skip the re-export
        // transform for that name to avoid "has already been declared" errors.
        let source = "import { foo } from './bar';\nexport { foo, baz } from './bar';";
        let result = transform(source);
        // foo should NOT be transformed (conflicts with import)
        assert!(
            !result.contains("let foo = __re_foo"),
            "Should not create let for conflicting import: {}",
            result
        );
        // baz SHOULD be transformed
        assert!(
            result.contains("let baz = __re_baz;"),
            "Should transform non-conflicting name: {}",
            result
        );
        // foo should be preserved in a residual re-export
        assert!(
            result.contains("export { foo } from './bar'"),
            "Should keep conflicting name in residual re-export: {}",
            result
        );
    }

    #[test]
    fn skips_all_conflicting_reexport() {
        // When all re-exported names conflict with imports, the entire
        // re-export statement is left unchanged.
        let source = "import { foo, bar } from './baz';\nexport { foo, bar } from './baz';";
        let result = transform(source);
        assert_eq!(
            result, source,
            "Should be unchanged when all names conflict: {}",
            result
        );
    }

    #[test]
    fn no_transform_when_no_exports() {
        let source = "const x = 1;\nfunction foo() {}";
        let result = transform(source);
        assert_eq!(result, source);
    }

    #[test]
    fn registers_setters_for_all_exports() {
        let source = "export function foo() {}\nexport const bar = 1;";
        let result = transform(source);
        assert!(
            result.contains("foo: (__v) => { foo = __v; }"),
            "Should register foo setter: {}",
            result
        );
        assert!(
            result.contains("bar: (__v) => { bar = __v; }"),
            "Should register bar setter: {}",
            result
        );
    }

    #[test]
    fn exports_module_id() {
        let source = "export function foo() {}";
        let result = transform(source);
        assert!(
            result.contains("const __vertz_module_id__ = import.meta.url"),
            "Should export module id: {}",
            result
        );
        assert!(
            result.contains("export { __vertz_module_id__ }"),
            "Should export __vertz_module_id__: {}",
            result
        );
    }

    #[test]
    fn handles_export_let() {
        let source = "export let counter = 0;";
        let result = transform(source);
        assert!(
            result.contains("let counter = 0"),
            "Should keep let: {}",
            result
        );
        assert!(
            result.contains("export { counter }"),
            "Should have grouped export: {}",
            result
        );
    }

    #[test]
    fn full_compile_function_overloads() {
        // TypeScript function overloads: two signatures + implementation
        let source = r#"export function matchError(error: string, handlers: object): string;
export function matchError(error: number, handlers: object): number;
export function matchError(error: string | number, handlers: object): string | number {
  return String(error);
}"#;
        let result = crate::compile(
            source,
            crate::CompileOptions {
                filename: Some("overload.ts".to_string()),
                spy_exports: Some(true),
                ..Default::default()
            },
        );
        let code = &result.code;
        // Should have exactly one function binding (not three)
        assert!(
            code.contains("let matchError = "),
            "Should have let binding: {}",
            code
        );
        // Should have valid JS
        assert!(
            !code.contains("let matchError = ;"),
            "Should not have empty let binding: {}",
            code
        );
    }

    #[test]
    fn full_compile_cli_ts_export_function_with_return_type() {
        // Minimal reproduction: export function with TS return type
        let source = r#"import { Command } from 'commander';
export function createCLI(): Command {
  const program = new Command();
  return program;
}
"#;
        let result = crate::compile(
            source,
            crate::CompileOptions {
                filename: Some("cli.ts".to_string()),
                spy_exports: Some(true),
                ..Default::default()
            },
        );
        let code = &result.code;
        // Must not contain TS return type
        assert!(
            !code.contains(": Command"),
            "Should strip TS return type: {}",
            code
        );
        // Must have correct let binding
        assert!(
            code.contains("let createCLI = "),
            "Should have let binding: {}",
            code
        );
        // Must not have syntax issues
        assert!(!code.contains("};};"), "No double semicolons: {}", code);
    }

    #[test]
    fn full_compile_cli_create_ts() {
        // Exact content from packages/cli/src/commands/create.ts
        let source = r#"import { resolveOptions, scaffold } from '@vertz/create-vertz-app';
import { err, ok, type Result } from '@vertz/errors';

export interface CreateOptions {
  projectName?: string;
  template?: string;
  version: string;
}

export async function createAction(options: CreateOptions): Promise<Result<void, Error>> {
  const { projectName, version } = options;
  if (!projectName) {
    return err(new Error('Project name is required'));
  }
  return ok(undefined);
}
"#;
        let result = crate::compile(
            source,
            crate::CompileOptions {
                filename: Some("create.ts".to_string()),
                spy_exports: Some(true),
                ..Default::default()
            },
        );
        let code = &result.code;
        // Should not have TS syntax
        assert!(
            !code.contains(": CreateOptions"),
            "Should strip TS param type: {}",
            code
        );
        assert!(
            !code.contains("Promise<Result"),
            "Should strip TS return type: {}",
            code
        );
        assert!(
            code.contains("let createAction = "),
            "Should have let binding: {}",
            code
        );
    }

    #[test]
    fn full_compile_with_export_interface_and_async_fn() {
        // Matches the pattern from packages/cli/src/commands/create.ts
        let source = r#"import { err, ok, type Result } from '@vertz/errors';

export interface CreateOptions {
  projectName?: string;
  version: string;
}

export async function createAction(options: CreateOptions): Promise<Result<void, Error>> {
  return ok(undefined);
}"#;
        let result = crate::compile(
            source,
            crate::CompileOptions {
                filename: Some("create.ts".to_string()),
                spy_exports: Some(true),
                ..Default::default()
            },
        );
        let code = &result.code;
        // TypeScript should be stripped, export interposition applied
        assert!(
            !code.contains("CreateOptions"),
            "Interface should be stripped: {}",
            code
        );
        assert!(
            code.contains("let createAction = "),
            "Should have let binding: {}",
            code
        );
        // No syntax errors — check for common patterns
        assert!(
            code.contains("export { createAction"),
            "Should have grouped export: {}",
            code
        );
    }

    #[test]
    fn full_compile_with_typescript() {
        // Test that spy_exports works correctly when combined with TypeScript stripping
        // via the full compile() pipeline.
        let source = r#"export function greet(name: string): string { return `Hello ${name}`; }
export const VERSION: string = '1.0';
export class Builder<T> { build(): T { return {} as T; } }"#;
        let result = crate::compile(
            source,
            crate::CompileOptions {
                filename: Some("test.ts".to_string()),
                spy_exports: Some(true),
                ..Default::default()
            },
        );
        let code = &result.code;
        // TypeScript annotations should be stripped
        assert!(
            !code.contains(": string"),
            "Should strip TS annotations: {}",
            code
        );
        // Export interposition should be applied
        assert!(
            code.contains("let greet = "),
            "Should have let binding for greet: {}",
            code
        );
        assert!(
            code.contains("export { greet"),
            "Should have grouped export: {}",
            code
        );
        assert!(
            code.contains("__vertz_module_setters"),
            "Should have setter registration: {}",
            code
        );
        // Semicolons should be correct — no syntax errors
        assert!(
            !code.contains("};};"),
            "Should not have double semicolons: {}",
            code
        );
    }
}
