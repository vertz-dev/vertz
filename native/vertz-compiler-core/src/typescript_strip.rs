use oxc_ast::ast::*;
use oxc_ast_visit::{walk, Visit};
use oxc_span::GetSpan;
use oxc_syntax::scope::ScopeFlags;

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
        // Handle mixed type/value exports: `export { type Foo, value }` → `export { value }`
        strip_type_export_specifiers(ms, stmt, source);
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
        Statement::FunctionDeclaration(func) if func.declare => {
            Some((func.span.start, func.span.end))
        }
        // declare class
        Statement::ClassDeclaration(cls) if cls.declare => Some((cls.span.start, cls.span.end)),
        // declare module / declare namespace
        Statement::TSModuleDeclaration(decl) if decl.declare => {
            Some((decl.span.start, decl.span.end))
        }
        // declare global { ... } (global augmentation — type-only, always strip)
        Statement::TSGlobalDeclaration(decl) => Some((decl.span.start, decl.span.end)),
        // declare enum / declare const enum
        Statement::TSEnumDeclaration(decl) if decl.declare => {
            Some((decl.span.start, decl.span.end))
        }
        Statement::ExportNamedDeclaration(export_decl) => {
            // `export type { Foo }` or `export type { Foo } from './types'`
            if matches!(export_decl.export_kind, ImportOrExportKind::Type) {
                return Some((export_decl.span.start, export_decl.span.end));
            }
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
                    Declaration::TSModuleDeclaration(decl) if decl.declare => {
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

    // If default/namespace import + all named are type-only,
    // remove the comma and braces: `import Lib, { type A } from 'lib'` → `import Lib from 'lib'`
    if type_count > 0 && value_count == 0 && has_default_or_namespace {
        // Find the first named specifier to locate the opening brace region
        let first_named = specifiers.iter().find_map(|s| {
            if let ImportDeclarationSpecifier::ImportSpecifier(named) = s {
                Some(named.span.start)
            } else {
                None
            }
        });
        let last_named = specifiers.iter().rev().find_map(|s| {
            if let ImportDeclarationSpecifier::ImportSpecifier(named) = s {
                Some(named.span.end)
            } else {
                None
            }
        });

        if let (Some(first_start), Some(last_end)) = (first_named, last_named) {
            // Scan backward from first named specifier to find `, {` (comma + optional whitespace + brace)
            let before = &source[..first_start as usize];
            // Walk back past whitespace, then '{', then whitespace, then ','
            let chars: Vec<char> = before.chars().collect();
            let mut i = chars.len();
            // Skip whitespace
            while i > 0 && (chars[i - 1] == ' ' || chars[i - 1] == '\t') {
                i -= 1;
            }
            // Skip '{'
            if i > 0 && chars[i - 1] == '{' {
                i -= 1;
            }
            // Skip whitespace
            while i > 0 && (chars[i - 1] == ' ' || chars[i - 1] == '\t') {
                i -= 1;
            }
            // Skip ','
            if i > 0 && chars[i - 1] == ',' {
                i -= 1;
            }
            let remove_start = i;

            // Scan forward from last named specifier to find '}' (optional whitespace + brace)
            let after = &source[last_end as usize..];
            let mut remove_end = last_end as usize;
            for ch in after.chars() {
                remove_end += ch.len_utf8();
                if ch == '}' {
                    break;
                }
            }

            ms.overwrite(remove_start as u32, remove_end as u32, "");
            return;
        }
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

/// Remove type-only specifiers from mixed exports.
/// `export { type FC, useState }` → `export { useState }`
/// If ALL specifiers are type-only, remove the entire export (caught in phase 1 via export_kind check,
/// but this handles `export { type A, type B }` where export_kind is Value but all specifiers are type).
fn strip_type_export_specifiers(ms: &mut MagicString, stmt: &Statement, source: &str) {
    let export_decl = match stmt {
        Statement::ExportNamedDeclaration(decl) => decl,
        _ => return,
    };

    // Skip type-only exports (already handled in phase 1)
    if matches!(export_decl.export_kind, ImportOrExportKind::Type) {
        return;
    }

    // Only handle re-exports with specifiers, no declaration
    if export_decl.declaration.is_some() || export_decl.specifiers.is_empty() {
        return;
    }

    let mut type_count = 0usize;
    let mut value_count = 0usize;

    for spec in &export_decl.specifiers {
        if matches!(spec.export_kind, ImportOrExportKind::Type) {
            type_count += 1;
        } else {
            value_count += 1;
        }
    }

    if type_count == 0 {
        return;
    }

    // If ALL specifiers are type-only, remove the entire export
    if value_count == 0 {
        ms.overwrite(export_decl.span.start, export_decl.span.end, "");
        return;
    }

    // Otherwise, remove individual type specifiers
    for spec in &export_decl.specifiers {
        if matches!(spec.export_kind, ImportOrExportKind::Type) {
            remove_specifier_with_comma(ms, source, spec.span.start, spec.span.end);
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

    fn visit_ts_type_parameter_instantiation(&mut self, params: &TSTypeParameterInstantiation<'c>) {
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

    fn visit_variable_declarator(&mut self, decl: &VariableDeclarator<'c>) {
        if self.is_in_removed_span(decl.span.start) {
            return;
        }
        // Handle definite assignment assertion: `let x!: Type` → `let x`
        // The `!` sits between the binding identifier end and the type annotation start.
        // The type annotation itself is handled by visit_ts_type_annotation.
        if decl.definite {
            let id_end = decl.id.span().end;
            // The `!` is the character right after the identifier
            let bang_end = id_end + 1;
            // Only strip if the character is actually `!`
            let source_slice = self.ms.slice(id_end, bang_end);
            if source_slice == "!" {
                self.ms.overwrite(id_end, bang_end, "");
            }
        }
        // Continue walking to strip type annotations and other TS syntax
        walk::walk_variable_declarator(self, decl);
    }

    fn visit_ts_type_annotation(&mut self, annot: &TSTypeAnnotation<'c>) {
        if self.is_in_removed_span(annot.span.start) {
            return;
        }
        // Remove `: Type` annotations on variables, params, return types
        self.ms.overwrite(annot.span.start, annot.span.end, "");
    }

    fn visit_function(&mut self, func: &Function<'c>, _flags: ScopeFlags) {
        if self.is_in_removed_span(func.span.start) {
            return;
        }

        // Strip TypeScript `this` parameter: `function foo(this: Type, arg)` → `function foo(arg)`
        if let Some(ref this_param) = func.this_param {
            let tp_end = this_param.span.end;
            // Check if there's a trailing comma + whitespace before the next param
            let file_end = self.ms.len();
            let remaining = self.ms.slice(tp_end, file_end);
            let extra = remaining
                .find(|c: char| c != ',' && c != ' ' && c != '\n' && c != '\r' && c != '\t')
                .unwrap_or(0);
            self.ms
                .overwrite(this_param.span.start, tp_end + extra as u32, "");
        }

        walk::walk_function(self, func, _flags);
    }

    fn visit_class(&mut self, class: &Class<'c>) {
        if self.is_in_removed_span(class.span.start) {
            return;
        }

        // Strip `abstract` keyword from class declarations.
        // `export abstract class Foo` → `export class Foo`
        if class.r#abstract {
            let src = self.ms.slice(class.span.start, class.span.end);
            if src.starts_with("abstract ") {
                self.ms.overwrite(
                    class.span.start,
                    class.span.start + "abstract ".len() as u32,
                    "",
                );
            }
        }

        // Strip `implements Foo, Bar<T>` clause — type-only in JavaScript.
        // Scan from the first implements entry backwards to find the `implements` keyword.
        if !class.implements.is_empty() {
            let first_impl = &class.implements[0];
            let last_impl = &class.implements[class.implements.len() - 1];
            // Find the `implements` keyword before the first TSClassImplements span.
            let search_start = class.span.start as usize;
            let search_slice = self.ms.slice(class.span.start, first_impl.span.start);
            let keyword_start = search_slice
                .rfind("implements")
                .map(|pos| (search_start + pos) as u32);
            if let Some(kw_start) = keyword_start {
                // Remove from `implements` keyword through the end of the last implements entry.
                self.ms.overwrite(kw_start, last_impl.span.end, "");
            }
        }

        // Transform constructor parameter properties before walking the class.
        // `constructor(public readonly x: number)` needs:
        // 1. Strip `public readonly ` modifiers from the parameter
        // 2. Add `this.x = x;` assignments in the constructor body
        self.transform_constructor_param_props(class);

        // Continue the default walk for nested TS syntax (type annotations, etc.)
        walk::walk_class(self, class);
    }

    fn visit_property_definition(&mut self, prop: &PropertyDefinition<'c>) {
        if self.is_in_removed_span(prop.span.start) {
            return;
        }

        // Abstract properties are type-only — remove the entire field.
        // `protected abstract _errorMessage: string;` → removed entirely.
        if matches!(
            prop.r#type,
            PropertyDefinitionType::TSAbstractPropertyDefinition
        ) {
            self.ms.overwrite(prop.span.start, prop.span.end, "");
            return;
        }

        // `declare` on class fields means type-only — remove the entire field.
        // `declare readonly status: 401;` → removed entirely.
        if prop.declare {
            self.ms.overwrite(prop.span.start, prop.span.end, "");
            return;
        }

        // Strip `readonly` keyword from class property definitions.
        // `readonly code = 'OK';` → `code = 'OK';`
        if prop.readonly {
            let src = self.ms.slice(prop.span.start, prop.span.end);
            // readonly could be after `static`, `accessor`, etc.
            if let Some(pos) = src.find("readonly ") {
                let abs_start = prop.span.start + pos as u32;
                self.ms
                    .overwrite(abs_start, abs_start + "readonly ".len() as u32, "");
            }
        }

        // Strip accessibility modifiers (public/private/protected) on class fields.
        if prop.accessibility.is_some() {
            let src = self.ms.slice(prop.span.start, prop.span.end);
            for kw in &["public ", "private ", "protected "] {
                if let Some(pos) = src.find(kw) {
                    let abs_start = prop.span.start + pos as u32;
                    self.ms
                        .overwrite(abs_start, abs_start + kw.len() as u32, "");
                    break;
                }
            }
        }

        // Strip `override` keyword on class fields.
        if prop.r#override {
            let src = self.ms.slice(prop.span.start, prop.span.end);
            if let Some(pos) = src.find("override ") {
                let abs_start = prop.span.start + pos as u32;
                self.ms
                    .overwrite(abs_start, abs_start + "override ".len() as u32, "");
            }
        }

        // Strip `?` optional marker from class fields (e.g., `resource?: string;` → `resource;`)
        if prop.optional {
            let key_end = prop.key.span().end;
            // The `?` should be right after the key
            let after_key = self.ms.slice(key_end, prop.span.end);
            if after_key.starts_with('?') {
                self.ms.overwrite(key_end, key_end + 1, "");
            }
        }

        // Continue the default walk (handles type annotations, initializers, etc.)
        walk::walk_property_definition(self, prop);
    }

    fn visit_method_definition(&mut self, method: &MethodDefinition<'c>) {
        if self.is_in_removed_span(method.span.start) {
            return;
        }

        // Abstract methods are type-only — remove the entire method.
        // `protected abstract _validate(value: string): boolean;` → removed entirely.
        if matches!(
            method.r#type,
            MethodDefinitionType::TSAbstractMethodDefinition
        ) {
            self.ms.overwrite(method.span.start, method.span.end, "");
            return;
        }

        // Method overload signatures (no body) are type-only — remove entirely.
        // `constructor(a: string);` or `method(a: string): void;` → removed.
        if method.value.body.is_none() {
            self.ms.overwrite(method.span.start, method.span.end, "");
            return;
        }

        // Strip accessibility modifiers on methods (public/private/protected)
        if method.accessibility.is_some() {
            let src = self.ms.slice(method.span.start, method.span.end);
            for kw in &["public ", "private ", "protected "] {
                if let Some(pos) = src.find(kw) {
                    let abs_start = method.span.start + pos as u32;
                    self.ms
                        .overwrite(abs_start, abs_start + kw.len() as u32, "");
                    break;
                }
            }
        }

        // Strip `override` keyword on methods
        if method.r#override {
            let src = self.ms.slice(method.span.start, method.span.end);
            if let Some(pos) = src.find("override ") {
                let abs_start = method.span.start + pos as u32;
                self.ms
                    .overwrite(abs_start, abs_start + "override ".len() as u32, "");
            }
        }

        // Continue the default walk
        walk::walk_method_definition(self, method);
    }

    fn visit_ts_enum_declaration(&mut self, decl: &TSEnumDeclaration<'c>) {
        if self.is_in_removed_span(decl.span.start) {
            return; // declare enum — already removed in phase 1
        }
        // Compile non-declare enum to JS (IIFE pattern)
        self.compile_enum(decl);
        // Don't walk children — we've replaced the entire span
    }

    // Don't walk into TS declarations (already removed in phase 1)
    fn visit_ts_interface_declaration(&mut self, _decl: &TSInterfaceDeclaration<'c>) {}
    fn visit_ts_type_alias_declaration(&mut self, _decl: &TSTypeAliasDeclaration<'c>) {}
}

impl<'a, 'b> InlineTsStripper<'a, 'b> {
    /// Compile a TypeScript enum declaration to JavaScript using the IIFE pattern.
    ///
    /// String enum:
    /// ```ts
    /// enum ErrorCode { InvalidType = 'invalid_type', Custom = 'custom' }
    /// ```
    /// Becomes:
    /// ```js
    /// var ErrorCode; (function (ErrorCode) {
    ///   ErrorCode["InvalidType"] = "invalid_type";
    ///   ErrorCode["Custom"] = "custom";
    /// })(ErrorCode || (ErrorCode = {}))
    /// ```
    ///
    /// Numeric enum (with reverse mappings):
    /// ```ts
    /// enum Dir { Up, Down = 5, Left }
    /// ```
    /// Becomes:
    /// ```js
    /// var Dir; (function (Dir) {
    ///   Dir[Dir["Up"] = 0] = "Up";
    ///   Dir[Dir["Down"] = 5] = "Down";
    ///   Dir[Dir["Left"] = 6] = "Left";
    /// })(Dir || (Dir = {}))
    /// ```
    fn compile_enum(&mut self, decl: &TSEnumDeclaration) {
        let name = decl.id.name.as_str();
        let mut stmts = Vec::new();
        let mut auto_value: i64 = 0;

        for member in &decl.body.members {
            let member_name = match &member.id {
                TSEnumMemberName::Identifier(id) => id.name.to_string(),
                TSEnumMemberName::String(s) => s.value.to_string(),
                TSEnumMemberName::ComputedString(s) => s.value.to_string(),
                TSEnumMemberName::ComputedTemplateString(_) => continue, // skip exotic
            };

            if let Some(ref init) = member.initializer {
                let init_start: u32 = init.span().start;
                let init_end: u32 = init.span().end;
                let init_src = self.ms.slice(init_start, init_end).to_string();

                // Check if the initializer is a numeric literal
                if matches!(init, Expression::NumericLiteral(_)) {
                    if let Expression::NumericLiteral(n) = init {
                        auto_value = n.value as i64 + 1;
                    }
                    // Numeric member with reverse mapping
                    stmts.push(format!(
                        "  {name}[{name}[\"{member_name}\"] = {init_src}] = \"{member_name}\";",
                    ));
                } else {
                    // String or expression — no reverse mapping
                    stmts.push(format!("  {name}[\"{member_name}\"] = {init_src};",));
                }
            } else {
                // Auto-increment numeric
                stmts.push(format!(
                    "  {name}[{name}[\"{member_name}\"] = {auto_value}] = \"{member_name}\";",
                ));
                auto_value += 1;
            }
        }

        let body = stmts.join("\n");
        let replacement =
            format!("var {name};\n(function ({name}) {{\n{body}\n}})({name} || ({name} = {{}}))");

        self.ms
            .overwrite(decl.span.start, decl.span.end, &replacement);
    }

    /// Transform constructor parameter properties into regular parameters + assignments.
    ///
    /// TypeScript:
    /// ```ts
    /// constructor(public readonly x: number, private y: string) {
    ///   super();
    /// }
    /// ```
    /// Becomes:
    /// ```js
    /// constructor(x, y) {
    ///   super();
    ///   this.x = x;
    ///   this.y = y;
    /// }
    /// ```
    fn transform_constructor_param_props(&mut self, class: &Class) {
        for element in &class.body.body {
            let method = match element {
                ClassElement::MethodDefinition(m)
                    if m.kind == MethodDefinitionKind::Constructor =>
                {
                    m
                }
                _ => continue,
            };

            let function = &method.value;
            let params = &function.params;
            let mut param_names: Vec<String> = Vec::new();

            for param in &params.items {
                let has_modifier = param.accessibility.is_some() || param.readonly;
                if !has_modifier {
                    continue;
                }

                // Get parameter name from the binding pattern
                let name = match &param.pattern {
                    BindingPattern::BindingIdentifier(ident) => ident.name.to_string(),
                    _ => continue, // Destructured params with modifiers are rare
                };

                // Remove modifiers: overwrite from param start to pattern start
                // This strips `public readonly ` (or `private `, `protected `, `readonly `)
                if param.span.start < param.pattern.span().start {
                    self.ms
                        .overwrite(param.span.start, param.pattern.span().start, "");
                }

                param_names.push(name);
            }

            // Insert `this.x = x;` assignments in the constructor body
            if !param_names.is_empty() {
                if let Some(body) = &function.body {
                    let insert_pos = find_assignment_insert_pos(body);
                    let assignments: String = param_names
                        .iter()
                        .map(|name| format!("this.{} = {};", name, name))
                        .collect::<Vec<_>>()
                        .join("\n");
                    self.ms
                        .append_right(insert_pos, &format!("\n{}", assignments));
                }
            }
        }
    }
}

/// Find the position to insert parameter property assignments in a constructor body.
/// If a `super()` call is present, insert after it. Otherwise, after the opening `{`.
fn find_assignment_insert_pos(body: &FunctionBody) -> u32 {
    for stmt in &body.statements {
        if let Statement::ExpressionStatement(expr_stmt) = stmt {
            if is_super_call(&expr_stmt.expression) {
                return expr_stmt.span.end;
            }
        }
    }
    // No super() — insert after the opening `{`
    body.span.start + 1
}

/// Check if an expression is a `super(...)` call.
fn is_super_call(expr: &Expression) -> bool {
    if let Expression::CallExpression(call) = expr {
        matches!(call.callee.without_parentheses(), Expression::Super(_))
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    fn strip(source: &str) -> String {
        let allocator = Allocator::default();
        let source_type = SourceType::tsx();
        let parser = Parser::new(&allocator, source, source_type);
        let parsed = parser.parse();
        let mut ms = MagicString::new(source);
        strip_typescript_syntax(&mut ms, &parsed.program, source);
        ms.to_string()
    }

    #[test]
    fn test_strip_return_type_annotation() {
        let result = strip(
            r#"function foo(x: number): string {
  return String(x);
}"#,
        );
        assert!(
            !result.contains(": number"),
            "param annotation not stripped: {}",
            result
        );
        assert!(
            !result.contains(": string"),
            "return type not stripped: {}",
            result
        );
        assert!(result.contains("function foo(x) {"), "result: {}", result);
    }

    #[test]
    fn test_strip_return_type_with_union_string_literals() {
        let result = strip(
            r#"function priorityColor(
  priority: TaskPriority,
): "blue" | "green" | "yellow" | "red" {
  return "blue";
}"#,
        );
        assert!(
            !result.contains(": TaskPriority"),
            "param not stripped: {}",
            result
        );
        assert!(
            !result.contains("\"blue\" | \"green\""),
            "return type not stripped: {}",
            result
        );
    }

    #[test]
    fn test_strip_variable_type_annotation_with_generics() {
        let result = strip(
            r#"const map: Record<string, number> = {};
"#,
        );
        assert!(
            !result.contains(": Record<"),
            "variable annotation not stripped: {}",
            result
        );
        assert!(result.contains("const map = {}"), "result: {}", result);
    }

    #[test]
    fn test_strip_import_type() {
        let result = strip(
            r#"import type { Task } from "./types";
const x = 1;
"#,
        );
        assert!(
            !result.contains("import type"),
            "import type not stripped: {}",
            result
        );
        assert!(result.contains("const x = 1"), "result: {}", result);
    }

    /// Test that full compile() doesn't re-introduce type annotations.
    #[test]
    fn test_full_compile_strips_type_annotations() {
        let source = r#"import type { Task } from "./types";

function priorityColor(
  priority: string,
): "blue" | "green" | "red" {
  const map: Record<string, string> = { low: "blue" };
  return map[priority];
}

export function TaskCard({ task }: { task: Task }) {
  return <div>{priorityColor("low")}</div>;
}
"#;
        let result = crate::compile(
            source,
            crate::CompileOptions {
                filename: Some("test.tsx".to_string()),
                target: Some("dom".to_string()),
                fast_refresh: Some(true),
                ..Default::default()
            },
        );
        assert!(
            !result.code.contains("import type"),
            "import type survived full compile: {}",
            result.code
        );
        assert!(
            !result.code.contains("): \"blue\""),
            "return type survived full compile: {}",
            result.code
        );
        assert!(
            !result.code.contains(": Record<"),
            "variable annotation survived full compile: {}",
            result.code
        );
    }

    /// Test with the actual task-card.tsx content pattern
    #[test]
    fn test_full_compile_strips_task_card_pattern() {
        let source = r#"import type { Task, TaskPriority, TaskStatus } from "../lib/types";
import { badge, cardStyles } from "../styles/components";

function priorityColor(
  priority: TaskPriority,
): "blue" | "green" | "yellow" | "red" {
  const map: Record<TaskPriority, "blue" | "green" | "yellow" | "red"> = {
    low: "blue",
    medium: "yellow",
    high: "red",
    urgent: "red",
  };
  return map[priority];
}

function statusLabel(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    todo: "To Do",
    "in-progress": "In Progress",
    done: "Done",
  };
  return map[status];
}

export function TaskCard({ task, onClick }: { task: Task; onClick?: (id: string) => void }) {
  return (
    <div>
      <span>{priorityColor(task.priority)}</span>
      <span>{statusLabel(task.status)}</span>
    </div>
  );
}
"#;
        let result = crate::compile(
            source,
            crate::CompileOptions {
                filename: Some("task-card.tsx".to_string()),
                target: Some("dom".to_string()),
                fast_refresh: Some(true),
                ..Default::default()
            },
        );

        // Check each annotation type
        assert!(
            !result.code.contains("import type"),
            "import type survived: {}",
            result.code
        );
        assert!(
            !result.code.contains(": TaskPriority"),
            "param annotation survived: {}",
            result.code
        );
        assert!(
            !result.code.contains(": TaskStatus"),
            "param annotation survived: {}",
            result.code
        );
        assert!(
            !result.code.contains("): \"blue\""),
            "return type survived: {}",
            result.code
        );
        assert!(
            !result.code.contains(": Record<"),
            "variable type survived: {}",
            result.code
        );
        assert!(
            !result.code.contains("): string"),
            "return string type survived: {}",
            result.code
        );
    }

    #[test]
    fn test_strip_constructor_parameter_properties() {
        let result = strip(
            r#"class Foo extends Base {
  constructor(
    public readonly x: number,
    private y: string,
  ) {
    super();
  }
}"#,
        );
        // Modifiers should be stripped
        assert!(
            !result.contains("public"),
            "public modifier not stripped: {}",
            result
        );
        assert!(
            !result.contains("private"),
            "private modifier not stripped: {}",
            result
        );
        assert!(
            !result.contains("readonly"),
            "readonly modifier not stripped: {}",
            result
        );
        // Assignments should be inserted after super()
        assert!(
            result.contains("this.x = x;"),
            "missing this.x assignment: {}",
            result
        );
        assert!(
            result.contains("this.y = y;"),
            "missing this.y assignment: {}",
            result
        );
        // Parameter names should remain
        assert!(result.contains("x,"), "param x missing: {}", result);
    }

    #[test]
    fn test_strip_constructor_param_props_no_super() {
        let result = strip(
            r#"class Foo {
  constructor(public x: number) {
    console.log(x);
  }
}"#,
        );
        assert!(
            !result.contains("public"),
            "public not stripped: {}",
            result
        );
        assert!(
            result.contains("this.x = x;"),
            "missing assignment: {}",
            result
        );
    }

    #[test]
    fn test_strip_constructor_param_props_in_nested_class() {
        // Class defined inside a function (like in test blocks)
        let result = strip(
            r#"function test() {
  class MyError extends AppError {
    constructor(
      public readonly required: number,
      public readonly available: number,
    ) {
      super('ERR', 'msg');
    }
  }
  return new MyError(500, 50);
}"#,
        );
        assert!(
            !result.contains("public"),
            "public not stripped in nested class: {}",
            result
        );
        assert!(
            !result.contains("readonly"),
            "readonly not stripped in nested class: {}",
            result
        );
        assert!(
            result.contains("this.required = required;"),
            "missing this.required: {}",
            result
        );
        assert!(
            result.contains("this.available = available;"),
            "missing this.available: {}",
            result
        );
    }

    #[test]
    fn test_strip_constructor_overloads() {
        let result = strip(
            r#"export class RecordSchema extends Schema {
  _keySchema;
  _valueSchema;

  constructor(valueSchema: Schema);
  constructor(keySchema: Schema, valueSchema: Schema);
  constructor(keyOrValue: Schema, valueSchema?: Schema) {
    super();
    if (valueSchema !== undefined) {
      this._keySchema = keyOrValue;
      this._valueSchema = valueSchema;
    } else {
      this._valueSchema = keyOrValue;
    }
  }

  process(a: number): string;
  process(a: string): number;
  process(a: unknown) {
    return a;
  }
}"#,
        );
        // Overload signatures should be removed
        assert!(
            !result.contains("constructor(valueSchema)"),
            "constructor overload 1 not removed: {}",
            result
        );
        assert!(
            !result.contains("constructor(keySchema"),
            "constructor overload 2 not removed: {}",
            result
        );
        // Implementation should remain
        assert!(
            result.contains("constructor(keyOrValue"),
            "constructor impl removed: {}",
            result
        );
        // Method overload signatures should be removed
        assert!(
            result.matches("process(a)").count() == 1,
            "method overload not removed: {}",
            result
        );
    }

    #[test]
    fn test_strip_abstract_class() {
        let result = strip(
            r#"export abstract class EntityError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}"#,
        );
        assert!(
            !result.contains("abstract"),
            "abstract not stripped: {}",
            result
        );
        assert!(
            result.contains("class EntityError"),
            "class declaration missing: {}",
            result
        );
    }

    #[test]
    fn test_strip_readonly_class_fields() {
        let result = strip(
            r#"class Foo {
  readonly code = 'OK' as const;
  readonly name: string;
  private readonly secret: string;
}"#,
        );
        assert!(
            !result.contains("readonly"),
            "readonly not stripped: {}",
            result
        );
        assert!(
            !result.contains("private"),
            "private not stripped: {}",
            result
        );
        assert!(
            !result.contains("as const"),
            "as const not stripped: {}",
            result
        );
        assert!(
            result.contains("code = 'OK'"),
            "code field missing: {}",
            result
        );
    }

    #[test]
    fn test_strip_optional_class_fields() {
        let result = strip(
            r#"class Foo {
  readonly resource?: string;
  readonly retryAfter?: number;
}"#,
        );
        assert!(
            !result.contains("readonly"),
            "readonly not stripped: {}",
            result
        );
        assert!(
            !result.contains('?'),
            "optional marker not stripped: {}",
            result
        );
    }

    #[test]
    fn test_compile_string_enum() {
        let result = strip(
            r#"export enum ErrorCode {
  InvalidType = 'invalid_type',
  TooSmall = 'too_small',
  Custom = 'custom',
}"#,
        );
        assert!(
            !result.contains("enum "),
            "enum keyword survived: {}",
            result
        );
        assert!(
            result.contains("ErrorCode[\"InvalidType\"] = 'invalid_type'"),
            "string member missing: {}",
            result
        );
        assert!(
            result.contains("ErrorCode[\"Custom\"] = 'custom'"),
            "custom member missing: {}",
            result
        );
        // String enums should NOT have reverse mappings
        assert!(
            !result.contains("ErrorCode[ErrorCode["),
            "string enum should not have reverse mapping: {}",
            result
        );
    }

    #[test]
    fn test_compile_numeric_enum() {
        let result = strip(
            r#"enum Direction {
  Up,
  Down,
  Left = 10,
  Right,
}"#,
        );
        assert!(
            !result.contains("enum "),
            "enum keyword survived: {}",
            result
        );
        // Auto-increment: Up = 0, Down = 1
        assert!(
            result.contains("Direction[Direction[\"Up\"] = 0] = \"Up\""),
            "Up member missing: {}",
            result
        );
        assert!(
            result.contains("Direction[Direction[\"Down\"] = 1] = \"Down\""),
            "Down member missing: {}",
            result
        );
        // Explicit value: Left = 10
        assert!(
            result.contains("Direction[Direction[\"Left\"] = 10] = \"Left\""),
            "Left member missing: {}",
            result
        );
        // Auto-increment after explicit: Right = 11
        assert!(
            result.contains("Direction[Direction[\"Right\"] = 11] = \"Right\""),
            "Right member missing: {}",
            result
        );
    }

    #[test]
    fn test_compile_const_enum() {
        let result = strip(
            r#"const enum Status {
  Active = 'active',
  Inactive = 'inactive',
}"#,
        );
        assert!(
            !result.contains("enum "),
            "enum keyword survived: {}",
            result
        );
        assert!(
            result.contains("Status[\"Active\"] = 'active'"),
            "Active member missing: {}",
            result
        );
    }

    #[test]
    fn test_strip_abstract_property_and_method() {
        let result = strip(
            r#"export abstract class FormatSchema extends StringSchema {
  protected abstract _errorMessage: string;
  protected abstract _validate(value: string): boolean;
  _parse(value: unknown) {
    return value;
  }
}"#,
        );
        assert!(
            !result.contains("_errorMessage"),
            "abstract property not removed: {}",
            result
        );
        assert!(
            !result.contains("_validate"),
            "abstract method not removed: {}",
            result
        );
        // Non-abstract method should remain
        assert!(
            result.contains("_parse"),
            "non-abstract method removed: {}",
            result
        );
    }

    #[test]
    fn test_strip_entity_error_pattern() {
        // Reproduces the pattern from packages/errors/src/entity.ts
        let result = strip(
            r#"export abstract class EntityError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
  }
}

export class BadRequestError extends EntityError {
  readonly code = 'BadRequest' as const;
  constructor(message = 'Bad Request') {
    super('BadRequest', message);
    this.name = 'BadRequestError';
  }
}

export function isBadRequestError(error: unknown): error is BadRequestError {
  return error instanceof BadRequestError;
}

export type EntityErrorType =
  | BadRequestError;
"#,
        );
        assert!(
            !result.contains("abstract"),
            "abstract survived: {}",
            result
        );
        assert!(
            !result.contains("readonly"),
            "readonly survived: {}",
            result
        );
        assert!(
            !result.contains("as const"),
            "as const survived: {}",
            result
        );
        assert!(
            !result.contains(": error is"),
            "type predicate survived: {}",
            result
        );
        assert!(
            !result.contains("export type"),
            "type alias survived: {}",
            result
        );
        assert!(
            result.contains("class EntityError"),
            "class missing: {}",
            result
        );
        assert!(
            result.contains("class BadRequestError"),
            "subclass missing: {}",
            result
        );
    }

    #[test]
    fn test_strip_implements_clause() {
        let result =
            strip("export class PostgresDialect implements Dialect { name = 'postgres'; }");
        assert!(
            !result.contains("implements"),
            "implements survived: {}",
            result
        );
        assert!(
            !result.contains("implements Dialect"),
            "implements clause survived: {}",
            result
        );
        assert!(
            result.contains("class PostgresDialect"),
            "class name missing"
        );
        assert!(result.contains("name = 'postgres'"), "body missing");
        // Should only have class name + body, no implements
        assert!(result.contains("PostgresDialect"), "class name missing");
    }

    #[test]
    fn test_strip_implements_multiple() {
        let result = strip("class Foo extends Bar implements Baz, Qux { x = 1; }");
        assert!(
            !result.contains("implements"),
            "implements survived: {}",
            result
        );
        assert!(!result.contains("Baz"), "Baz survived: {}", result);
        assert!(!result.contains("Qux"), "Qux survived: {}", result);
        assert!(result.contains("extends Bar"), "extends missing");
        assert!(result.contains("x = 1"), "body missing");
    }

    #[test]
    fn test_strip_this_parameter() {
        let result = strip(
            r#"const obj = {
  code(this: { options: { meta?: string } }, node: { props: Record<string, unknown> }) {
    return this.options.meta;
  }
};"#,
        );
        assert!(!result.contains("this:"), "this param survived: {}", result);
        assert!(result.contains("node"), "node param missing");
        assert!(
            result.contains("this.options.meta"),
            "this usage should remain"
        );
    }

    #[test]
    fn test_strip_this_parameter_only_param() {
        let result = strip("function foo(this: SomeType) { return this; }");
        assert!(!result.contains("this:"), "this param survived: {}", result);
        assert!(!result.contains("SomeType"), "type survived: {}", result);
        assert!(
            result.contains("function foo("),
            "function signature missing"
        );
    }

    #[test]
    fn test_declare_global_is_stripped() {
        let result = strip(
            r#"declare global {
  interface Window {
    __VERTZ_SESSION__?: { user: string; expiresAt: number };
  }
}
export const x = 1;"#,
        );
        assert!(
            !result.contains("declare global"),
            "declare global survived: {}",
            result
        );
        assert!(
            !result.contains("interface Window"),
            "interface Window survived: {}",
            result
        );
        assert!(result.contains("export const x = 1;"));
    }

    #[test]
    fn test_schema_abstract_class_with_declare_and_abstract_members() {
        let result = strip(
            r#"export abstract class Schema<O, I = O> {
  /** @internal */ declare readonly _output: O;
  /** @internal */ declare readonly _input: I;
  /** @internal */ _id: string | undefined;

  constructor() {
    this._examples = [];
  }

  abstract _parse(value: unknown, ctx: ParseContext): O;
  abstract _schemaType(): SchemaType;
  abstract _toJSONSchema(tracker: RefTracker): JSONSchemaObject;
  abstract _clone(): Schema<O, I>;

  parse(value: unknown) {
    return value;
  }
}"#,
        );
        assert!(!result.contains("declare"), "declare survived: {}", result);
        assert!(
            !result.contains("abstract"),
            "abstract survived: {}",
            result
        );
        assert!(
            !result.contains("_output"),
            "declare prop survived: {}",
            result
        );
        assert!(
            !result.contains("_input"),
            "declare prop survived: {}",
            result
        );
    }
}
