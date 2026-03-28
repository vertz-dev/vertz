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
}
