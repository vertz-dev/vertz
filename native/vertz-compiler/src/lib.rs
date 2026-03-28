// Thin NAPI wrapper around vertz-compiler-core.
// All compilation logic lives in the core crate.
// This crate only provides NAPI type conversions and JS-callable entry points.

use napi_derive::napi;
use vertz_compiler_core as core;

// ─── NAPI output types ──────────────────────────────────────────────────

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
pub struct NapiNestedFieldAccess {
    pub field: String,
    pub nested_path: Vec<String>,
}

#[napi(object)]
pub struct NapiFieldSelection {
    pub query_var: String,
    pub injection_pos: u32,
    pub injection_kind: String,
    pub fields: Vec<String>,
    pub has_opaque_access: bool,
    pub nested_access: Vec<NapiNestedFieldAccess>,
    pub inferred_entity_name: Option<String>,
}

#[napi(object)]
pub struct NapiExtractedRoute {
    pub pattern: String,
    pub component_name: String,
    pub route_type: String,
}

#[napi(object)]
pub struct NapiExtractedQuery {
    pub descriptor_chain: String,
    pub entity: Option<String>,
    pub operation: Option<String>,
    pub id_param: Option<String>,
}

#[napi(object)]
pub struct CompileResult {
    pub code: String,
    pub css: Option<String>,
    pub map: Option<String>,
    pub diagnostics: Option<Vec<Diagnostic>>,
    pub components: Option<Vec<NapiComponentInfo>>,
    pub hydration_ids: Option<Vec<String>>,
    pub field_selections: Option<Vec<NapiFieldSelection>>,
    pub extracted_routes: Option<Vec<NapiExtractedRoute>>,
    pub extracted_queries: Option<Vec<NapiExtractedQuery>>,
    pub route_params: Option<Vec<String>>,
}

#[napi(object)]
pub struct NapiManifestEntry {
    pub module_specifier: String,
    pub export_name: String,
    pub reactivity_type: String,
    pub signal_properties: Option<Vec<String>>,
    pub plain_properties: Option<Vec<String>>,
    pub field_signal_properties: Option<Vec<String>>,
}

#[napi(object)]
pub struct CompileOptions {
    pub filename: Option<String>,
    pub fast_refresh: Option<bool>,
    pub target: Option<String>,
    pub manifests: Option<Vec<NapiManifestEntry>>,
    pub hydration_markers: Option<bool>,
    pub route_splitting: Option<bool>,
    pub field_selection: Option<bool>,
    pub prefetch_manifest: Option<bool>,
}

#[napi(object)]
pub struct NapiAotComponentInfo {
    pub name: String,
    pub tier: String,
    pub holes: Vec<String>,
    pub query_keys: Vec<String>,
}

#[napi(object)]
pub struct AotCompileResult {
    pub code: String,
    pub components: Vec<NapiAotComponentInfo>,
}

#[napi(object)]
pub struct AotCompileOptions {
    pub filename: Option<String>,
}

// ─── Type conversion helpers ────────────────────────────────────────────

fn to_napi_diagnostics(diagnostics: Option<Vec<core::Diagnostic>>) -> Option<Vec<Diagnostic>> {
    diagnostics.map(|ds| {
        ds.into_iter()
            .map(|d| Diagnostic {
                message: d.message,
                line: d.line,
                column: d.column,
            })
            .collect()
    })
}

fn to_napi_components(
    components: Option<Vec<core::ComponentInfoOutput>>,
) -> Option<Vec<NapiComponentInfo>> {
    components.map(|cs| {
        cs.into_iter()
            .map(|c| NapiComponentInfo {
                name: c.name,
                body_start: c.body_start,
                body_end: c.body_end,
                variables: c.variables.map(|vs| {
                    vs.into_iter()
                        .map(|v| NapiVariableInfo {
                            name: v.name,
                            kind: v.kind,
                            start: v.start,
                            end: v.end,
                            signal_properties: v.signal_properties,
                            plain_properties: v.plain_properties,
                            field_signal_properties: v.field_signal_properties,
                            is_reactive_source: v.is_reactive_source,
                        })
                        .collect()
                }),
            })
            .collect()
    })
}

fn to_napi_field_selections(
    selections: Option<Vec<core::FieldSelectionOutput>>,
) -> Option<Vec<NapiFieldSelection>> {
    selections.map(|ss| {
        ss.into_iter()
            .map(|fs| NapiFieldSelection {
                query_var: fs.query_var,
                injection_pos: fs.injection_pos,
                injection_kind: fs.injection_kind,
                fields: fs.fields,
                has_opaque_access: fs.has_opaque_access,
                nested_access: fs
                    .nested_access
                    .into_iter()
                    .map(|n| NapiNestedFieldAccess {
                        field: n.field,
                        nested_path: n.nested_path,
                    })
                    .collect(),
                inferred_entity_name: fs.inferred_entity_name,
            })
            .collect()
    })
}

fn to_napi_extracted_routes(
    routes: Option<Vec<core::ExtractedRouteOutput>>,
) -> Option<Vec<NapiExtractedRoute>> {
    routes.map(|rs| {
        rs.into_iter()
            .map(|r| NapiExtractedRoute {
                pattern: r.pattern,
                component_name: r.component_name,
                route_type: r.route_type,
            })
            .collect()
    })
}

fn to_napi_extracted_queries(
    queries: Option<Vec<core::ExtractedQueryOutput>>,
) -> Option<Vec<NapiExtractedQuery>> {
    queries.map(|qs| {
        qs.into_iter()
            .map(|q| NapiExtractedQuery {
                descriptor_chain: q.descriptor_chain,
                entity: q.entity,
                operation: q.operation,
                id_param: q.id_param,
            })
            .collect()
    })
}

fn to_core_options(options: Option<CompileOptions>) -> core::CompileOptions {
    match options {
        None => core::CompileOptions::default(),
        Some(opts) => core::CompileOptions {
            filename: opts.filename,
            fast_refresh: opts.fast_refresh,
            target: opts.target,
            manifests: opts.manifests.map(|ms| {
                ms.into_iter()
                    .map(|m| core::ManifestEntry {
                        module_specifier: m.module_specifier,
                        export_name: m.export_name,
                        reactivity_type: m.reactivity_type,
                        signal_properties: m.signal_properties,
                        plain_properties: m.plain_properties,
                        field_signal_properties: m.field_signal_properties,
                    })
                    .collect()
            }),
            hydration_markers: opts.hydration_markers,
            route_splitting: opts.route_splitting,
            field_selection: opts.field_selection,
            prefetch_manifest: opts.prefetch_manifest,
        },
    }
}

// ─── NAPI entry points ─────────────────────────────────────────────────

#[napi]
pub fn compile(source: String, options: Option<CompileOptions>) -> CompileResult {
    let core_options = to_core_options(options);
    let result = core::compile(&source, core_options);

    CompileResult {
        code: result.code,
        css: result.css,
        map: result.map,
        diagnostics: to_napi_diagnostics(result.diagnostics),
        components: to_napi_components(result.components),
        hydration_ids: result.hydration_ids,
        field_selections: to_napi_field_selections(result.field_selections),
        extracted_routes: to_napi_extracted_routes(result.extracted_routes),
        extracted_queries: to_napi_extracted_queries(result.extracted_queries),
        route_params: result.route_params,
    }
}

#[napi]
pub fn compile_for_ssr_aot(source: String, options: Option<AotCompileOptions>) -> AotCompileResult {
    let core_options = core::AotCompileOptions {
        filename: options.and_then(|o| o.filename),
    };
    let result = core::compile_for_ssr_aot(&source, core_options);

    AotCompileResult {
        code: result.code,
        components: result
            .components
            .into_iter()
            .map(|c| NapiAotComponentInfo {
                name: c.name,
                tier: c.tier,
                holes: c.holes,
                query_keys: c.query_keys,
            })
            .collect(),
    }
}
