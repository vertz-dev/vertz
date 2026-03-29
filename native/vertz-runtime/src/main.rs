mod cli;

use clap::Parser;
use cli::{Cli, Command};
use vertz_runtime::config::ServerConfig;
use vertz_runtime::pm;

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
            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            // Load config file (if present)
            let file_config =
                vertz_runtime::test::config::load_test_config(&root_dir).unwrap_or_default();

            // CLI args override config file, config overrides defaults
            let reporter_str = args
                .reporter
                .as_deref()
                .or(file_config.reporter.as_deref())
                .unwrap_or("terminal");
            let reporter = match reporter_str {
                "json" => vertz_runtime::test::runner::ReporterFormat::Json,
                "junit" => vertz_runtime::test::runner::ReporterFormat::Junit,
                _ => vertz_runtime::test::runner::ReporterFormat::Terminal,
            };

            let config = vertz_runtime::test::runner::TestRunConfig {
                root_dir,
                paths: args.paths,
                include: file_config.include,
                exclude: file_config.exclude,
                concurrency: args.concurrency.or(file_config.concurrency),
                filter: args.filter,
                bail: args.bail,
                timeout_ms: args.timeout.or(file_config.timeout_ms).unwrap_or(5000),
                reporter,
                coverage: args.coverage || file_config.coverage.unwrap_or(false),
                coverage_threshold: args
                    .coverage_threshold
                    .map(|t| t as f64)
                    .or(file_config.coverage_threshold)
                    .unwrap_or(95.0),
                preload: if args.no_preload {
                    vec![]
                } else {
                    file_config.preload
                },
            };

            if args.watch {
                if let Err(e) = vertz_runtime::test::watch::run_watch_mode(config).await {
                    eprintln!("Watch mode error: {}", e);
                    std::process::exit(1);
                }
            } else {
                let (result, output) = vertz_runtime::test::runner::run_tests(config);
                print!("{}", output);

                if !result.success() {
                    std::process::exit(1);
                }
            }
        }
        Command::Install(args) => {
            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            if let Err(e) = pm::install(&root_dir, args.frozen, false).await {
                eprintln!("{}", e);
                std::process::exit(1);
            }
        }
        Command::Add(args) => {
            if args.global {
                eprintln!("error: global packages are not yet supported");
                std::process::exit(1);
            }

            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            let package_refs: Vec<&str> = args.packages.iter().map(|s| s.as_str()).collect();

            if let Err(e) = pm::add(&root_dir, &package_refs, args.dev, args.exact).await {
                eprintln!("{}", e);
                std::process::exit(1);
            }
        }
        Command::Remove(args) => {
            if args.global {
                eprintln!("error: global packages are not yet supported");
                std::process::exit(1);
            }

            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            let package_refs: Vec<&str> = args.packages.iter().map(|s| s.as_str()).collect();

            if let Err(e) = pm::remove(&root_dir, &package_refs).await {
                eprintln!("{}", e);
                std::process::exit(1);
            }
        }
        Command::MigrateTests(args) => {
            let root_dir = args.path.unwrap_or_else(|| {
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
            });

            match vertz_runtime::test::codemod::migrate_tests(&root_dir, args.dry_run) {
                Ok(result) => {
                    let output =
                        vertz_runtime::test::codemod::format_migrate_output(&result, args.dry_run);
                    print!("{}", output);
                }
                Err(e) => {
                    eprintln!("Migration error: {}", e);
                    std::process::exit(1);
                }
            }
        }
    }
}
