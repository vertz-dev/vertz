use std::path::PathBuf;
use thiserror::Error;

pub type PmResult<T> = Result<T, PmError>;

#[derive(Debug, Error)]
pub enum PmError {
    #[error("failed to read {path}: {source}")]
    ReadFile {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("failed to write {path}: {source}")]
    WriteFile {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("invalid package.json at {path}: {source}")]
    InvalidPackageJson {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },

    #[error("package.json at {path} is not a JSON object")]
    PackageJsonNotObject { path: PathBuf },

    #[error("invalid lockfile at {path}: {reason}")]
    InvalidLockfile { path: PathBuf, reason: String },

    #[error("invalid .vertzrc at {path}: {source}")]
    InvalidVertzrc {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },

    #[error("malformed .npmrc: {reason}")]
    InvalidNpmrc { reason: String },

    #[error("undefined environment variable ${{{name}}} referenced in .npmrc")]
    UndefinedEnvVar { name: String },

    #[error("no node_modules found; run `vertz install` first")]
    NoNodeModules,

    #[error("serde_json error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}
