use oxc_ast::ast::{
    BindingPattern, Declaration, Expression, Program, Statement, VariableDeclaration,
};
use oxc_span::GetSpan;

use crate::magic_string::MagicString;

/// Inject stable IDs into `createContext()` calls for HMR support.
///
/// Detects `const X = createContext(...)` patterns at module level and injects
/// a `__stableId` argument so the context registry survives bundle re-evaluation.
/// The ID format is `filePath::varName`.
pub fn inject_context_stable_ids(ms: &mut MagicString, program: &Program, rel_file_path: &str) {
    for stmt in &program.body {
        // Unwrap export declarations to get the inner variable declaration
        let var_decl: &VariableDeclaration = match stmt {
            Statement::VariableDeclaration(vd) => vd,
            Statement::ExportNamedDeclaration(export) => {
                if let Some(Declaration::VariableDeclaration(vd)) = &export.declaration {
                    vd
                } else {
                    continue;
                }
            }
            _ => continue,
        };

        for declarator in &var_decl.declarations {
            // Must have an initializer that is a call expression
            let Some(init) = &declarator.init else {
                continue;
            };
            let Expression::CallExpression(call_expr) = init else {
                continue;
            };

            // Callee must be `createContext`
            let Expression::Identifier(callee) = &call_expr.callee else {
                continue;
            };
            if callee.name.as_str() != "createContext" {
                continue;
            }

            // Binding must be a simple identifier
            let BindingPattern::BindingIdentifier(binding) = &declarator.id else {
                continue;
            };

            let var_name = binding.name.as_str();
            let escaped_path = rel_file_path.replace('\\', "\\\\").replace('\'', "\\'");
            let stable_id = format!("{escaped_path}::{var_name}");

            let args = &call_expr.arguments;
            if args.is_empty() {
                // createContext<T>() → createContext<T>(undefined, 'id')
                let close_paren = call_expr.span.end - 1;
                ms.prepend_left(close_paren, &format!("undefined, '{stable_id}'"));
            } else {
                // createContext<T>(defaultValue) → createContext<T>(defaultValue, 'id')
                let last_arg = &args[args.len() - 1];
                let last_arg_end = last_arg.span().end;
                ms.append_right(last_arg_end, &format!(", '{stable_id}'"));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::magic_string::MagicString;
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    fn transform(source: &str, path: &str) -> String {
        let allocator = Allocator::default();
        let parsed = Parser::new(&allocator, source, SourceType::tsx()).parse();
        let mut ms = MagicString::new(source);
        inject_context_stable_ids(&mut ms, &parsed.program, path);
        ms.to_string()
    }

    #[test]
    fn bare_const_no_args() {
        let result = transform("const Ctx = createContext();", "test.tsx");
        assert_eq!(
            result,
            "const Ctx = createContext(undefined, 'test.tsx::Ctx');"
        );
    }

    #[test]
    fn bare_const_with_default_value() {
        let result = transform("const Ctx = createContext(0);", "test.tsx");
        assert_eq!(result, "const Ctx = createContext(0, 'test.tsx::Ctx');");
    }

    #[test]
    fn export_named_no_args() {
        let result = transform("export const Ctx = createContext();", "test.tsx");
        assert_eq!(
            result,
            "export const Ctx = createContext(undefined, 'test.tsx::Ctx');"
        );
    }

    #[test]
    fn export_named_with_default_value() {
        let result = transform("export const Ctx = createContext(\"hello\");", "test.tsx");
        assert_eq!(
            result,
            "export const Ctx = createContext(\"hello\", 'test.tsx::Ctx');"
        );
    }

    #[test]
    fn skips_function_declaration() {
        let source = "function foo() {}";
        assert_eq!(transform(source, "test.tsx"), source);
    }

    #[test]
    fn skips_non_call_init() {
        let source = "const Ctx = someValue;";
        assert_eq!(transform(source, "test.tsx"), source);
    }

    #[test]
    fn skips_non_create_context_callee() {
        let source = "const Ctx = otherFunc();";
        assert_eq!(transform(source, "test.tsx"), source);
    }

    #[test]
    fn skips_array_pattern_binding() {
        let source = "const [a] = createContext();";
        assert_eq!(transform(source, "test.tsx"), source);
    }

    #[test]
    fn backslash_in_path_escaped() {
        let result = transform("const Ctx = createContext();", "src\\ctx.tsx");
        assert_eq!(
            result,
            "const Ctx = createContext(undefined, 'src\\\\ctx.tsx::Ctx');"
        );
    }

    #[test]
    fn single_quote_in_path_escaped() {
        let result = transform("const Ctx = createContext();", "it's/ctx.tsx");
        assert_eq!(
            result,
            "const Ctx = createContext(undefined, 'it\\'s/ctx.tsx::Ctx');"
        );
    }

    #[test]
    fn export_named_function_skipped() {
        let source = "export function foo() {}";
        assert_eq!(transform(source, "test.tsx"), source);
    }

    #[test]
    fn multiple_contexts_in_one_file() {
        let source = "const A = createContext();\nconst B = createContext(42);";
        let result = transform(source, "test.tsx");
        assert_eq!(
            result,
            "const A = createContext(undefined, 'test.tsx::A');\nconst B = createContext(42, 'test.tsx::B');"
        );
    }

    #[test]
    fn no_init_skipped() {
        let source = "let Ctx;\nconst Other = createContext();";
        let result = transform(source, "test.tsx");
        assert_eq!(
            result,
            "let Ctx;\nconst Other = createContext(undefined, 'test.tsx::Other');"
        );
    }
}
