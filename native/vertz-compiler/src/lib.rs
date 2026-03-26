mod body_jsx_diagnostics;
mod component_analyzer;
mod computed_transformer;
mod context_stable_ids;
mod css_diagnostics;
mod css_token_tables;
mod css_transform;
mod fast_refresh;
mod import_injection;
mod jsx_transformer;
mod magic_string;
mod mount_frame_transformer;
mod mutation_analyzer;
mod mutation_diagnostics;
mod mutation_transformer;
mod props_transformer;
mod reactivity_analyzer;
mod signal_api_registry;
mod signal_transformer;
mod ssr_safety_diagnostics;
mod utils;

use napi_derive::napi;
use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_parser::Parser;
use oxc_span::SourceType;

#[napi(object)]
pub struct Diagnostic {
    pub message: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
}

#[napi(object)]
pub struct NapiVariableInfo {
    pub name: String,
    pub kind: String,
    pub start: u32,
    pub end: u32,
    pub signal_properties: Option<Vec<String>>,
    pub plain_properties: Option<Vec<String>>,
    pub field_signal_properties: Option<Vec<String>>,
    pub is_reactive_source: Option<bool>,
}

#[napi(object)]
pub struct NapiComponentInfo {
    pub name: String,
    pub body_start: u32,
    pub body_end: u32,
    pub variables: Option<Vec<NapiVariableInfo>>,
}

#[napi(object)]
pub struct CompileResult {
    pub code: String,
    pub css: Option<String>,
    pub map: Option<String>,
    pub diagnostics: Option<Vec<Diagnostic>>,
    pub components: Option<Vec<NapiComponentInfo>>,
}

#[napi(object)]
pub struct CompileOptions {
    pub filename: Option<String>,
    pub fast_refresh: Option<bool>,
    pub target: Option<String>,
}

#[napi]
pub fn compile(source: String, options: Option<CompileOptions>) -> CompileResult {
    let filename = options
        .as_ref()
        .and_then(|o| o.filename.as_deref())
        .unwrap_or("input.ts");

    let fast_refresh = options
        .as_ref()
        .and_then(|o| o.fast_refresh)
        .unwrap_or(false);

    let target = options
        .as_ref()
        .and_then(|o| o.target.as_deref())
        .unwrap_or("dom");

    let source_type = SourceType::from_path(filename).unwrap_or_default();
    let allocator = Allocator::default();

    let parser_ret = Parser::new(&allocator, &source, source_type).parse();

    // Collect parser errors as diagnostics
    if !parser_ret.errors.is_empty() {
        let diagnostics: Vec<Diagnostic> = parser_ret
            .errors
            .iter()
            .map(|err| {
                let (line, column) = err
                    .labels
                    .as_ref()
                    .and_then(|labels| labels.first())
                    .map(|label| {
                        let offset = label.offset();
                        utils::offset_to_line_column(&source, offset)
                    })
                    .unwrap_or((1, 1));

                Diagnostic {
                    message: err.message.to_string(),
                    line: Some(line),
                    column: Some(column),
                }
            })
            .collect();

        return CompileResult {
            code: format!("// compiled by vertz-native\n{source}"),
            css: None,
            map: None,
            diagnostics: Some(diagnostics),
            components: None,
        };
    }

    // Run component analysis
    let components = component_analyzer::analyze_components(&parser_ret.program);

    // Build import aliases for signal API detection
    let import_aliases = reactivity_analyzer::build_import_aliases(&parser_ret.program);

    // Run reactivity analysis and transforms per component
    let mut ms = magic_string::MagicString::new(&source);
    let mut all_diagnostics: Vec<Diagnostic> = Vec::new();

    let napi_components: Vec<NapiComponentInfo> = components
        .iter()
        .map(|comp| {
            // Props destructuring must run BEFORE reactivity analysis
            props_transformer::transform_props(&mut ms, &parser_ret.program, comp, &source);

            let variables =
                reactivity_analyzer::analyze_reactivity(&parser_ret.program, comp, &import_aliases);

            // Run per-component diagnostics BEFORE transforms (on original AST positions)
            all_diagnostics.extend(ssr_safety_diagnostics::analyze_ssr_safety(
                &parser_ret.program,
                comp,
                &source,
            ));
            all_diagnostics.extend(mutation_diagnostics::analyze_mutation_diagnostics(
                &parser_ret.program,
                comp,
                &variables,
                &source,
            ));
            all_diagnostics.extend(body_jsx_diagnostics::analyze_body_jsx(
                &parser_ret.program,
                comp,
                &source,
            ));

            // Analyze mutations before transforms
            let mutations =
                mutation_analyzer::analyze_mutations(&parser_ret.program, comp, &variables);
            let mutation_ranges: Vec<(u32, u32)> =
                mutations.iter().map(|m| (m.start, m.end)).collect();

            // Apply transforms: mutations first, then signals, then computeds
            mutation_transformer::transform_mutations(&mut ms, &mutations);
            signal_transformer::transform_signals(
                &mut ms,
                &parser_ret.program,
                comp,
                &variables,
                &mutation_ranges,
            );
            computed_transformer::transform_computeds(
                &mut ms,
                &parser_ret.program,
                comp,
                &variables,
            );

            // JSX transform runs AFTER signal/computed transforms so that
            // MagicString already has .value insertions when we read expression text.
            jsx_transformer::transform_jsx(&mut ms, &parser_ret.program, comp, &variables);

            // Mount frame wrapping runs AFTER all other transforms
            // Check if this is an arrow expression body first
            if comp.is_arrow_expression {
                mount_frame_transformer::transform_arrow_expression_body(
                    &mut ms,
                    &parser_ret.program,
                    comp,
                );
            } else {
                mount_frame_transformer::transform_mount_frame(
                    &mut ms,
                    &parser_ret.program,
                    comp,
                    &source,
                );
            }

            NapiComponentInfo {
                name: comp.name.clone(),
                body_start: comp.body_start,
                body_end: comp.body_end,
                variables: Some(
                    variables
                        .into_iter()
                        .map(|v| NapiVariableInfo {
                            name: v.name,
                            kind: v.kind.as_str().to_string(),
                            start: v.start,
                            end: v.end,
                            signal_properties: v.signal_properties,
                            plain_properties: v.plain_properties,
                            field_signal_properties: v.field_signal_properties,
                            is_reactive_source: if v.is_reactive_source {
                                Some(true)
                            } else {
                                None
                            },
                        })
                        .collect(),
                ),
            }
        })
        .collect();

    // Module-level CSS diagnostics
    all_diagnostics.extend(css_diagnostics::analyze_css(&parser_ret.program, &source));

    // Context stable ID injection (module-level, only in dev/fastRefresh mode)
    if fast_refresh {
        context_stable_ids::inject_context_stable_ids(&mut ms, &parser_ret.program, filename);
    }

    // CSS transform (module-level)
    let extracted_css = css_transform::transform_css(&mut ms, &parser_ret.program, filename);

    // Fast refresh codegen (module-level, only in dev/fastRefresh mode)
    if fast_refresh {
        fast_refresh::inject_fast_refresh(&mut ms, &napi_components, &source, filename);
    }

    // Import injection (must run AFTER all transforms that emit helper calls)
    import_injection::inject_imports(&mut ms, target);

    let transformed_code = ms.to_string();

    // Generate source map using oxc codegen (from original AST)
    let codegen_options = CodegenOptions {
        source_map_path: Some(std::path::PathBuf::from(filename)),
        ..CodegenOptions::default()
    };

    let codegen_ret = Codegen::new()
        .with_options(codegen_options)
        .build(&parser_ret.program);

    let map = codegen_ret
        .map
        .map(|source_map| source_map.to_json_string());

    CompileResult {
        code: format!("// compiled by vertz-native\n{transformed_code}"),
        css: if extracted_css.is_empty() {
            None
        } else {
            Some(extracted_css)
        },
        map,
        diagnostics: if all_diagnostics.is_empty() {
            None
        } else {
            Some(all_diagnostics)
        },
        components: Some(napi_components),
    }
}
