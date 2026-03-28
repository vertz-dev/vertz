use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(name = "vertz-runtime", version, about = "Vertz Development Runtime")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Start the development server
    Dev(DevArgs),
    /// Run tests
    Test(TestArgs),
}

#[derive(Parser, Debug)]
pub struct DevArgs {
    /// Port to listen on
    #[arg(long, default_value_t = 3000)]
    pub port: u16,

    /// Host to bind to
    #[arg(long, default_value = "localhost")]
    pub host: String,

    /// Directory to serve static files from
    #[arg(long, default_value = "public")]
    pub public_dir: PathBuf,

    /// Disable TypeScript type checking (tsc/tsgo)
    #[arg(long)]
    pub no_typecheck: bool,

    /// Custom tsconfig path (default: auto-detect)
    #[arg(long)]
    pub tsconfig: Option<PathBuf>,

    /// Explicit type checker binary path (skips auto-detection)
    #[arg(long)]
    pub typecheck_binary: Option<PathBuf>,
}

#[derive(Parser, Debug)]
pub struct TestArgs {
    /// File or directory paths to test (default: project root)
    #[arg(value_name = "PATH")]
    pub paths: Vec<PathBuf>,

    /// Filter tests by name substring
    #[arg(long)]
    pub filter: Option<String>,

    /// Re-run tests when files change
    #[arg(long)]
    pub watch: bool,

    /// Enable code coverage collection
    #[arg(long)]
    pub coverage: bool,

    /// Minimum coverage percentage (default: 95)
    #[arg(long, default_value_t = 95)]
    pub coverage_threshold: u32,

    /// Timeout per test in milliseconds (default: 5000)
    #[arg(long, default_value_t = 5000)]
    pub timeout: u64,

    /// Max parallel test files (default: CPU count)
    #[arg(long)]
    pub concurrency: Option<usize>,

    /// Reporter format (default: terminal)
    #[arg(long, default_value = "terminal")]
    pub reporter: String,

    /// Stop after first test failure
    #[arg(long)]
    pub bail: bool,

    /// Skip preload scripts
    #[arg(long)]
    pub no_preload: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_dev(args: &[&str]) -> DevArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::Dev(args) => args,
            other => panic!("Expected Dev, got {:?}", other),
        }
    }

    fn parse_test(args: &[&str]) -> TestArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::Test(args) => args,
            other => panic!("Expected Test, got {:?}", other),
        }
    }

    // --- Dev command tests ---

    #[test]
    fn test_default_dev_args() {
        let args = parse_dev(&["vertz-runtime", "dev"]);
        assert_eq!(args.port, 3000);
        assert_eq!(args.host, "localhost");
        assert_eq!(args.public_dir, PathBuf::from("public"));
    }

    #[test]
    fn test_custom_port() {
        let args = parse_dev(&["vertz-runtime", "dev", "--port", "4000"]);
        assert_eq!(args.port, 4000);
    }

    #[test]
    fn test_custom_host() {
        let args = parse_dev(&["vertz-runtime", "dev", "--host", "0.0.0.0"]);
        assert_eq!(args.host, "0.0.0.0");
    }

    #[test]
    fn test_custom_public_dir() {
        let args = parse_dev(&["vertz-runtime", "dev", "--public-dir", "dist"]);
        assert_eq!(args.public_dir, PathBuf::from("dist"));
    }

    #[test]
    fn test_all_args_combined() {
        let args = parse_dev(&[
            "vertz-runtime",
            "dev",
            "--port",
            "8080",
            "--host",
            "0.0.0.0",
            "--public-dir",
            "static",
        ]);
        assert_eq!(args.port, 8080);
        assert_eq!(args.host, "0.0.0.0");
        assert_eq!(args.public_dir, PathBuf::from("static"));
    }

    #[test]
    fn test_no_typecheck_flag() {
        let args = parse_dev(&["vertz-runtime", "dev", "--no-typecheck"]);
        assert!(args.no_typecheck);
    }

    #[test]
    fn test_typecheck_enabled_by_default() {
        let args = parse_dev(&["vertz-runtime", "dev"]);
        assert!(!args.no_typecheck);
    }

    #[test]
    fn test_custom_tsconfig() {
        let args = parse_dev(&["vertz-runtime", "dev", "--tsconfig", "tsconfig.app.json"]);
        assert_eq!(args.tsconfig, Some(PathBuf::from("tsconfig.app.json")));
    }

    #[test]
    fn test_tsconfig_default_none() {
        let args = parse_dev(&["vertz-runtime", "dev"]);
        assert!(args.tsconfig.is_none());
    }

    #[test]
    fn test_typecheck_binary_flag() {
        let args = parse_dev(&[
            "vertz-runtime",
            "dev",
            "--typecheck-binary",
            "/usr/local/bin/tsgo",
        ]);
        assert_eq!(
            args.typecheck_binary,
            Some(PathBuf::from("/usr/local/bin/tsgo"))
        );
    }

    #[test]
    fn test_typecheck_binary_default_none() {
        let args = parse_dev(&["vertz-runtime", "dev"]);
        assert!(args.typecheck_binary.is_none());
    }

    // --- Test command tests ---

    #[test]
    fn test_default_test_args() {
        let args = parse_test(&["vertz-runtime", "test"]);
        assert!(args.paths.is_empty());
        assert!(args.filter.is_none());
        assert!(!args.watch);
        assert!(!args.coverage);
        assert_eq!(args.coverage_threshold, 95);
        assert_eq!(args.timeout, 5000);
        assert!(args.concurrency.is_none());
        assert_eq!(args.reporter, "terminal");
        assert!(!args.bail);
        assert!(!args.no_preload);
    }

    #[test]
    fn test_test_with_paths() {
        let args = parse_test(&["vertz-runtime", "test", "src/math.test.ts", "src/string.test.ts"]);
        assert_eq!(args.paths.len(), 2);
        assert_eq!(args.paths[0], PathBuf::from("src/math.test.ts"));
        assert_eq!(args.paths[1], PathBuf::from("src/string.test.ts"));
    }

    #[test]
    fn test_test_with_filter() {
        let args = parse_test(&["vertz-runtime", "test", "--filter", "math"]);
        assert_eq!(args.filter, Some("math".to_string()));
    }

    #[test]
    fn test_test_watch_mode() {
        let args = parse_test(&["vertz-runtime", "test", "--watch"]);
        assert!(args.watch);
    }

    #[test]
    fn test_test_coverage() {
        let args = parse_test(&["vertz-runtime", "test", "--coverage", "--coverage-threshold", "80"]);
        assert!(args.coverage);
        assert_eq!(args.coverage_threshold, 80);
    }

    #[test]
    fn test_test_timeout() {
        let args = parse_test(&["vertz-runtime", "test", "--timeout", "10000"]);
        assert_eq!(args.timeout, 10000);
    }

    #[test]
    fn test_test_concurrency() {
        let args = parse_test(&["vertz-runtime", "test", "--concurrency", "4"]);
        assert_eq!(args.concurrency, Some(4));
    }

    #[test]
    fn test_test_bail() {
        let args = parse_test(&["vertz-runtime", "test", "--bail"]);
        assert!(args.bail);
    }

    #[test]
    fn test_test_reporter() {
        let args = parse_test(&["vertz-runtime", "test", "--reporter", "json"]);
        assert_eq!(args.reporter, "json");
    }

    #[test]
    fn test_test_no_preload() {
        let args = parse_test(&["vertz-runtime", "test", "--no-preload"]);
        assert!(args.no_preload);
    }

    #[test]
    fn test_test_all_flags_combined() {
        let args = parse_test(&[
            "vertz-runtime",
            "test",
            "src/",
            "--filter",
            "math",
            "--bail",
            "--concurrency",
            "2",
            "--timeout",
            "3000",
        ]);
        assert_eq!(args.paths, vec![PathBuf::from("src/")]);
        assert_eq!(args.filter, Some("math".to_string()));
        assert!(args.bail);
        assert_eq!(args.concurrency, Some(2));
        assert_eq!(args.timeout, 3000);
    }
}
