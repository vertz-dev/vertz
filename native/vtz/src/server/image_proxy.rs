// ---------------------------------------------------------------------------
// Image optimization proxy for /__vertz_image/ route.
// Resizes, converts (WebP/PNG/JPEG), and caches local images from public/.
// ---------------------------------------------------------------------------

use axum::http::StatusCode;
use std::path::PathBuf;
use thiserror::Error;

/// Maximum allowed dimension (width or height) in pixels.
pub const MAX_DIMENSION: u32 = 8192;

// ---------------------------------------------------------------------------
// Output format
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    WebP,
    Png,
    Jpeg,
}

impl OutputFormat {
    pub fn content_type(&self) -> &'static str {
        match self {
            Self::WebP => "image/webp",
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
        }
    }

    pub fn extension(&self) -> &'static str {
        match self {
            Self::WebP => "webp",
            Self::Png => "png",
            Self::Jpeg => "jpg",
        }
    }

    /// Parse from query parameter value (e.g., "webp", "png", "jpeg").
    pub fn parse(s: &str) -> Result<Self, ImageProxyError> {
        match s.to_lowercase().as_str() {
            "webp" => Ok(Self::WebP),
            "png" => Ok(Self::Png),
            "jpeg" | "jpg" => Ok(Self::Jpeg),
            other => Err(ImageProxyError::UnsupportedFormat(other.to_string())),
        }
    }

    /// Detect format from file extension (e.g., ".png" → Png).
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().trim_start_matches('.') {
            "webp" => Some(Self::WebP),
            "png" => Some(Self::Png),
            "jpeg" | "jpg" => Some(Self::Jpeg),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Resize fit mode
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ResizeFit {
    #[default]
    Cover,
    Contain,
    Fill,
}

impl ResizeFit {
    /// Parse from query parameter value (e.g., "cover", "contain", "fill").
    pub fn parse(s: &str) -> Result<Self, ImageProxyError> {
        match s.to_lowercase().as_str() {
            "cover" => Ok(Self::Cover),
            "contain" => Ok(Self::Contain),
            "fill" => Ok(Self::Fill),
            other => Err(ImageProxyError::UnsupportedFit(other.to_string())),
        }
    }
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
pub enum ImageProxyError {
    #[error("{0}")]
    InvalidParam(String),

    #[error("Image not found: {0}")]
    NotFound(String),

    #[error("Path traversal not allowed")]
    PathTraversal,

    #[error("Unsupported format: {0}. Valid formats: webp, png, jpeg")]
    UnsupportedFormat(String),

    #[error("Unsupported fit value: {0}. Valid values: cover, contain, fill")]
    UnsupportedFit(String),

    #[error("Failed to decode image: {0}")]
    Decode(String),

    #[error("Failed to encode image: {0}")]
    Encode(String),

    #[error("At least one of w, h, or format must be specified")]
    NothingToDo,
}

impl ImageProxyError {
    pub fn status_code(&self) -> StatusCode {
        match self {
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Decode(_) | Self::Encode(_) => StatusCode::INTERNAL_SERVER_ERROR,
            _ => StatusCode::BAD_REQUEST,
        }
    }
}

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

/// Fully parsed and validated image proxy request.
#[derive(Debug)]
pub struct ImageRequest {
    pub source_path: PathBuf,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub format: Option<OutputFormat>,
    pub quality: u8,
    pub fit: ResizeFit,
}

impl ImageRequest {
    /// Parse from URL path (after stripping `/__vertz_image/` prefix) and query string.
    pub fn parse(path_after_prefix: &str, query: Option<&str>) -> Result<Self, ImageProxyError> {
        // Percent-decode the source path
        let source_path = PathBuf::from(percent_decode(path_after_prefix));

        // Parse query parameters
        let params = parse_query(query.unwrap_or(""));

        let width = parse_dimension(&params, "w", "Width")?;
        let height = parse_dimension(&params, "h", "Height")?;

        let format = match params.get("format") {
            Some(f) => Some(OutputFormat::parse(f)?),
            None => None,
        };

        let quality = match params.get("q") {
            Some(q_str) => {
                let q: u8 = q_str.parse().map_err(|_| {
                    ImageProxyError::InvalidParam("Quality must be between 1 and 100".to_string())
                })?;
                if q == 0 || q > 100 {
                    return Err(ImageProxyError::InvalidParam(
                        "Quality must be between 1 and 100".to_string(),
                    ));
                }
                q
            }
            None => 80,
        };

        let fit = match params.get("fit") {
            Some(f) => ResizeFit::parse(f)?,
            None => ResizeFit::default(),
        };

        // At least one of w, h, or format must be present
        if width.is_none() && height.is_none() && format.is_none() {
            return Err(ImageProxyError::NothingToDo);
        }

        Ok(ImageRequest {
            source_path,
            width,
            height,
            format,
            quality,
            fit,
        })
    }
}

/// Parse a dimension parameter (w or h), validating range 1..=MAX_DIMENSION.
fn parse_dimension(
    params: &QueryParams,
    key: &str,
    name: &str,
) -> Result<Option<u32>, ImageProxyError> {
    match params.get(key) {
        Some(val) => {
            let v: u32 = val.parse().map_err(|_| {
                ImageProxyError::InvalidParam(format!(
                    "{} must be between 1 and {}",
                    name, MAX_DIMENSION
                ))
            })?;
            if v == 0 || v > MAX_DIMENSION {
                return Err(ImageProxyError::InvalidParam(format!(
                    "{} must be between 1 and {}",
                    name, MAX_DIMENSION
                )));
            }
            Ok(Some(v))
        }
        None => Ok(None),
    }
}

// ---------------------------------------------------------------------------
// Query string parsing (simple, no external crate needed)
// ---------------------------------------------------------------------------

type QueryParams = std::collections::HashMap<String, String>;

fn parse_query(query: &str) -> QueryParams {
    let mut params = QueryParams::new();
    for pair in query.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            if !key.is_empty() {
                params.insert(key.to_string(), value.to_string());
            }
        }
    }
    params
}

/// Simple percent-decoding for URL path segments.
fn percent_decode(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                result.push(byte as char);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i] as char);
        i += 1;
    }
    result
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- OutputFormat tests ---

    #[test]
    fn output_format_parse_webp() {
        assert_eq!(OutputFormat::parse("webp").unwrap(), OutputFormat::WebP);
    }

    #[test]
    fn output_format_parse_png() {
        assert_eq!(OutputFormat::parse("png").unwrap(), OutputFormat::Png);
    }

    #[test]
    fn output_format_parse_jpeg() {
        assert_eq!(OutputFormat::parse("jpeg").unwrap(), OutputFormat::Jpeg);
    }

    #[test]
    fn output_format_parse_jpg() {
        assert_eq!(OutputFormat::parse("jpg").unwrap(), OutputFormat::Jpeg);
    }

    #[test]
    fn output_format_parse_case_insensitive() {
        assert_eq!(OutputFormat::parse("WebP").unwrap(), OutputFormat::WebP);
        assert_eq!(OutputFormat::parse("PNG").unwrap(), OutputFormat::Png);
    }

    #[test]
    fn output_format_parse_unsupported() {
        let err = OutputFormat::parse("bmp").unwrap_err();
        assert!(matches!(err, ImageProxyError::UnsupportedFormat(_)));
        assert_eq!(
            err.to_string(),
            "Unsupported format: bmp. Valid formats: webp, png, jpeg"
        );
    }

    #[test]
    fn output_format_content_type() {
        assert_eq!(OutputFormat::WebP.content_type(), "image/webp");
        assert_eq!(OutputFormat::Png.content_type(), "image/png");
        assert_eq!(OutputFormat::Jpeg.content_type(), "image/jpeg");
    }

    #[test]
    fn output_format_extension() {
        assert_eq!(OutputFormat::WebP.extension(), "webp");
        assert_eq!(OutputFormat::Png.extension(), "png");
        assert_eq!(OutputFormat::Jpeg.extension(), "jpg");
    }

    #[test]
    fn output_format_from_extension_known() {
        assert_eq!(
            OutputFormat::from_extension(".png"),
            Some(OutputFormat::Png)
        );
        assert_eq!(
            OutputFormat::from_extension(".jpg"),
            Some(OutputFormat::Jpeg)
        );
        assert_eq!(
            OutputFormat::from_extension(".jpeg"),
            Some(OutputFormat::Jpeg)
        );
        assert_eq!(
            OutputFormat::from_extension(".webp"),
            Some(OutputFormat::WebP)
        );
        assert_eq!(OutputFormat::from_extension("png"), Some(OutputFormat::Png));
    }

    #[test]
    fn output_format_from_extension_unknown() {
        assert_eq!(OutputFormat::from_extension(".svg"), None);
        assert_eq!(OutputFormat::from_extension(".gif"), None);
        assert_eq!(OutputFormat::from_extension(".bmp"), None);
    }

    // --- ResizeFit tests ---

    #[test]
    fn resize_fit_parse_cover() {
        assert_eq!(ResizeFit::parse("cover").unwrap(), ResizeFit::Cover);
    }

    #[test]
    fn resize_fit_parse_contain() {
        assert_eq!(ResizeFit::parse("contain").unwrap(), ResizeFit::Contain);
    }

    #[test]
    fn resize_fit_parse_fill() {
        assert_eq!(ResizeFit::parse("fill").unwrap(), ResizeFit::Fill);
    }

    #[test]
    fn resize_fit_parse_case_insensitive() {
        assert_eq!(ResizeFit::parse("Cover").unwrap(), ResizeFit::Cover);
        assert_eq!(ResizeFit::parse("FILL").unwrap(), ResizeFit::Fill);
    }

    #[test]
    fn resize_fit_parse_unsupported() {
        let err = ResizeFit::parse("crop").unwrap_err();
        assert!(matches!(err, ImageProxyError::UnsupportedFit(_)));
        assert_eq!(
            err.to_string(),
            "Unsupported fit value: crop. Valid values: cover, contain, fill"
        );
    }

    #[test]
    fn resize_fit_default_is_cover() {
        assert_eq!(ResizeFit::default(), ResizeFit::Cover);
    }

    // --- ImageProxyError tests ---

    #[test]
    fn error_status_code_bad_request() {
        assert_eq!(
            ImageProxyError::InvalidParam("test".into()).status_code(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            ImageProxyError::UnsupportedFormat("bmp".into()).status_code(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            ImageProxyError::UnsupportedFit("crop".into()).status_code(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            ImageProxyError::PathTraversal.status_code(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            ImageProxyError::NothingToDo.status_code(),
            StatusCode::BAD_REQUEST
        );
    }

    #[test]
    fn error_status_code_not_found() {
        assert_eq!(
            ImageProxyError::NotFound("hero.png".into()).status_code(),
            StatusCode::NOT_FOUND
        );
    }

    #[test]
    fn error_status_code_internal() {
        assert_eq!(
            ImageProxyError::Decode("bad bytes".into()).status_code(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
        assert_eq!(
            ImageProxyError::Encode("failed".into()).status_code(),
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    // --- ImageRequest::parse tests ---

    #[test]
    fn parse_full_params() {
        let req = ImageRequest::parse("hero.png", Some("w=800&h=600&format=webp&q=75&fit=contain"))
            .unwrap();
        assert_eq!(req.source_path, PathBuf::from("hero.png"));
        assert_eq!(req.width, Some(800));
        assert_eq!(req.height, Some(600));
        assert_eq!(req.format, Some(OutputFormat::WebP));
        assert_eq!(req.quality, 75);
        assert_eq!(req.fit, ResizeFit::Contain);
    }

    #[test]
    fn parse_width_only() {
        let req = ImageRequest::parse("hero.png", Some("w=400")).unwrap();
        assert_eq!(req.width, Some(400));
        assert_eq!(req.height, None);
        assert_eq!(req.format, None);
        assert_eq!(req.quality, 80);
        assert_eq!(req.fit, ResizeFit::Cover);
    }

    #[test]
    fn parse_format_only() {
        let req = ImageRequest::parse("hero.png", Some("format=webp")).unwrap();
        assert_eq!(req.width, None);
        assert_eq!(req.height, None);
        assert_eq!(req.format, Some(OutputFormat::WebP));
    }

    #[test]
    fn parse_nested_path() {
        let req = ImageRequest::parse("photos/team.jpg", Some("w=400&q=60&fit=contain")).unwrap();
        assert_eq!(req.source_path, PathBuf::from("photos/team.jpg"));
        assert_eq!(req.width, Some(400));
        assert_eq!(req.quality, 60);
        assert_eq!(req.fit, ResizeFit::Contain);
    }

    #[test]
    fn parse_percent_encoded_path() {
        let req = ImageRequest::parse("path%20with%20spaces.png", Some("w=400")).unwrap();
        assert_eq!(req.source_path, PathBuf::from("path with spaces.png"));
    }

    #[test]
    fn parse_no_query_returns_nothing_to_do() {
        let err = ImageRequest::parse("hero.png", None).unwrap_err();
        assert!(matches!(err, ImageProxyError::NothingToDo));
    }

    #[test]
    fn parse_empty_query_returns_nothing_to_do() {
        let err = ImageRequest::parse("hero.png", Some("")).unwrap_err();
        assert!(matches!(err, ImageProxyError::NothingToDo));
    }

    #[test]
    fn parse_width_zero() {
        let err = ImageRequest::parse("hero.png", Some("w=0")).unwrap_err();
        assert!(matches!(err, ImageProxyError::InvalidParam(_)));
        assert!(err.to_string().contains("Width must be between 1 and 8192"));
    }

    #[test]
    fn parse_width_exceeds_max() {
        let err = ImageRequest::parse("hero.png", Some("w=10000")).unwrap_err();
        assert!(matches!(err, ImageProxyError::InvalidParam(_)));
        assert!(err.to_string().contains("Width must be between 1 and 8192"));
    }

    #[test]
    fn parse_height_zero() {
        let err = ImageRequest::parse("hero.png", Some("h=0")).unwrap_err();
        assert!(matches!(err, ImageProxyError::InvalidParam(_)));
        assert!(err
            .to_string()
            .contains("Height must be between 1 and 8192"));
    }

    #[test]
    fn parse_quality_zero() {
        let err = ImageRequest::parse("hero.png", Some("w=800&q=0")).unwrap_err();
        assert!(matches!(err, ImageProxyError::InvalidParam(_)));
        assert!(err
            .to_string()
            .contains("Quality must be between 1 and 100"));
    }

    #[test]
    fn parse_quality_over_100() {
        let err = ImageRequest::parse("hero.png", Some("w=800&q=150")).unwrap_err();
        assert!(matches!(err, ImageProxyError::InvalidParam(_)));
        assert!(err
            .to_string()
            .contains("Quality must be between 1 and 100"));
    }

    #[test]
    fn parse_unsupported_format() {
        let err = ImageRequest::parse("hero.png", Some("w=800&format=bmp")).unwrap_err();
        assert!(matches!(err, ImageProxyError::UnsupportedFormat(_)));
    }

    #[test]
    fn parse_unsupported_fit() {
        let err = ImageRequest::parse("hero.png", Some("w=800&fit=crop")).unwrap_err();
        assert!(matches!(err, ImageProxyError::UnsupportedFit(_)));
    }

    #[test]
    fn parse_width_at_max_dimension() {
        let req = ImageRequest::parse("hero.png", Some("w=8192")).unwrap();
        assert_eq!(req.width, Some(8192));
    }

    #[test]
    fn parse_width_non_numeric() {
        let err = ImageRequest::parse("hero.png", Some("w=abc")).unwrap_err();
        assert!(matches!(err, ImageProxyError::InvalidParam(_)));
    }

    // --- percent_decode tests ---

    #[test]
    fn percent_decode_basic() {
        assert_eq!(percent_decode("hello%20world"), "hello world");
    }

    #[test]
    fn percent_decode_no_encoding() {
        assert_eq!(percent_decode("hello.png"), "hello.png");
    }

    #[test]
    fn percent_decode_multiple() {
        assert_eq!(
            percent_decode("path%20with%20spaces%2Fslash"),
            "path with spaces/slash"
        );
    }

    // --- parse_query tests ---

    #[test]
    fn parse_query_basic() {
        let params = parse_query("w=800&h=600");
        assert_eq!(params.get("w").unwrap(), "800");
        assert_eq!(params.get("h").unwrap(), "600");
    }

    #[test]
    fn parse_query_empty() {
        let params = parse_query("");
        assert!(params.is_empty());
    }

    #[test]
    fn parse_query_single() {
        let params = parse_query("w=400");
        assert_eq!(params.get("w").unwrap(), "400");
        assert_eq!(params.len(), 1);
    }
}
