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
pub struct CompileResult {
    pub code: String,
    pub map: Option<String>,
    pub diagnostics: Option<Vec<Diagnostic>>,
}

#[napi(object)]
pub struct CompileOptions {
    pub filename: Option<String>,
}

#[napi]
pub fn compile(source: String, options: Option<CompileOptions>) -> CompileResult {
    let filename = options
        .as_ref()
        .and_then(|o| o.filename.as_deref())
        .unwrap_or("input.ts");

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
                        offset_to_line_column(&source, offset)
                    })
                    .unwrap_or((1, 1));

                Diagnostic {
                    message: err.message.to_string(),
                    line: Some(line),
                    column: Some(column),
                }
            })
            .collect();

        // Return the original source with diagnostics on parse failure
        return CompileResult {
            code: format!("// compiled by vertz-native\n{source}"),
            map: None,
            diagnostics: Some(diagnostics),
        };
    }

    // Generate code with source map using oxc codegen
    let codegen_options = CodegenOptions {
        source_map_path: Some(std::path::PathBuf::from(filename)),
        ..CodegenOptions::default()
    };

    let codegen_ret = Codegen::new()
        .with_options(codegen_options)
        .build(&parser_ret.program);

    let generated_code = codegen_ret.code;

    // Build source map if available
    let map = codegen_ret
        .map
        .map(|source_map| source_map.to_json_string());

    CompileResult {
        code: format!("// compiled by vertz-native\n{generated_code}"),
        map,
        diagnostics: None,
    }
}

/// Convert a byte offset in source text to (line, column), both 1-based.
fn offset_to_line_column(source: &str, offset: usize) -> (u32, u32) {
    let mut line = 1u32;
    let mut col = 1u32;
    for (i, ch) in source.char_indices() {
        if i >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
    }
    (line, col)
}
