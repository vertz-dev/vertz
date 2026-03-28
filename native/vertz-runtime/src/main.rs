mod cli;

use clap::Parser;
use cli::{Cli, Command};
use vertz_runtime::config::ServerConfig;

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    match cli.command {
        Command::Dev(args) => {
            let mut config = ServerConfig::new(args.port, args.host, args.public_dir);
            config.enable_typecheck = !args.no_typecheck;
            config.tsconfig_path = args.tsconfig;
            config.typecheck_binary = args.typecheck_binary;

            if let Err(e) = vertz_runtime::server::http::start_server(config).await {
                eprintln!("Error: {}", e);
                std::process::exit(1);
            }
        }
    }
}
