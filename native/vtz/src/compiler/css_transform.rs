use std::path::Path;

use crate::compiler::pipeline::CompileError;

/// A CSS transform hook for the compilation pipeline.
///
/// Implementations process CSS files (e.g., PostCSS, Lightning CSS, Tailwind v4).
/// The pipeline delegates to registered transforms instead of hardcoding tool-specific logic.
pub trait CssTransform: Send + Sync {
    /// Process a CSS file and return the transformed CSS.
    ///
    /// `file_path` is the path to the CSS file on disk.
    /// `root_dir` is the project root (for resolving configs, node_modules, etc.).
    fn process(&self, file_path: &Path, root_dir: &Path) -> Result<String, Vec<CompileError>>;
}
