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

#[cfg(test)]
mod tests {
    use super::*;
    use oxc_allocator::Allocator;
    use oxc_parser::Parser;
    use oxc_span::SourceType;

    fn diagnose(source: &str) -> Vec<crate::Diagnostic> {
        let allocator = Allocator::default();
        let source_type = SourceType::tsx();
        let parser = Parser::new(&allocator, source, source_type);
        let parsed = parser.parse();
        analyze_css(&parsed.program, source)
    }

    // ── No diagnostics cases ─────────────────────────────────────

    #[test]
    fn no_css_calls_returns_empty() {
        assert!(diagnose("const x = 1;").is_empty());
    }

    #[test]
    fn non_css_function_ignored() {
        let d = diagnose("notcss({ root: ['unknown'] });");
        assert!(d.is_empty());
    }

    #[test]
    fn css_with_no_arguments_ignored() {
        let d = diagnose("css();");
        assert!(d.is_empty());
    }

    #[test]
    fn css_with_non_object_argument_ignored() {
        let d = diagnose("css('string');");
        assert!(d.is_empty());
    }

    #[test]
    fn valid_keyword_no_diagnostic() {
        let d = diagnose("css({ root: ['flex'] });");
        assert!(d.is_empty(), "flex should be valid: {:?}", d);
    }

    #[test]
    fn valid_property_value_no_diagnostic() {
        let d = diagnose("css({ root: ['p:4'] });");
        assert!(d.is_empty(), "p:4 should be valid: {:?}", d);
    }

    #[test]
    fn valid_pseudo_keyword_no_diagnostic() {
        let d = diagnose("css({ root: ['hover:flex'] });");
        assert!(d.is_empty(), "hover:flex should be valid: {:?}", d);
    }

    #[test]
    fn valid_pseudo_property_value_no_diagnostic() {
        let d = diagnose("css({ root: ['hover:bg:primary'] });");
        assert!(d.is_empty(), "hover:bg:primary should be valid: {:?}", d);
    }

    #[test]
    fn valid_color_namespace_no_diagnostic() {
        let d = diagnose("css({ root: ['bg:primary'] });");
        assert!(d.is_empty(), "bg:primary should be valid: {:?}", d);
    }

    #[test]
    fn valid_color_with_shade_no_diagnostic() {
        let d = diagnose("css({ root: ['bg:primary.700'] });");
        assert!(d.is_empty(), "bg:primary.700 should be valid: {:?}", d);
    }

    #[test]
    fn css_color_keyword_no_diagnostic() {
        let d = diagnose("css({ root: ['bg:transparent'] });");
        assert!(d.is_empty(), "transparent should be valid: {:?}", d);
    }

    #[test]
    fn css_color_keyword_inherit_no_diagnostic() {
        let d = diagnose("css({ root: ['text:inherit'] });");
        assert!(d.is_empty(), "inherit should be valid: {:?}", d);
    }

    // ── check_css_object: non-array value skipped ────────────────

    #[test]
    fn non_array_value_in_css_object_skipped() {
        let d = diagnose("css({ root: 'not-an-array' });");
        assert!(d.is_empty());
    }

    #[test]
    fn spread_property_in_css_object_skipped() {
        let d = diagnose("const base = {}; css({ ...base });");
        assert!(d.is_empty());
    }

    #[test]
    fn non_string_elements_in_array_skipped() {
        // Number literal in array — not a StringLiteral, so not validated
        let d = diagnose("css({ root: [42] });");
        assert!(d.is_empty());
    }

    // ── Empty shorthand ──────────────────────────────────────────

    #[test]
    fn empty_shorthand_produces_diagnostic() {
        let d = diagnose("css({ root: [''] });");
        assert_eq!(d.len(), 1);
        assert!(
            d[0].message.contains("css-empty-shorthand"),
            "msg: {}",
            d[0].message
        );
    }

    // ── Malformed shorthand (>3 segments) ────────────────────────

    #[test]
    fn too_many_segments_produces_diagnostic() {
        let d = diagnose("css({ root: ['a:b:c:d'] });");
        assert_eq!(d.len(), 1);
        assert!(
            d[0].message.contains("css-malformed-shorthand"),
            "msg: {}",
            d[0].message
        );
    }

    // ── Unknown property ─────────────────────────────────────────

    #[test]
    fn unknown_property_keyword_produces_diagnostic() {
        let d = diagnose("css({ root: ['unknownprop'] });");
        assert_eq!(d.len(), 1);
        assert!(
            d[0].message.contains("css-unknown-property"),
            "msg: {}",
            d[0].message
        );
    }

    #[test]
    fn unknown_property_with_value_produces_diagnostic() {
        let d = diagnose("css({ root: ['foo:bar'] });");
        assert_eq!(d.len(), 1);
        assert!(
            d[0].message.contains("css-unknown-property"),
            "msg: {}",
            d[0].message
        );
    }

    // ── Unknown pseudo ───────────────────────────────────────────

    #[test]
    fn unknown_pseudo_in_3_part_produces_diagnostic() {
        let d = diagnose("css({ root: ['xyz:bg:primary'] });");
        assert_eq!(d.len(), 1);
        assert!(
            d[0].message.contains("css-unknown-pseudo"),
            "msg: {}",
            d[0].message
        );
    }

    // ── Invalid spacing ──────────────────────────────────────────

    #[test]
    fn invalid_spacing_value_produces_diagnostic() {
        let d = diagnose("css({ root: ['p:999'] });");
        assert_eq!(d.len(), 1);
        assert!(
            d[0].message.contains("css-invalid-spacing"),
            "msg: {}",
            d[0].message
        );
    }

    // ── Unknown color token ──────────────────────────────────────

    #[test]
    fn unknown_color_token_produces_diagnostic() {
        let d = diagnose("css({ root: ['bg:xyz'] });");
        assert_eq!(d.len(), 1);
        assert!(
            d[0].message.contains("css-unknown-color-token"),
            "msg: {}",
            d[0].message
        );
        assert!(d[0].message.contains("'xyz'"), "msg: {}", d[0].message);
    }

    #[test]
    fn unknown_color_namespace_with_shade_produces_diagnostic() {
        let d = diagnose("css({ root: ['bg:unknown.700'] });");
        assert_eq!(d.len(), 1);
        assert!(
            d[0].message.contains("css-unknown-color-token"),
            "msg: {}",
            d[0].message
        );
        assert!(
            d[0].message.contains("namespace 'unknown'"),
            "msg: {}",
            d[0].message
        );
    }

    #[test]
    fn text_color_unknown_token_produces_diagnostic() {
        let d = diagnose("css({ root: ['text:badcolor'] });");
        assert_eq!(d.len(), 1);
        assert!(
            d[0].message.contains("css-unknown-color-token"),
            "msg: {}",
            d[0].message
        );
    }

    #[test]
    fn border_color_unknown_token_produces_diagnostic() {
        let d = diagnose("css({ root: ['border:badcolor'] });");
        assert_eq!(d.len(), 1);
        assert!(
            d[0].message.contains("css-unknown-color-token"),
            "msg: {}",
            d[0].message
        );
    }

    // ── Multiple diagnostics in one call ─────────────────────────

    #[test]
    fn multiple_invalid_entries_produce_multiple_diagnostics() {
        let d = diagnose("css({ root: ['unknownprop', 'p:999', 'bg:xyz'] });");
        assert_eq!(d.len(), 3, "expected 3 diagnostics: {:?}", d);
    }

    // ── Line and column reported ─────────────────────────────────

    #[test]
    fn diagnostic_has_line_and_column() {
        let d = diagnose("css({ root: ['unknownprop'] });");
        assert_eq!(d.len(), 1);
        assert!(d[0].line.is_some());
        assert!(d[0].column.is_some());
    }

    // ── Nested css() calls are also checked ──────────────────────

    #[test]
    fn nested_css_call_is_checked() {
        let d = diagnose("const x = () => css({ root: ['unknownprop'] });");
        assert_eq!(d.len(), 1);
        assert!(d[0].message.contains("css-unknown-property"));
    }

    // ── Method-style callee ignored (obj.css) ────────────────────

    #[test]
    fn method_callee_ignored() {
        let d = diagnose("obj.css({ root: ['unknownprop'] });");
        assert!(d.is_empty());
    }

    // ── 2-part with pseudo prefix + unknown keyword ──────────────

    #[test]
    fn pseudo_prefix_with_unknown_keyword() {
        let d = diagnose("css({ root: ['hover:unknownkw'] });");
        assert_eq!(d.len(), 1);
        assert!(d[0].message.contains("css-unknown-property"));
    }

    // ── 3-part with unknown pseudo AND unknown property ──────────

    #[test]
    fn unknown_pseudo_and_unknown_property() {
        let d = diagnose("css({ root: ['xyz:foo:bar'] });");
        assert_eq!(d.len(), 2, "expect pseudo + property diagnostics: {:?}", d);
    }

    // ── Property known via property_map but not keyword_map ──────

    #[test]
    fn property_map_property_is_known() {
        let d = diagnose("css({ root: ['bg:primary'] });");
        assert!(d.is_empty(), "bg should be known via property_map: {:?}", d);
    }

    // ── Property known via keyword_map only ──────────────────────

    #[test]
    fn keyword_map_property_is_known() {
        let d = diagnose("css({ root: ['grid'] });");
        assert!(
            d.is_empty(),
            "grid should be known via keyword_map: {:?}",
            d
        );
    }
}
