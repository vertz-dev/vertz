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
        Command::Test(args) => {
            let root_dir = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            let config = vertz_runtime::test::runner::TestRunConfig {
                root_dir,
                paths: args.paths,
                include: vec![],
                exclude: vec![],
                concurrency: args.concurrency,
                filter: args.filter,
                bail: args.bail,
            };

            let (result, output) = vertz_runtime::test::runner::run_tests(config);
            print!("{}", output);

            if !result.success() {
                std::process::exit(1);
            }
        }
    }
}
