//! Mock hoisting transform for the vtz test runner.
//!
//! Detects `vi.mock()`, `mock.module()`, `vi.hoisted()`, and `vi.importActual()` calls
//! at module level. Rewrites imports of mocked modules from ESM `import` declarations
//! to `const` destructuring from the mock factory result. Hoists mock registrations
//! and `vi.hoisted()` calls above all other code.

use std::collections::HashSet;

use oxc_ast::ast::*;
use oxc_ast_visit::{walk, Visit};
use oxc_span::GetSpan;

use crate::magic_string::MagicString;
use crate::Diagnostic;

/// Result of the mock hoisting transform.
pub struct MockHoistingResult {
    /// Set of module specifiers that are mocked (for exclusion from signal API analysis).
    pub mocked_specifiers: HashSet<String>,
    /// The mock preamble code block (hoisted calls, IIFE factories, registrations).
    /// This can be evaluated as a V8 script before module loading to enable
    /// transitive mocking (mocking a module imported by another module).
    pub mock_preamble: Option<String>,
    /// Diagnostics emitted during the transform.
    pub diagnostics: Vec<Diagnostic>,
}

/// Information about a top-level `vi.mock()` / `mock.module()` call.
struct MockCallInfo {
    /// The module specifier being mocked (e.g., "@vertz/compiler").
    specifier: String,
    /// Source text of the factory argument.
    factory_source: String,
    /// Span of the entire statement (for removal).
    stmt_start: u32,
    stmt_end: u32,
}

/// Information about a top-level `vi.hoisted()` call.
struct HoistedCallInfo {
    /// The full expression source (the factory argument).
    factory_source: String,
    /// The left-hand side of the assignment, if any (e.g., `const { mockFn } =`).
    lhs_source: Option<String>,
    /// Span of the entire statement (for removal).
    stmt_start: u32,
    stmt_end: u32,
}

/// Information about an import declaration that matches a mocked specifier.
struct MockedImportInfo {
    /// The kind of import and the rewritten source text.
    rewrite: String,
    /// Span of the import declaration (for overwriting).
    start: u32,
    end: u32,
}

/// Collect mocked specifiers from top-level `vi.mock()` / `mock.module()` calls.
///
/// This is a lightweight pre-scan used to build an exclusion set for
/// `build_import_aliases()`, preventing the reactivity analyzer from
/// applying signal transforms to mocked imports.
pub fn collect_mocked_specifiers(program: &Program) -> HashSet<String> {
    let mut specifiers = HashSet::new();
    for stmt in &program.body {
        if let Some(specifier) = extract_mock_call_specifier(stmt) {
            specifiers.insert(specifier);
        }
    }
    specifiers
}

/// Run the full mock hoisting transform.
///
/// 1. Collects top-level `vi.mock()` / `mock.module()` calls and their factory source text
/// 2. Collects top-level `vi.hoisted()` calls
/// 3. Finds import declarations matching mocked specifiers
/// 4. Rewrites imports to `const` destructuring from mock factory results
/// 5. Hoists mock factories and `vi.hoisted()` calls to the top of the file
/// 6. Replaces `vi.importActual('spec')` with `import('spec')` everywhere
/// 7. Emits diagnostics for invalid usage (nested mocks, missing factory, unused mocks)
pub fn transform_mock_hoisting(
    ms: &mut MagicString,
    program: &Program,
    source: &str,
) -> MockHoistingResult {
    let mut diagnostics = Vec::new();
    let mut mock_calls: Vec<MockCallInfo> = Vec::new();
    let mut hoisted_calls: Vec<HoistedCallInfo> = Vec::new();
    let mut mocked_specifiers = HashSet::new();

    // ── Step 1: Collect top-level vi.mock() / mock.module() calls ────────
    for stmt in &program.body {
        if let Some(info) = extract_mock_call_info(stmt, source) {
            mocked_specifiers.insert(info.specifier.clone());
            mock_calls.push(info);
        }
    }

    // ── Step 1b: Check for vi.mock() without factory (always runs) ─────
    for stmt in &program.body {
        if let Some(diag) = check_mock_without_factory(stmt, source) {
            diagnostics.push(diag);
        }
    }

    // Early return if no mocks with factories found
    if mock_calls.is_empty() {
        // Still scan for hoisted calls and nested mock diagnostics
        for stmt in &program.body {
            if let Some(info) = extract_hoisted_call_info(stmt, source) {
                hoisted_calls.push(info);
            }
        }
        // Check for nested vi.mock() calls
        let nested_diags = find_nested_mock_calls(program, source, &HashSet::new());
        diagnostics.extend(nested_diags);

        // Apply hoisted calls even without mocks
        if !hoisted_calls.is_empty() {
            apply_hoisted_transforms(ms, &hoisted_calls);
        }

        // Scan for vi.importActual() replacements
        replace_import_actual(ms, program, source);

        return MockHoistingResult {
            mocked_specifiers,
            mock_preamble: None,
            diagnostics,
        };
    }

    // ── Step 2: Collect top-level vi.hoisted() calls ─────────────────────
    for stmt in &program.body {
        if let Some(info) = extract_hoisted_call_info(stmt, source) {
            hoisted_calls.push(info);
        }
    }

    // ── Step 3: Deduplicate — last mock for each specifier wins ──────────
    // Build a map: specifier → last mock index
    let mut specifier_to_index: std::collections::HashMap<String, usize> =
        std::collections::HashMap::new();
    for (i, mock_call) in mock_calls.iter().enumerate() {
        specifier_to_index.insert(mock_call.specifier.clone(), i);
    }

    // ── Step 5: Find imports matching mocked specifiers ───��──────────────
    let mut mocked_imports: Vec<MockedImportInfo> = Vec::new();
    let mut imported_specifiers: HashSet<String> = HashSet::new();

    for stmt in &program.body {
        let import = match stmt {
            Statement::ImportDeclaration(imp) => imp,
            _ => continue,
        };

        let spec = import.source.value.as_str();
        imported_specifiers.insert(spec.to_string());

        let Some(&_mock_idx) = specifier_to_index.get(spec) else {
            continue;
        };

        // Skip type-only imports
        if import.import_kind == ImportOrExportKind::Type {
            continue;
        }

        let mock_expr = format!("globalThis.__vertz_mocked_modules['{}']", spec);
        let rewrite = generate_import_rewrite(import, &mock_expr, source);

        mocked_imports.push(MockedImportInfo {
            rewrite,
            start: import.span.start,
            end: import.span.end,
        });
    }

    // ── Step 6: Warn for unused mocks ────────────────────────────────────
    for mock_call in &mock_calls {
        if !imported_specifiers.contains(&mock_call.specifier) {
            let (line, col) =
                crate::utils::offset_to_line_column(source, mock_call.stmt_start as usize);
            diagnostics.push(Diagnostic {
                message: format!(
                    "vi.mock('{}') has no matching import in this file — the mock will have no effect.",
                    mock_call.specifier
                ),
                line: Some(line),
                column: Some(col),
            });
        }
    }

    // ── Step 7: Check for nested vi.mock() calls ─────────────────────────
    let top_level_spans: HashSet<u32> = mock_calls.iter().map(|m| m.stmt_start).collect();
    let nested_diags = find_nested_mock_calls(program, source, &top_level_spans);
    diagnostics.extend(nested_diags);

    // ── Step 8: Apply MagicString edits ──────────────────────────────────
    //
    // The preamble uses `globalThis.*` for all variables so it can be
    // pre-evaluated as a V8 script (for transitive mocking) and also
    // safely skipped on re-evaluation via a guard flag.

    // Build the prepended block: guard → hoisted calls → mock factories → registrations
    let mut prepend_block = String::new();
    prepend_block.push_str("if (!globalThis.__vertz_mock_preamble_executed) {\n");
    prepend_block.push_str("globalThis.__vertz_mock_preamble_executed = true;\n");

    // Hoisted calls — stored on globalThis so they survive script→module boundary.
    // After each hoisted IIFE, destructure with `var` so the names are available
    // to mock factories that run later in the preamble (`var` has no TDZ).
    for (i, hoisted) in hoisted_calls.iter().enumerate() {
        prepend_block.push_str(&format!(
            "globalThis.__vertz_hoisted_{i} = ({})();\n",
            hoisted.factory_source
        ));
        // Make destructured names available in the preamble scope
        if let Some(ref lhs) = hoisted.lhs_source {
            let var_lhs = lhs
                .replacen("const ", "var ", 1)
                .replacen("let ", "var ", 1);
            prepend_block.push_str(&format!("{var_lhs}globalThis.__vertz_hoisted_{i};\n"));
        }
    }

    // Mock factory IIFEs
    for (i, mock_call) in mock_calls.iter().enumerate() {
        // Only generate for the winning mock (last one for each specifier)
        if specifier_to_index.get(&mock_call.specifier) == Some(&i) {
            // Replace vi.importActual(...) with import(...) inside factory source
            let factory = replace_import_actual_in_string(&mock_call.factory_source);
            prepend_block.push_str(&format!("globalThis.__vertz_mock_{i} = ({factory})();\n",));
        }
    }

    // Registration block
    if !mock_calls.is_empty() {
        prepend_block.push_str(
            "globalThis.__vertz_mocked_modules = globalThis.__vertz_mocked_modules || {};\n",
        );
        for (i, mock_call) in mock_calls.iter().enumerate() {
            if specifier_to_index.get(&mock_call.specifier) == Some(&i) {
                prepend_block.push_str(&format!(
                    "globalThis.__vertz_mocked_modules['{}'] = globalThis.__vertz_mock_{i};\n",
                    mock_call.specifier
                ));
            }
        }
    }

    prepend_block.push_str("}\n");

    // Capture preamble before prepending
    let mock_preamble = if mock_calls.is_empty() && hoisted_calls.is_empty() {
        None
    } else {
        Some(prepend_block.clone())
    };

    // Prepend the hoisted block at position 0
    if !prepend_block.is_empty() {
        ms.prepend(&prepend_block);
    }

    // Overwrite mocked imports with const destructuring from globalThis registry
    for mocked_import in &mocked_imports {
        ms.overwrite(
            mocked_import.start,
            mocked_import.end,
            &mocked_import.rewrite,
        );
    }

    // Remove original vi.mock() / mock.module() statements
    for mock_call in &mock_calls {
        ms.overwrite(mock_call.stmt_start, mock_call.stmt_end, "");
    }

    // Replace original vi.hoisted() statements with var destructuring from globalThis.
    // Using `var` (not `const`) to match the preamble and avoid TDZ issues.
    for (i, hoisted) in hoisted_calls.iter().enumerate() {
        if let Some(ref lhs) = hoisted.lhs_source {
            let var_lhs = lhs
                .replacen("const ", "var ", 1)
                .replacen("let ", "var ", 1);
            ms.overwrite(
                hoisted.stmt_start,
                hoisted.stmt_end,
                &format!("{var_lhs}globalThis.__vertz_hoisted_{i};"),
            );
        } else {
            ms.overwrite(hoisted.stmt_start, hoisted.stmt_end, "");
        }
    }

    // Replace vi.importActual() calls everywhere
    replace_import_actual(ms, program, source);

    MockHoistingResult {
        mocked_specifiers,
        mock_preamble,
        diagnostics,
    }
}

// ── Helper functions ─────────────────────────────────────────────────────

/// Extract the specifier string from a top-level `vi.mock('spec', ...)` or
/// `mock.module('spec', ...)` call, if the statement matches.
fn extract_mock_call_specifier(stmt: &Statement) -> Option<String> {
    let call = top_level_call_expr(stmt)?;
    if !is_mock_call(call) {
        return None;
    }
    let first_arg = call.arguments.first()?;
    string_literal_value(first_arg)
}

/// Extract full info from a top-level mock call.
fn extract_mock_call_info(stmt: &Statement, source: &str) -> Option<MockCallInfo> {
    let call = top_level_call_expr(stmt)?;
    if !is_mock_call(call) {
        return None;
    }

    let args = &call.arguments;
    if args.len() < 2 {
        return None; // No factory — handled by check_mock_without_factory
    }

    let specifier = string_literal_value(args.first()?)?;
    let factory_arg = &args[1];
    let factory_source =
        source[factory_arg.span().start as usize..factory_arg.span().end as usize].to_string();

    let stmt_span = stmt.span();
    Some(MockCallInfo {
        specifier,
        factory_source,
        stmt_start: stmt_span.start,
        stmt_end: stmt_span.end,
    })
}

/// Check if a top-level mock call is missing a factory argument.
fn check_mock_without_factory(stmt: &Statement, source: &str) -> Option<Diagnostic> {
    let call = top_level_call_expr(stmt)?;
    if !is_mock_call(call) {
        return None;
    }

    if call.arguments.len() < 2 {
        let (line, col) = crate::utils::offset_to_line_column(source, call.span.start as usize);
        return Some(Diagnostic {
            message: "vi.mock() requires a factory function. Provide a factory: vi.mock('module', () => ({ ... }))".to_string(),
            line: Some(line),
            column: Some(col),
        });
    }
    None
}

/// Extract info from a top-level `vi.hoisted(() => ...)` call.
fn extract_hoisted_call_info(stmt: &Statement, source: &str) -> Option<HoistedCallInfo> {
    let stmt_span = stmt.span();

    match stmt {
        // `const { x } = vi.hoisted(() => ...)`
        Statement::VariableDeclaration(var_decl) => {
            for declarator in &var_decl.declarations {
                let Some(init) = &declarator.init else {
                    continue;
                };
                let Expression::CallExpression(call) = init else {
                    continue;
                };
                if !is_hoisted_call(call) {
                    continue;
                }
                let factory_arg = call.arguments.first()?;
                let factory_source = source
                    [factory_arg.span().start as usize..factory_arg.span().end as usize]
                    .to_string();

                // Extract the LHS: everything from "const" to "="
                let decl_start = var_decl.span.start as usize;
                let init_start = init.span().start as usize;
                // Find the '=' before the init
                let lhs_text = &source[decl_start..init_start];
                // Trim trailing whitespace and '='
                let lhs_trimmed = lhs_text.trim_end().trim_end_matches('=').trim_end();
                let lhs_source = format!("{lhs_trimmed} = ");

                return Some(HoistedCallInfo {
                    factory_source,
                    lhs_source: Some(lhs_source),
                    stmt_start: stmt_span.start,
                    stmt_end: stmt_span.end,
                });
            }
            None
        }
        // Bare `vi.hoisted(() => ...)` as expression statement
        Statement::ExpressionStatement(expr_stmt) => {
            let Expression::CallExpression(call) = &expr_stmt.expression else {
                return None;
            };
            if !is_hoisted_call(call) {
                return None;
            }
            let factory_arg = call.arguments.first()?;
            let factory_source = source
                [factory_arg.span().start as usize..factory_arg.span().end as usize]
                .to_string();

            Some(HoistedCallInfo {
                factory_source,
                lhs_source: None,
                stmt_start: stmt_span.start,
                stmt_end: stmt_span.end,
            })
        }
        _ => None,
    }
}

/// Apply hoisted transforms without mocks (just vi.hoisted() calls).
fn apply_hoisted_transforms(ms: &mut MagicString, hoisted_calls: &[HoistedCallInfo]) {
    let mut prepend_block = String::new();
    prepend_block.push_str("if (!globalThis.__vertz_mock_preamble_executed) {\n");
    prepend_block.push_str("globalThis.__vertz_mock_preamble_executed = true;\n");
    for (i, hoisted) in hoisted_calls.iter().enumerate() {
        prepend_block.push_str(&format!(
            "globalThis.__vertz_hoisted_{i} = ({})();\n",
            hoisted.factory_source
        ));
    }
    prepend_block.push_str("}\n");
    if !prepend_block.is_empty() {
        ms.prepend(&prepend_block);
    }
    for (i, hoisted) in hoisted_calls.iter().enumerate() {
        if let Some(ref lhs) = hoisted.lhs_source {
            let var_lhs = lhs
                .replacen("const ", "var ", 1)
                .replacen("let ", "var ", 1);
            ms.overwrite(
                hoisted.stmt_start,
                hoisted.stmt_end,
                &format!("{var_lhs}globalThis.__vertz_hoisted_{i};"),
            );
        } else {
            ms.overwrite(hoisted.stmt_start, hoisted.stmt_end, "");
        }
    }
}

/// Generate the const destructuring that replaces a mocked import declaration.
fn generate_import_rewrite(import: &ImportDeclaration, mock_var: &str, _source: &str) -> String {
    let Some(ref specifiers) = import.specifiers else {
        // Side-effect import: `import 'mocked'` → remove entirely
        return String::new();
    };

    if specifiers.is_empty() {
        // Side-effect import with empty specifiers
        return String::new();
    }

    let mut default_name: Option<String> = None;
    let mut named: Vec<(String, String)> = Vec::new(); // (local, imported)
    let mut namespace_name: Option<String> = None;

    for spec in specifiers {
        match spec {
            ImportDeclarationSpecifier::ImportDefaultSpecifier(def) => {
                default_name = Some(def.local.name.to_string());
            }
            ImportDeclarationSpecifier::ImportSpecifier(named_spec) => {
                let local = named_spec.local.name.to_string();
                let imported = match &named_spec.imported {
                    ModuleExportName::IdentifierName(id) => id.name.to_string(),
                    ModuleExportName::IdentifierReference(id) => id.name.to_string(),
                    ModuleExportName::StringLiteral(s) => s.value.to_string(),
                };
                named.push((local, imported));
            }
            ImportDeclarationSpecifier::ImportNamespaceSpecifier(ns) => {
                namespace_name = Some(ns.local.name.to_string());
            }
        }
    }

    let mut parts: Vec<String> = Vec::new();

    // Namespace import: `import * as ns from 'mod'` → `const ns = __vertz_mock_N`
    if let Some(ns) = namespace_name {
        parts.push(format!("const {ns} = {mock_var}"));
    }

    // Default import: `import def from 'mod'` → `const def = "default" in __vertz_mock_N ? __vertz_mock_N.default : __vertz_mock_N`
    if let Some(def) = default_name {
        parts.push(format!(
            "const {def} = \"default\" in {mock_var} ? {mock_var}.default : {mock_var}"
        ));
    }

    // Named imports: `import { a, b } from 'mod'` → `const { a, b } = __vertz_mock_N`
    if !named.is_empty() {
        let bindings: Vec<String> = named
            .iter()
            .map(|(local, imported)| {
                if local == imported {
                    local.clone()
                } else {
                    format!("{imported}: {local}")
                }
            })
            .collect();
        parts.push(format!("const {{ {} }} = {mock_var}", bindings.join(", ")));
    }

    parts.join(";\n")
}

/// Replace `vi.importActual(` with `import(` in a string.
/// Used to transform factory source text that may contain `vi.importActual()` calls.
fn replace_import_actual_in_string(source: &str) -> String {
    source.replace("vi.importActual(", "import(")
}

/// Check if a CallExpression is `vi.mock(...)` or `mock.module(...)`.
fn is_mock_call(call: &CallExpression) -> bool {
    let Expression::StaticMemberExpression(member) = &call.callee else {
        return false;
    };
    let Expression::Identifier(obj) = &member.object else {
        return false;
    };
    let prop = member.property.name.as_str();

    (obj.name.as_str() == "vi" && prop == "mock")
        || (obj.name.as_str() == "mock" && prop == "module")
}

/// Check if a CallExpression is `vi.hoisted(...)`.
fn is_hoisted_call(call: &CallExpression) -> bool {
    let Expression::StaticMemberExpression(member) = &call.callee else {
        return false;
    };
    let Expression::Identifier(obj) = &member.object else {
        return false;
    };
    obj.name.as_str() == "vi" && member.property.name.as_str() == "hoisted"
}

/// Check if a CallExpression is `vi.importActual(...)`.
fn is_import_actual_call(call: &CallExpression) -> bool {
    let Expression::StaticMemberExpression(member) = &call.callee else {
        return false;
    };
    let Expression::Identifier(obj) = &member.object else {
        return false;
    };
    obj.name.as_str() == "vi" && member.property.name.as_str() == "importActual"
}

/// Extract a top-level call expression from a statement.
fn top_level_call_expr<'a>(stmt: &'a Statement<'a>) -> Option<&'a CallExpression<'a>> {
    match stmt {
        Statement::ExpressionStatement(expr_stmt) => {
            if let Expression::CallExpression(call) = &expr_stmt.expression {
                Some(call)
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Extract the string value from a string literal argument.
fn string_literal_value(arg: &Argument) -> Option<String> {
    match arg {
        Argument::StringLiteral(s) => Some(s.value.to_string()),
        _ => None,
    }
}

/// Replace `vi.importActual('spec')` with `import('spec')` throughout the AST.
fn replace_import_actual(ms: &mut MagicString, program: &Program, source: &str) {
    let mut visitor = ImportActualVisitor { ms, source };
    visitor.visit_program(program);
}

struct ImportActualVisitor<'a, 'b> {
    ms: &'a mut MagicString,
    source: &'b str,
}

impl<'a, 'b> Visit<'_> for ImportActualVisitor<'a, 'b> {
    fn visit_call_expression(&mut self, call: &CallExpression<'_>) {
        if is_import_actual_call(call) {
            if let Some(first_arg) = call.arguments.first() {
                let spec_source =
                    &self.source[first_arg.span().start as usize..first_arg.span().end as usize];
                // Replace `vi.importActual('spec')` with `import('spec')`
                ms_overwrite(
                    self.ms,
                    call.span.start,
                    call.span.end,
                    &format!("import({spec_source})"),
                );
            }
        }
        // Continue walking children
        walk::walk_call_expression(self, call);
    }
}

/// Thin wrapper to avoid borrow issues.
fn ms_overwrite(ms: &mut MagicString, start: u32, end: u32, text: &str) {
    ms.overwrite(start, end, text);
}

/// Find `vi.mock()` / `mock.module()` calls inside function bodies (nested).
/// These are invalid and should emit compile errors.
fn find_nested_mock_calls(
    program: &Program,
    source: &str,
    _top_level_starts: &HashSet<u32>,
) -> Vec<Diagnostic> {
    let mut visitor = NestedMockVisitor {
        diagnostics: Vec::new(),
        source,
        depth: 0,
    };
    visitor.visit_program(program);
    visitor.diagnostics
}

struct NestedMockVisitor<'a> {
    diagnostics: Vec<Diagnostic>,
    source: &'a str,
    depth: usize,
}

impl Visit<'_> for NestedMockVisitor<'_> {
    fn visit_function_body(&mut self, body: &FunctionBody<'_>) {
        self.depth += 1;
        walk::walk_function_body(self, body);
        self.depth -= 1;
    }

    fn visit_call_expression(&mut self, call: &CallExpression<'_>) {
        if self.depth > 0 && is_mock_call(call) {
            let (line, col) =
                crate::utils::offset_to_line_column(self.source, call.span.start as usize);
            self.diagnostics.push(Diagnostic {
                message: "vi.mock() must be called at the module top level. Move vi.mock() to the top of the file, and use mockFn.mockImplementation() inside test blocks to change behavior per test.".to_string(),
                line: Some(line),
                column: Some(col),
            });
        }
        walk::walk_call_expression(self, call);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::magic_string::MagicString;
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    fn parse_and_transform(source: &str) -> (String, MockHoistingResult) {
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let mut ms = MagicString::new(source);
        let result = transform_mock_hoisting(&mut ms, &parsed.program, source);
        (ms.to_string(), result)
    }

    fn parse_and_collect(source: &str) -> HashSet<String> {
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        collect_mocked_specifiers(&parsed.program)
    }

    // ── collect_mocked_specifiers tests ──────────────────────────────────

    #[test]
    fn collect_vi_mock_specifier() {
        let specs = parse_and_collect("vi.mock('@vertz/compiler', () => ({}));");
        assert_eq!(specs.len(), 1);
        assert!(specs.contains("@vertz/compiler"));
    }

    #[test]
    fn collect_mock_module_specifier() {
        let specs = parse_and_collect("mock.module('postgres', () => ({}));");
        assert_eq!(specs.len(), 1);
        assert!(specs.contains("postgres"));
    }

    #[test]
    fn collect_multiple_specifiers() {
        let source = r#"
vi.mock('@vertz/compiler', () => ({}));
mock.module('postgres', () => ({}));
"#;
        let specs = parse_and_collect(source);
        assert_eq!(specs.len(), 2);
        assert!(specs.contains("@vertz/compiler"));
        assert!(specs.contains("postgres"));
    }

    #[test]
    fn collect_ignores_non_mock_calls() {
        let source = r#"
vi.fn();
mock();
spyOn(obj, 'method');
const x = vi.mock;
"#;
        let specs = parse_and_collect(source);
        assert!(specs.is_empty());
    }

    #[test]
    fn collect_empty_for_no_mocks() {
        let specs = parse_and_collect("const x = 1;");
        assert!(specs.is_empty());
    }

    // ── Named import rewriting ───────────────────────────────────────────

    #[test]
    fn rewrite_named_imports() {
        let source = r#"import { add, multiply } from './math';
vi.mock('./math', () => ({ add: 1, multiply: 2 }));
"#;
        let (output, result) = parse_and_transform(source);
        assert!(result.mocked_specifiers.contains("./math"));
        assert!(output.contains("globalThis.__vertz_mock_0 = "));
        assert!(output
            .contains("const { add, multiply } = globalThis.__vertz_mocked_modules['./math']"));
        assert!(!output.contains("import { add, multiply }"));
    }

    #[test]
    fn rewrite_default_import() {
        let source = r#"import createClient from './client';
vi.mock('./client', () => ({ default: () => 'mocked' }));
"#;
        let (output, _) = parse_and_transform(source);
        assert!(output.contains(
            "const createClient = \"default\" in globalThis.__vertz_mocked_modules['./client'] ? globalThis.__vertz_mocked_modules['./client'].default : globalThis.__vertz_mocked_modules['./client']"
        ));
        assert!(!output.contains("import createClient"));
    }

    #[test]
    fn rewrite_namespace_import() {
        let source = r#"import * as utils from './utils';
vi.mock('./utils', () => ({ foo: 1 }));
"#;
        let (output, _) = parse_and_transform(source);
        assert!(output.contains("const utils = globalThis.__vertz_mocked_modules['./utils']"));
        assert!(!output.contains("import * as utils"));
    }

    #[test]
    fn rewrite_side_effect_import() {
        let source = r#"import './setup';
vi.mock('./setup', () => ({}));
"#;
        let (output, _) = parse_and_transform(source);
        // Side-effect import should be removed (empty string)
        assert!(!output.contains("import './setup'"));
    }

    #[test]
    fn rewrite_mixed_default_and_named() {
        let source = r#"import def, { named } from './mod';
vi.mock('./mod', () => ({ default: 'x', named: 'y' }));
"#;
        let (output, _) = parse_and_transform(source);
        assert!(output.contains(
            "const def = \"default\" in globalThis.__vertz_mocked_modules['./mod'] ? globalThis.__vertz_mocked_modules['./mod'].default : globalThis.__vertz_mocked_modules['./mod']"
        ));
        assert!(output.contains("const { named } = globalThis.__vertz_mocked_modules['./mod']"));
    }

    #[test]
    fn non_mocked_import_untouched() {
        let source = r#"import { describe } from '@vertz/test';
import { add } from './math';
vi.mock('./math', () => ({ add: 1 }));
"#;
        let (output, _) = parse_and_transform(source);
        assert!(output.contains("import { describe } from '@vertz/test'"));
        assert!(!output.contains("import { add }"));
    }

    // ── vi.hoisted() ────────────────────────────────────────────────────

    #[test]
    fn hoisted_call_prepended_before_mocks() {
        let source = r#"import { add } from './math';
const { mockAdd } = vi.hoisted(() => ({ mockAdd: vi.fn() }));
vi.mock('./math', () => ({ add: mockAdd }));
"#;
        let (output, _) = parse_and_transform(source);
        // Hoisted should appear before mock factory in the preamble
        let hoisted_pos = output.find("globalThis.__vertz_hoisted_0 = ").unwrap();
        let mock_pos = output.find("globalThis.__vertz_mock_0 = ").unwrap();
        assert!(
            hoisted_pos < mock_pos,
            "Hoisted should be before mock factory"
        );
        // Original vi.hoisted() replaced with var destructuring from globalThis
        assert!(output.contains("var { mockAdd } = globalThis.__vertz_hoisted_0;"));
    }

    // ── vi.importActual() ───────────────────────────────────────────────

    #[test]
    fn import_actual_replaced_with_dynamic_import() {
        let source = r#"import { add } from './math';
vi.mock('./math', async () => {
  const actual = await vi.importActual('./math');
  return { ...actual, add: vi.fn() };
});
"#;
        let (output, _) = parse_and_transform(source);
        assert!(output.contains("import('./math')"));
        assert!(!output.contains("vi.importActual"));
    }

    // ── Mock call removal ───────────────────────────────────────────────

    #[test]
    fn mock_call_removed_from_body() {
        let source = r#"import { add } from './math';
vi.mock('./math', () => ({ add: 1 }));
const x = 1;
"#;
        let (output, _) = parse_and_transform(source);
        // The original vi.mock() statement should be gone
        // But the factory should appear in the prepended block
        assert!(!output.contains("vi.mock('./math'"));
        assert!(output.contains("const x = 1"));
    }

    // ── No-op when no mocks ─────────────────────────────────────────────

    #[test]
    fn no_mocks_produces_no_changes() {
        let source = "import { add } from './math';\nconst x = add(1, 2);\n";
        let (output, result) = parse_and_transform(source);
        assert!(result.mocked_specifiers.is_empty());
        assert!(result.diagnostics.is_empty());
        assert_eq!(output, source);
    }

    // ── Diagnostics ─────────────────────────────────────────────────────

    #[test]
    fn diagnostic_for_nested_mock_call() {
        let source = r#"function setup() {
  vi.mock('./math', () => ({}));
}
"#;
        let (_, result) = parse_and_transform(source);
        assert_eq!(result.diagnostics.len(), 1);
        assert!(result.diagnostics[0]
            .message
            .contains("must be called at the module top level"));
    }

    #[test]
    fn diagnostic_for_mock_without_factory() {
        let source = "vi.mock('./math');\n";
        let (_, result) = parse_and_transform(source);
        assert!(result
            .diagnostics
            .iter()
            .any(|d| d.message.contains("requires a factory function")));
    }

    #[test]
    fn diagnostic_for_unused_mock() {
        let source = r#"vi.mock('./nonexistent', () => ({}));
"#;
        let (_, result) = parse_and_transform(source);
        assert!(result
            .diagnostics
            .iter()
            .any(|d| d.message.contains("has no matching import")));
    }

    #[test]
    fn no_diagnostic_for_valid_mock() {
        let source = r#"import { add } from './math';
vi.mock('./math', () => ({ add: 1 }));
"#;
        let (_, result) = parse_and_transform(source);
        assert!(
            result.diagnostics.is_empty(),
            "Expected no diagnostics, got: {:?}",
            result.diagnostics
        );
    }

    // ── Multiple mocks for same specifier ────────────────────────────────

    #[test]
    fn last_mock_wins_for_same_specifier() {
        let source = r#"import { add } from './math';
vi.mock('./math', () => ({ add: 1 }));
vi.mock('./math', () => ({ add: 2 }));
"#;
        let (output, _) = parse_and_transform(source);
        // Should only have one globalThis.__vertz_mock_N (the last one)
        // The index for the winning mock should be 1 (second mock call)
        assert!(output.contains("globalThis.__vertz_mock_1 = "));
        // Both vi.mock statements should be removed
        assert!(!output.contains("vi.mock('./math'"));
    }

    // ── Registration on globalThis ───────────────────────────────────────

    #[test]
    fn registers_on_global_this() {
        let source = r#"import { add } from './math';
vi.mock('./math', () => ({ add: 1 }));
"#;
        let (output, _) = parse_and_transform(source);
        assert!(output.contains("globalThis.__vertz_mocked_modules"));
        assert!(output
            .contains("globalThis.__vertz_mocked_modules['./math'] = globalThis.__vertz_mock_0"));
    }

    // ── Renamed imports ──────────────────────────────────────────────────

    #[test]
    fn rewrite_renamed_import() {
        let source = r#"import { add as myAdd } from './math';
vi.mock('./math', () => ({ add: 42 }));
"#;
        let (output, _) = parse_and_transform(source);
        assert!(
            output.contains("const { add: myAdd } = globalThis.__vertz_mocked_modules['./math']")
        );
    }

    // ── Pipeline integration (via crate::compile()) ─────────────────────

    #[test]
    fn compile_with_mock_hoisting_enabled() {
        let source = r#"import { add } from './math';
vi.mock('./math', () => ({ add: vi.fn().mockReturnValue(42) }));
const x = add(1, 2);
"#;
        let result = crate::compile(
            source,
            crate::CompileOptions {
                filename: Some("test.test.ts".to_string()),
                mock_hoisting: Some(true),
                ..Default::default()
            },
        );
        let code = &result.code;
        // Mock factory IIFE present in preamble
        assert!(code.contains("globalThis.__vertz_mock_0 = "));
        // Import rewritten to const destructuring from globalThis registry
        assert!(code.contains("const { add } = globalThis.__vertz_mocked_modules['./math']"));
        // Original vi.mock() call removed
        assert!(!code.contains("vi.mock('./math'"));
        // Registration on globalThis
        assert!(code.contains("globalThis.__vertz_mocked_modules"));
    }

    #[test]
    fn compile_without_mock_hoisting_leaves_code_unchanged() {
        let source = r#"import { add } from './math';
vi.mock('./math', () => ({ add: vi.fn() }));
"#;
        let result = crate::compile(
            source,
            crate::CompileOptions {
                filename: Some("test.test.ts".to_string()),
                mock_hoisting: Some(false),
                ..Default::default()
            },
        );
        let code = &result.code;
        // Original vi.mock call still present
        assert!(code.contains("vi.mock('./math'"));
        // No __vertz_mock_ variables
        assert!(!code.contains("__vertz_mock_"));
    }

    #[test]
    fn compile_mock_hoisting_excludes_mocked_specifiers_from_signal_analysis() {
        // If mock hoisting is enabled, imports from mocked modules should not
        // be treated as signal API imports (no .value transforms)
        let source = r#"import { query } from '@vertz/ui';
import { add } from './math';
vi.mock('./math', () => ({ add: vi.fn() }));

function App() {
  const tasks = query(() => fetch('/api/tasks'), { key: 'tasks' });
  return <div>{tasks.data}</div>;
}
"#;
        let result = crate::compile(
            source,
            crate::CompileOptions {
                filename: Some("test.test.tsx".to_string()),
                mock_hoisting: Some(true),
                ..Default::default()
            },
        );
        let code = &result.code;
        // The mock transform should run
        assert!(code.contains("__vertz_mock_0"));
        // Non-mocked import (query from @vertz/ui) should still be processed
        // (query is a signal API, so tasks.data would get .value in JSX)
        // The mocked import (add from ./math) should NOT get signal transforms
        assert!(!code.contains("add.value"));
    }
}
