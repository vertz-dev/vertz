// vertz-compiler-core: Pure Rust compilation library (no NAPI dependencies).
// This crate contains all compilation logic and can be used by both the NAPI
// binding (for JS/Bun) and the Vertz runtime (pure Rust).

pub mod aot_string_transformer;
pub mod body_jsx_diagnostics;
pub mod component_analyzer;
pub mod computed_transformer;
pub mod context_stable_ids;
pub mod css_diagnostics;
pub mod css_token_tables;
pub mod css_transform;
pub mod fast_refresh;
pub mod field_selection;
pub mod hydration_markers;
pub mod import_injection;
pub mod jsx_transformer;
pub mod magic_string;
pub mod mount_frame_transformer;
pub mod mutation_analyzer;
pub mod mutation_diagnostics;
pub mod mutation_transformer;
pub mod prefetch_manifest;
pub mod props_transformer;
pub mod query_auto_thunk;
pub mod reactivity_analyzer;
pub mod route_splitting;
pub mod signal_api_registry;
pub mod signal_transformer;
pub mod ssr_safety_diagnostics;
pub mod typescript_strip;
pub mod utils;

use oxc_allocator::Allocator;
use oxc_codegen::{Codegen, CodegenOptions};
use oxc_parser::Parser;
use oxc_span::SourceType;

// ─── Plain Rust output types (no NAPI annotations) ─────────────────────

/// A diagnostic message produced during compilation.
#[derive(Debug, Clone)]
pub struct Diagnostic {
    pub message: String,
    pub line: Option<u32>,
    pub column: Option<u32>,
}

/// Variable reactivity information in the compile output.
#[derive(Debug, Clone)]
pub struct VariableInfoOutput {
    pub name: String,
    pub kind: String,
    pub start: u32,
    pub end: u32,
    pub signal_properties: Option<Vec<String>>,
    pub plain_properties: Option<Vec<String>>,
    pub field_signal_properties: Option<Vec<String>>,
    pub is_reactive_source: Option<bool>,
}

/// Component information in the compile output.
#[derive(Debug, Clone)]
pub struct ComponentInfoOutput {
    pub name: String,
    pub body_start: u32,
    pub body_end: u32,
    pub variables: Option<Vec<VariableInfoOutput>>,
}

/// Nested field access for relation fields in the compile output.
#[derive(Debug, Clone)]
pub struct NestedFieldAccessOutput {
    pub field: String,
    pub nested_path: Vec<String>,
}

/// Field selection information in the compile output.
#[derive(Debug, Clone)]
pub struct FieldSelectionOutput {
    pub query_var: String,
    pub injection_pos: u32,
    pub injection_kind: String,
    pub fields: Vec<String>,
    pub has_opaque_access: bool,
    pub nested_access: Vec<NestedFieldAccessOutput>,
    pub inferred_entity_name: Option<String>,
}

/// An extracted route in the compile output.
#[derive(Debug, Clone)]
pub struct ExtractedRouteOutput {
    pub pattern: String,
    pub component_name: String,
    pub route_type: String,
}

/// An extracted query in the compile output.
#[derive(Debug, Clone)]
pub struct ExtractedQueryOutput {
    pub descriptor_chain: String,
    pub entity: Option<String>,
    pub operation: Option<String>,
    pub id_param: Option<String>,
}

/// Result of compilation.
#[derive(Debug, Clone)]
pub struct CompileResult {
    pub code: String,
    pub css: Option<String>,
    pub map: Option<String>,
    pub diagnostics: Option<Vec<Diagnostic>>,
    pub components: Option<Vec<ComponentInfoOutput>>,
    pub hydration_ids: Option<Vec<String>>,
    pub field_selections: Option<Vec<FieldSelectionOutput>>,
    pub extracted_routes: Option<Vec<ExtractedRouteOutput>>,
    pub extracted_queries: Option<Vec<ExtractedQueryOutput>>,
    pub route_params: Option<Vec<String>>,
}

/// A manifest entry describing cross-file reactivity metadata.
#[derive(Debug, Clone)]
pub struct ManifestEntry {
    pub module_specifier: String,
    pub export_name: String,
    pub reactivity_type: String,
    pub signal_properties: Option<Vec<String>>,
    pub plain_properties: Option<Vec<String>>,
    pub field_signal_properties: Option<Vec<String>>,
}

/// Options for the compile function.
#[derive(Debug, Clone, Default)]
pub struct CompileOptions {
    pub filename: Option<String>,
    pub fast_refresh: Option<bool>,
    pub target: Option<String>,
    pub manifests: Option<Vec<ManifestEntry>>,
    pub hydration_markers: Option<bool>,
    pub route_splitting: Option<bool>,
    pub field_selection: Option<bool>,
    pub prefetch_manifest: Option<bool>,
}

/// Per-component AOT compilation result in the output.
#[derive(Debug, Clone)]
pub struct AotComponentInfoOutput {
    pub name: String,
    pub tier: String,
    pub holes: Vec<String>,
    pub query_keys: Vec<String>,
}

/// Result of AOT SSR compilation.
#[derive(Debug, Clone)]
pub struct AotCompileResult {
    pub code: String,
    pub components: Vec<AotComponentInfoOutput>,
}

/// Options for AOT SSR compilation.
#[derive(Debug, Clone, Default)]
pub struct AotCompileOptions {
    pub filename: Option<String>,
}

// ─── Public compile functions ───────────────────────────────────────────

/// Compile source code with the Vertz compiler.
///
/// This is the main entry point for compilation. It takes source code and
/// options, runs all analysis and transformation passes, and returns the
/// compiled output.
pub fn compile(source: &str, options: CompileOptions) -> CompileResult {
    let filename = options.filename.as_deref().unwrap_or("input.ts");
    let fast_refresh_enabled = options.fast_refresh.unwrap_or(false);
    let target = options.target.as_deref().unwrap_or("dom");
    let enable_hydration_markers = options.hydration_markers.unwrap_or(false);
    let enable_route_splitting = options.route_splitting.unwrap_or(false);
    let enable_field_selection = options.field_selection.unwrap_or(false);
    let enable_prefetch_manifest = options.prefetch_manifest.unwrap_or(false);

    let source_type = SourceType::from_path(filename).unwrap_or_default();
    let allocator = Allocator::default();

    let parser_ret = Parser::new(&allocator, source, source_type).parse();

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
                        utils::offset_to_line_column(source, offset)
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
            hydration_ids: None,
            field_selections: None,
            extracted_routes: None,
            extracted_queries: None,
            route_params: None,
        };
    }

    // Run component analysis
    let components = component_analyzer::analyze_components(&parser_ret.program);

    // Build manifest registry from options
    let manifest_registry = build_manifest_registry(&options);

    // Build import aliases for signal API detection (includes manifest-derived entries)
    let (import_aliases, dynamic_configs) =
        reactivity_analyzer::build_import_aliases(&parser_ret.program, &manifest_registry);

    let import_ctx = reactivity_analyzer::ImportContext {
        aliases: import_aliases,
        dynamic_configs,
    };

    // Build query aliases for auto-thunk transform
    let query_aliases = reactivity_analyzer::build_query_aliases(&parser_ret.program);

    // Run reactivity analysis and transforms per component
    let mut ms = magic_string::MagicString::new(source);
    let mut all_diagnostics: Vec<Diagnostic> = Vec::new();

    // Strip TypeScript syntax first (interfaces, type aliases, as casts, type annotations, etc.)
    // Must run before JSX transform so that get_transformed_slice() returns clean JavaScript.
    typescript_strip::strip_typescript_syntax(&mut ms, &parser_ret.program, source);

    // Route code splitting -- convert static imports in defineRoutes to dynamic imports.
    // Must run before component transforms (it rewrites module-level import/export statements).
    if enable_route_splitting {
        route_splitting::transform_route_splitting(&mut ms, &parser_ret.program, source);
    }

    // Field selection analysis -- extract field access patterns from query() calls.
    let field_selections = if enable_field_selection {
        field_selection::analyze_field_selection(&parser_ret.program, source)
    } else {
        Vec::new()
    };

    // Prefetch manifest analysis -- extract routes and queries for SSR prefetching.
    let prefetch_analysis = if enable_prefetch_manifest {
        Some(prefetch_manifest::analyze_prefetch(
            &parser_ret.program,
            source,
        ))
    } else {
        None
    };

    // Hydration markers -- determine which components are interactive.
    // The JSX transformer will inject data-v-id setAttribute calls for these.
    let hydration_ids = if enable_hydration_markers {
        hydration_markers::find_interactive_components(&parser_ret.program, &components)
    } else {
        Vec::new()
    };
    let hydration_set: std::collections::HashSet<String> = hydration_ids.iter().cloned().collect();

    let output_components: Vec<ComponentInfoOutput> = components
        .iter()
        .map(|comp| {
            // Props destructuring must run BEFORE reactivity analysis
            props_transformer::transform_props(&mut ms, &parser_ret.program, comp, source);

            let variables =
                reactivity_analyzer::analyze_reactivity(&parser_ret.program, comp, &import_ctx);

            // Run per-component diagnostics BEFORE transforms (on original AST positions)
            all_diagnostics.extend(
                ssr_safety_diagnostics::analyze_ssr_safety(&parser_ret.program, comp, source)
                    .into_iter()
                    .map(|d| Diagnostic {
                        message: d.message,
                        line: d.line,
                        column: d.column,
                    }),
            );
            all_diagnostics.extend(
                mutation_diagnostics::analyze_mutation_diagnostics(
                    &parser_ret.program,
                    comp,
                    &variables,
                    source,
                )
                .into_iter()
                .map(|d| Diagnostic {
                    message: d.message,
                    line: d.line,
                    column: d.column,
                }),
            );
            all_diagnostics.extend(
                body_jsx_diagnostics::analyze_body_jsx(&parser_ret.program, comp, source)
                    .into_iter()
                    .map(|d| Diagnostic {
                        message: d.message,
                        line: d.line,
                        column: d.column,
                    }),
            );

            // Analyze mutations before transforms
            let mutations =
                mutation_analyzer::analyze_mutations(&parser_ret.program, comp, &variables);
            let mutation_ranges: Vec<(u32, u32)> =
                mutations.iter().map(|m| (m.start, m.end)).collect();

            // Apply transforms: mutations first, then query auto-thunk, then signals, then computeds
            mutation_transformer::transform_mutations(&mut ms, &mutations);

            // Query auto-thunk must run BEFORE signal transform so that
            // .value reads happen inside the generated thunk
            query_auto_thunk::transform_query_auto_thunk(
                &mut ms,
                &parser_ret.program,
                comp,
                &variables,
                &query_aliases,
            );

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
            let hydration_id = if hydration_set.contains(&comp.name) {
                Some(comp.name.as_str())
            } else {
                None
            };
            jsx_transformer::transform_jsx(
                &mut ms,
                &parser_ret.program,
                comp,
                &variables,
                hydration_id,
            );

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
                    source,
                );
            }

            ComponentInfoOutput {
                name: comp.name.clone(),
                body_start: comp.body_start,
                body_end: comp.body_end,
                variables: Some(
                    variables
                        .into_iter()
                        .map(|v| VariableInfoOutput {
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
    all_diagnostics.extend(
        css_diagnostics::analyze_css(&parser_ret.program, source)
            .into_iter()
            .map(|d| Diagnostic {
                message: d.message,
                line: d.line,
                column: d.column,
            }),
    );

    // Context stable ID injection (module-level, only in dev/fastRefresh mode)
    if fast_refresh_enabled {
        context_stable_ids::inject_context_stable_ids(&mut ms, &parser_ret.program, filename);
    }

    // CSS transform (module-level)
    let extracted_css = css_transform::transform_css(&mut ms, &parser_ret.program, filename);

    // Fast refresh codegen (module-level, only in dev/fastRefresh mode)
    if fast_refresh_enabled {
        fast_refresh::inject_fast_refresh(&mut ms, &output_components, source, filename);
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
        components: Some(output_components),
        hydration_ids: if hydration_ids.is_empty() {
            None
        } else {
            Some(hydration_ids)
        },
        field_selections: if field_selections.is_empty() {
            None
        } else {
            Some(
                field_selections
                    .into_iter()
                    .map(|fs| FieldSelectionOutput {
                        query_var: fs.query_var,
                        injection_pos: fs.injection_pos,
                        injection_kind: fs.injection_kind.as_str().to_string(),
                        fields: fs.fields,
                        has_opaque_access: fs.has_opaque_access,
                        nested_access: fs
                            .nested_access
                            .into_iter()
                            .map(|n| NestedFieldAccessOutput {
                                field: n.field,
                                nested_path: n.nested_path,
                            })
                            .collect(),
                        inferred_entity_name: fs.inferred_entity_name,
                    })
                    .collect(),
            )
        },
        extracted_routes: prefetch_analysis.as_ref().and_then(|pa| {
            if pa.routes.is_empty() {
                None
            } else {
                Some(
                    pa.routes
                        .iter()
                        .map(|r| ExtractedRouteOutput {
                            pattern: r.pattern.clone(),
                            component_name: r.component_name.clone(),
                            route_type: r.route_type.clone(),
                        })
                        .collect(),
                )
            }
        }),
        extracted_queries: prefetch_analysis.as_ref().and_then(|pa| {
            if pa.queries.is_empty() {
                None
            } else {
                Some(
                    pa.queries
                        .iter()
                        .map(|q| ExtractedQueryOutput {
                            descriptor_chain: q.descriptor_chain.clone(),
                            entity: q.entity.clone(),
                            operation: q.operation.clone(),
                            id_param: q.id_param.clone(),
                        })
                        .collect(),
                )
            }
        }),
        route_params: prefetch_analysis.and_then(|pa| {
            if pa.route_params.is_empty() {
                None
            } else {
                Some(pa.route_params)
            }
        }),
    }
}

/// Compile source code for SSR AOT (Ahead-of-Time) rendering.
pub fn compile_for_ssr_aot(source: &str, options: AotCompileOptions) -> AotCompileResult {
    let filename = options.filename.as_deref().unwrap_or("input.tsx");

    let source_type = SourceType::from_path(filename).unwrap_or_default();
    let allocator = Allocator::default();

    let parser_ret = Parser::new(&allocator, source, source_type).parse();

    if !parser_ret.errors.is_empty() {
        return AotCompileResult {
            code: source.to_string(),
            components: Vec::new(),
        };
    }

    // Run component analysis
    let components = component_analyzer::analyze_components(&parser_ret.program);

    if components.is_empty() {
        return AotCompileResult {
            code: source.to_string(),
            components: Vec::new(),
        };
    }

    // Build import context for reactivity analysis
    let empty_registry = std::collections::HashMap::new();
    let (import_aliases, dynamic_configs) =
        reactivity_analyzer::build_import_aliases(&parser_ret.program, &empty_registry);
    let import_ctx = reactivity_analyzer::ImportContext {
        aliases: import_aliases,
        dynamic_configs,
    };

    // Run props transform + reactivity analysis per component
    let mut ms = magic_string::MagicString::new(source);

    // Strip TypeScript syntax first
    typescript_strip::strip_typescript_syntax(&mut ms, &parser_ret.program, source);

    let mut variables_per_component: Vec<Vec<reactivity_analyzer::VariableInfo>> = Vec::new();

    for comp in &components {
        // Props destructuring must run BEFORE reactivity analysis
        props_transformer::transform_props(&mut ms, &parser_ret.program, comp, source);

        let variables =
            reactivity_analyzer::analyze_reactivity(&parser_ret.program, comp, &import_ctx);
        variables_per_component.push(variables);
    }

    // Run AOT transform
    let aot_result = aot_string_transformer::compile_for_ssr_aot(
        &ms,
        &parser_ret.program,
        source,
        &components,
        &variables_per_component,
    );

    AotCompileResult {
        code: aot_result.code,
        components: aot_result
            .components
            .into_iter()
            .map(|c| AotComponentInfoOutput {
                name: c.name,
                tier: c.tier.as_str().to_string(),
                holes: c.holes,
                query_keys: c.query_keys,
            })
            .collect(),
    }
}

/// Build manifest registry from compile options.
fn build_manifest_registry(options: &CompileOptions) -> reactivity_analyzer::ManifestRegistry {
    let mut registry = std::collections::HashMap::new();

    if let Some(ref manifests) = options.manifests {
        for entry in manifests {
            let module_exports = registry
                .entry(entry.module_specifier.clone())
                .or_insert_with(std::collections::HashMap::new);

            module_exports.insert(
                entry.export_name.clone(),
                reactivity_analyzer::ManifestExportInfo {
                    reactivity_type: entry.reactivity_type.clone(),
                    signal_properties: entry
                        .signal_properties
                        .as_ref()
                        .map(|props| props.iter().cloned().collect()),
                    plain_properties: entry
                        .plain_properties
                        .as_ref()
                        .map(|props| props.iter().cloned().collect()),
                    field_signal_properties: entry
                        .field_signal_properties
                        .as_ref()
                        .map(|props| props.iter().cloned().collect()),
                },
            );
        }
    }

    registry
}
