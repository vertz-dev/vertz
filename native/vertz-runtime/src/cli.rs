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
    #[arg(long, default_value_t = false)]
    pub no_typecheck: bool,

    /// Custom tsconfig path (default: auto-detect)
    #[arg(long)]
    pub tsconfig: Option<PathBuf>,

    /// Explicit type checker binary path (skips auto-detection)
    #[arg(long)]
    pub typecheck_binary: Option<PathBuf>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_dev_args() {
        let cli = Cli::parse_from(["vertz-runtime", "dev"]);
        match cli.command {
            Command::Dev(args) => {
                assert_eq!(args.port, 3000);
                assert_eq!(args.host, "localhost");
                assert_eq!(args.public_dir, PathBuf::from("public"));
            }
        }
    }

    #[test]
    fn test_custom_port() {
        let cli = Cli::parse_from(["vertz-runtime", "dev", "--port", "4000"]);
        match cli.command {
            Command::Dev(args) => {
                assert_eq!(args.port, 4000);
            }
        }
    }

    #[test]
    fn test_custom_host() {
        let cli = Cli::parse_from(["vertz-runtime", "dev", "--host", "0.0.0.0"]);
        match cli.command {
            Command::Dev(args) => {
                assert_eq!(args.host, "0.0.0.0");
            }
        }
    }

    #[test]
    fn test_custom_public_dir() {
        let cli = Cli::parse_from(["vertz-runtime", "dev", "--public-dir", "dist"]);
        match cli.command {
            Command::Dev(args) => {
                assert_eq!(args.public_dir, PathBuf::from("dist"));
            }
        }
    }

    #[test]
    fn test_all_args_combined() {
        let cli = Cli::parse_from([
            "vertz-runtime",
            "dev",
            "--port",
            "8080",
            "--host",
            "0.0.0.0",
            "--public-dir",
            "static",
        ]);
        match cli.command {
            Command::Dev(args) => {
                assert_eq!(args.port, 8080);
                assert_eq!(args.host, "0.0.0.0");
                assert_eq!(args.public_dir, PathBuf::from("static"));
            }
        }
    }

    #[test]
    fn test_no_typecheck_flag() {
        let cli = Cli::parse_from(["vertz-runtime", "dev", "--no-typecheck"]);
        match cli.command {
            Command::Dev(args) => {
                assert!(args.no_typecheck);
            }
        }
    }

    #[test]
    fn test_typecheck_enabled_by_default() {
        let cli = Cli::parse_from(["vertz-runtime", "dev"]);
        match cli.command {
            Command::Dev(args) => {
                assert!(!args.no_typecheck);
            }
        }
    }

    #[test]
    fn test_custom_tsconfig() {
        let cli = Cli::parse_from(["vertz-runtime", "dev", "--tsconfig", "tsconfig.app.json"]);
        match cli.command {
            Command::Dev(args) => {
                assert_eq!(args.tsconfig, Some(PathBuf::from("tsconfig.app.json")));
            }
        }
    }

    #[test]
    fn test_tsconfig_default_none() {
        let cli = Cli::parse_from(["vertz-runtime", "dev"]);
        match cli.command {
            Command::Dev(args) => {
                assert!(args.tsconfig.is_none());
            }
        }
    }

    #[test]
    fn test_typecheck_binary_flag() {
        let cli = Cli::parse_from([
            "vertz-runtime",
            "dev",
            "--typecheck-binary",
            "/usr/local/bin/tsgo",
        ]);
        match cli.command {
            Command::Dev(args) => {
                assert_eq!(
                    args.typecheck_binary,
                    Some(PathBuf::from("/usr/local/bin/tsgo"))
                );
            }
        }
    }

    #[test]
    fn test_typecheck_binary_default_none() {
        let cli = Cli::parse_from(["vertz-runtime", "dev"]);
        match cli.command {
            Command::Dev(args) => {
                assert!(args.typecheck_binary.is_none());
            }
        }
    }
}
