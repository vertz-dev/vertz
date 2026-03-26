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
