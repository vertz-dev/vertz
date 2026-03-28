mod banner;
mod cli;
mod config;
pub mod runtime;
mod server;

use clap::Parser;
use cli::{Cli, Command};
use config::ServerConfig;

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    match cli.command {
        Command::Dev(args) => {
            let config = ServerConfig::new(args.port, args.host, args.public_dir);

            if let Err(e) = server::http::start_server(config).await {
                eprintln!("Error: {}", e);
                std::process::exit(1);
            }
        }
    }
}
