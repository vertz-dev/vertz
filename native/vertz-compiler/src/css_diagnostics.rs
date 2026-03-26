use oxc_ast::ast::*;
use oxc_ast_visit::Visit;

use crate::css_token_tables;

/// Analyze css() calls for invalid shorthand tokens.
pub fn analyze_css(program: &Program, source: &str) -> Vec<crate::Diagnostic> {
    let mut finder = CssDiagnosticFinder {
        source,
        diagnostics: Vec::new(),
    };
    finder.visit_program(program);
    finder.diagnostics
}

struct CssDiagnosticFinder<'a> {
    source: &'a str,
    diagnostics: Vec<crate::Diagnostic>,
}

impl<'a, 'b> Visit<'b> for CssDiagnosticFinder<'a> {
    fn visit_call_expression(&mut self, call: &CallExpression<'b>) {
        if let Expression::Identifier(callee) = &call.callee {
            if callee.name.as_str() == "css" && !call.arguments.is_empty() {
                if let Some(Argument::ObjectExpression(obj)) = call.arguments.first() {
                    self.check_css_object(obj);
                }
            }
        }
        oxc_ast_visit::walk::walk_call_expression(self, call);
    }
}

impl<'a> CssDiagnosticFinder<'a> {
    fn check_css_object(&mut self, obj: &ObjectExpression) {
        for prop in &obj.properties {
            if let ObjectPropertyKind::ObjectProperty(p) = prop {
                if let Expression::ArrayExpression(arr) = &p.value {
                    for el in &arr.elements {
                        if let ArrayExpressionElement::StringLiteral(s) = el {
                            self.validate_shorthand(s.value.as_str(), s.span.start);
                        }
                    }
                }
            }
        }
    }

    fn validate_shorthand(&mut self, input: &str, span_start: u32) {
        let (line, column) = crate::utils::offset_to_line_column(self.source, span_start as usize);
        let parts: Vec<&str> = input.split(':').collect();

        if parts.is_empty() || (parts.len() == 1 && parts[0].is_empty()) {
            self.diagnostics.push(crate::Diagnostic {
                message: "[css-empty-shorthand] Empty shorthand string.".to_string(),
                line: Some(line),
                column: Some(column),
            });
            return;
        }

        if parts.len() > 3 {
            self.diagnostics.push(crate::Diagnostic {
                message: format!(
                    "[css-malformed-shorthand] Malformed shorthand '{}': too many segments. \
                     Expected 'property:value' or 'pseudo:property:value'.",
                    input
                ),
                line: Some(line),
                column: Some(column),
            });
            return;
        }

        let (pseudo, property, value) = match parts.len() {
            1 => (None, parts[0], None),
            2 => {
                if css_token_tables::is_pseudo_prefix(parts[0]) {
                    (Some(parts[0]), parts[1], None)
                } else {
                    (None, parts[0], Some(parts[1]))
                }
            }
            3 => (Some(parts[0]), parts[1], Some(parts[2])),
            _ => unreachable!(),
        };

        // Validate pseudo
        if let Some(pseudo) = pseudo {
            if !css_token_tables::is_pseudo_prefix(pseudo) {
                self.diagnostics.push(crate::Diagnostic {
                    message: format!("[css-unknown-pseudo] Unknown pseudo prefix '{pseudo}'.",),
                    line: Some(line),
                    column: Some(column),
                });
            }
        }

        // Validate property
        let property_known = css_token_tables::property_map(property).is_some()
            || css_token_tables::keyword_map(property).is_some();
        if !property_known {
            self.diagnostics.push(crate::Diagnostic {
                message: format!(
                    "[css-unknown-property] Unknown CSS shorthand property '{property}'.",
                ),
                line: Some(line),
                column: Some(column),
            });
        }

        // Validate spacing values
        if let Some(value) = value {
            if let Some((_, value_type)) = css_token_tables::property_map(property) {
                if value_type == "spacing" && css_token_tables::spacing_scale(value).is_none() {
                    self.diagnostics.push(crate::Diagnostic {
                        message: format!(
                            "[css-invalid-spacing] Invalid spacing value '{value}' for '{property}'. \
                             Use the spacing scale (0, 1, 2, 4, 8, etc.).",
                        ),
                        line: Some(line),
                        column: Some(column),
                    });
                }

                // Validate color tokens for color properties
                if (property == "bg" || property == "text" || property == "border")
                    && value_type == "color"
                {
                    self.validate_color_token(value, property, line, column);
                }
            }
        }
    }

    fn validate_color_token(&mut self, value: &str, property: &str, line: u32, column: u32) {
        if css_token_tables::is_css_color_keyword(value) {
            return;
        }

        if let Some(dot_idx) = value.find('.') {
            let namespace = &value[..dot_idx];
            if !css_token_tables::is_color_namespace(namespace) {
                self.diagnostics.push(crate::Diagnostic {
                    message: format!(
                        "[css-unknown-color-token] Unknown color token namespace '{namespace}' \
                         in '{property}:{value}'.",
                    ),
                    line: Some(line),
                    column: Some(column),
                });
            }
            return;
        }

        if !css_token_tables::is_color_namespace(value) {
            self.diagnostics.push(crate::Diagnostic {
                message: format!(
                    "[css-unknown-color-token] Unknown color token '{value}' for '{property}'. \
                     Use a design token (e.g. 'primary', 'background') or shade notation \
                     (e.g. 'primary.700').",
                ),
                line: Some(line),
                column: Some(column),
            });
        }
    }
}
