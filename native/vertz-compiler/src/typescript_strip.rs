use oxc_ast::ast::*;
use oxc_ast_visit::Visit;
use oxc_span::GetSpan;

use crate::magic_string::MagicString;

/// Strip TypeScript-specific syntax from the source.
/// Must run before JSX transform so that `get_transformed_slice()` returns clean JS.
pub fn strip_typescript_syntax(ms: &mut MagicString, program: &Program, source: &str) {
    // Phase 1: Remove top-level TS declarations and type-only imports
    let mut removed_spans: Vec<(u32, u32)> = Vec::new();

    for stmt in &program.body {
        if let Some(span) = get_removable_statement_span(stmt) {
            ms.overwrite(span.0, span.1, "");
            removed_spans.push(span);
        }

        // Handle mixed type/value imports (remove only type specifiers)
        strip_type_import_specifiers(ms, stmt, source);
    }

    // Phase 2: Walk AST for inline TS syntax (as, !, type params, type annotations)
    let mut stripper = InlineTsStripper {
        ms,
        removed_spans: &removed_spans,
    };
    for stmt in &program.body {
        stripper.visit_statement(stmt);
    }
}

/// Check if a top-level statement is a TS declaration that should be removed entirely.
fn get_removable_statement_span(stmt: &Statement) -> Option<(u32, u32)> {
    match stmt {
        Statement::TSInterfaceDeclaration(decl) => Some((decl.span.start, decl.span.end)),
        Statement::TSTypeAliasDeclaration(decl) => Some((decl.span.start, decl.span.end)),
        // declare var/let/const
        Statement::VariableDeclaration(decl) if decl.declare => {
            Some((decl.span.start, decl.span.end))
        }
        // declare function
        Statement::FunctionDeclaration(func)
            if func.declare =>
        {
            Some((func.span.start, func.span.end))
        }
        // declare class
        Statement::ClassDeclaration(cls)
            if cls.declare =>
        {
            Some((cls.span.start, cls.span.end))
        }
        // declare module / declare namespace
        Statement::TSModuleDeclaration(decl) => Some((decl.span.start, decl.span.end)),
        // declare enum / declare const enum
        Statement::TSEnumDeclaration(decl) if decl.declare => {
            Some((decl.span.start, decl.span.end))
        }
        Statement::ExportNamedDeclaration(export_decl) => {
            if let Some(ref decl) = export_decl.declaration {
                match decl {
                    Declaration::TSInterfaceDeclaration(_)
                    | Declaration::TSTypeAliasDeclaration(_) => {
                        Some((export_decl.span.start, export_decl.span.end))
                    }
                    // export declare var/let/const
                    Declaration::VariableDeclaration(vd) if vd.declare => {
                        Some((export_decl.span.start, export_decl.span.end))
                    }
                    // export declare function
                    Declaration::FunctionDeclaration(func) if func.declare => {
                        Some((export_decl.span.start, export_decl.span.end))
                    }
                    // export declare class
                    Declaration::ClassDeclaration(cls) if cls.declare => {
                        Some((export_decl.span.start, export_decl.span.end))
                    }
                    // export declare module / namespace
                    Declaration::TSModuleDeclaration(_) => {
                        Some((export_decl.span.start, export_decl.span.end))
                    }
                    // export declare enum
                    Declaration::TSEnumDeclaration(ed) if ed.declare => {
                        Some((export_decl.span.start, export_decl.span.end))
                    }
                    _ => None,
                }
            } else {
                None
            }
        }
        Statement::ImportDeclaration(import_decl) => {
            if matches!(import_decl.import_kind, ImportOrExportKind::Type) {
                Some((import_decl.span.start, import_decl.span.end))
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Remove type-only specifiers from mixed imports.
/// `import { type FC, useState } from 'some-lib'` → `import { useState } from 'some-lib'`
/// If ALL named specifiers are type-only (and no default/namespace import), remove the entire import.
fn strip_type_import_specifiers(ms: &mut MagicString, stmt: &Statement, source: &str) {
    let import_decl = match stmt {
        Statement::ImportDeclaration(decl) => decl,
        _ => return,
    };

    // Skip type-only imports (handled in phase 1)
    if matches!(import_decl.import_kind, ImportOrExportKind::Type) {
        return;
    }

    let Some(ref specifiers) = import_decl.specifiers else {
        return;
    };

    // Count type vs value specifiers
    let mut type_count = 0usize;
    let mut value_count = 0usize;
    let mut has_default_or_namespace = false;

    for spec in specifiers {
        match spec {
            ImportDeclarationSpecifier::ImportSpecifier(named) => {
                if matches!(named.import_kind, ImportOrExportKind::Type) {
                    type_count += 1;
                } else {
                    value_count += 1;
                }
            }
            ImportDeclarationSpecifier::ImportDefaultSpecifier(_)
            | ImportDeclarationSpecifier::ImportNamespaceSpecifier(_) => {
                has_default_or_namespace = true;
            }
        }
    }

    // If ALL named specifiers are type-only and no default/namespace import,
    // remove the entire import declaration
    if type_count > 0 && value_count == 0 && !has_default_or_namespace {
        ms.overwrite(import_decl.span.start, import_decl.span.end, "");
        return;
    }

    // Otherwise, remove individual type specifiers
    for spec in specifiers {
        if let ImportDeclarationSpecifier::ImportSpecifier(named) = spec {
            if matches!(named.import_kind, ImportOrExportKind::Type) {
                remove_specifier_with_comma(ms, source, named.span.start, named.span.end);
            }
        }
    }
}

/// Remove an import specifier along with its adjacent comma and whitespace.
fn remove_specifier_with_comma(ms: &mut MagicString, source: &str, start: u32, end: u32) {
    let after = &source[end as usize..];
    let mut trailing = 0usize;
    let mut found_comma = false;

    for ch in after.chars() {
        if ch == ',' {
            trailing += 1;
            found_comma = true;
            // Also consume whitespace after the comma
            for ch2 in after[trailing..].chars() {
                if ch2 == ' ' || ch2 == '\t' {
                    trailing += 1;
                } else {
                    break;
                }
            }
            break;
        } else if ch == ' ' || ch == '\t' {
            trailing += 1;
        } else {
            break;
        }
    }

    if found_comma {
        ms.overwrite(start, end + trailing as u32, "");
        return;
    }

    // No trailing comma — look for leading comma + whitespace
    let before = &source[..start as usize];
    let mut leading = 0usize;
    for ch in before.chars().rev() {
        if ch == ' ' || ch == '\t' {
            leading += 1;
        } else if ch == ',' {
            leading += 1;
            break;
        } else {
            break;
        }
    }

    if leading > 0 {
        ms.overwrite(start - leading as u32, end, "");
    } else {
        ms.overwrite(start, end, "");
    }
}

/// Walks the AST to strip inline TypeScript syntax.
struct InlineTsStripper<'a, 'b> {
    ms: &'a mut MagicString,
    removed_spans: &'b [(u32, u32)],
}

impl<'a, 'b> InlineTsStripper<'a, 'b> {
    fn is_in_removed_span(&self, start: u32) -> bool {
        self.removed_spans
            .iter()
            .any(|(rs, re)| start >= *rs && start < *re)
    }
}

impl<'a, 'b, 'c> Visit<'c> for InlineTsStripper<'a, 'b> {
    fn visit_ts_as_expression(&mut self, expr: &TSAsExpression<'c>) {
        if self.is_in_removed_span(expr.span.start) {
            return;
        }
        // `expr as Type` → `expr`
        // Remove from expression end to the ts_as span end
        self.ms
            .overwrite(expr.expression.span().end, expr.span.end, "");
        // Continue visiting the inner expression
        self.visit_expression(&expr.expression);
    }

    fn visit_ts_satisfies_expression(&mut self, expr: &TSSatisfiesExpression<'c>) {
        if self.is_in_removed_span(expr.span.start) {
            return;
        }
        // `expr satisfies Type` → `expr`
        self.ms
            .overwrite(expr.expression.span().end, expr.span.end, "");
        self.visit_expression(&expr.expression);
    }

    fn visit_ts_non_null_expression(&mut self, expr: &TSNonNullExpression<'c>) {
        if self.is_in_removed_span(expr.span.start) {
            return;
        }
        // `expr!` → `expr`
        self.ms
            .overwrite(expr.expression.span().end, expr.span.end, "");
        self.visit_expression(&expr.expression);
    }

    fn visit_ts_type_parameter_instantiation(
        &mut self,
        params: &TSTypeParameterInstantiation<'c>,
    ) {
        if self.is_in_removed_span(params.span.start) {
            return;
        }
        // Remove `<Type1, Type2>` on function calls
        self.ms.overwrite(params.span.start, params.span.end, "");
    }

    fn visit_ts_type_parameter_declaration(&mut self, params: &TSTypeParameterDeclaration<'c>) {
        if self.is_in_removed_span(params.span.start) {
            return;
        }
        // Remove `<T>` on function definitions
        self.ms.overwrite(params.span.start, params.span.end, "");
    }

    fn visit_ts_type_annotation(&mut self, annot: &TSTypeAnnotation<'c>) {
        if self.is_in_removed_span(annot.span.start) {
            return;
        }
        // Remove `: Type` annotations on variables, params, return types
        self.ms.overwrite(annot.span.start, annot.span.end, "");
    }

    // Don't walk into TS declarations (already removed in phase 1)
    fn visit_ts_interface_declaration(&mut self, _decl: &TSInterfaceDeclaration<'c>) {}
    fn visit_ts_type_alias_declaration(&mut self, _decl: &TSTypeAliasDeclaration<'c>) {}
}
