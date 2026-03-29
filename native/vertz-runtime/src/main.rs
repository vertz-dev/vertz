mod cli;

use clap::Parser;
use cli::{Cli, Command};
use std::io::IsTerminal;
use std::sync::Arc;
use vertz_runtime::config::ServerConfig;
use vertz_runtime::pm;
use vertz_runtime::pm::output::{error_code_from_message, JsonOutput, PmOutput, TextOutput};

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
                // run_tests creates its own tokio runtimes per-thread, so we must
                // run it from a plain OS thread to avoid nesting with #[tokio::main].
                let handle =
                    std::thread::spawn(move || vertz_runtime::test::runner::run_tests(config));
                let (result, output) = handle.join().expect("test runner thread panicked");
                print!("{}", output);

                if !result.success() {
                    std::process::exit(1);
                }
            }
        }
        Command::Install(args) => {
            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            let output: Arc<dyn PmOutput> = if args.json {
                Arc::new(JsonOutput::new())
            } else {
                Arc::new(TextOutput::new(std::io::stderr().is_terminal()))
            };

            if let Err(e) = pm::install(
                &root_dir,
                args.frozen,
                args.ignore_scripts,
                args.force,
                output.clone(),
            )
            .await
            {
                let msg = e.to_string();
                if args.json {
                    output.error(error_code_from_message(&msg), &msg);
                } else {
                    eprintln!("{}", msg);
                }
                std::process::exit(1);
            }
        }
        Command::Add(args) => {
            if args.global {
                eprintln!("error: global packages are not yet supported");
                std::process::exit(1);
            }
            if args.peer && args.dev {
                eprintln!("error: --peer and --dev cannot be used together");
                std::process::exit(1);
            }

            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            let output: Arc<dyn PmOutput> = if args.json {
                Arc::new(JsonOutput::new())
            } else {
                Arc::new(TextOutput::new(std::io::stderr().is_terminal()))
            };

            let package_refs: Vec<&str> = args.packages.iter().map(|s| s.as_str()).collect();

            if let Err(e) = pm::add(
                &root_dir,
                &package_refs,
                args.dev,
                args.peer,
                args.exact,
                args.ignore_scripts,
                args.workspace.as_deref(),
                output.clone(),
            )
            .await
            {
                let msg = e.to_string();
                if args.json {
                    output.error(error_code_from_message(&msg), &msg);
                } else {
                    eprintln!("{}", msg);
                }
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

            let output: Arc<dyn PmOutput> = if args.json {
                Arc::new(JsonOutput::new())
            } else {
                Arc::new(TextOutput::new(std::io::stderr().is_terminal()))
            };

            let package_refs: Vec<&str> = args.packages.iter().map(|s| s.as_str()).collect();

            if let Err(e) = pm::remove(
                &root_dir,
                &package_refs,
                args.workspace.as_deref(),
                output.clone(),
            )
            .await
            {
                let msg = e.to_string();
                if args.json {
                    output.error(error_code_from_message(&msg), &msg);
                } else {
                    eprintln!("{}", msg);
                }
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
        Command::List(args) => {
            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            let options = pm::ListOptions {
                all: args.all,
                depth: args.depth,
                filter: args.package,
            };

            match pm::list(&root_dir, &options) {
                Ok(entries) => {
                    if args.json {
                        let output = pm::format_list_json(&entries);
                        print!("{}", output);
                    } else {
                        let output = pm::format_list_text(&entries);
                        if output.is_empty() {
                            eprintln!("No dependencies found.");
                        } else {
                            print!("{}", output);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("{}", e);
                    std::process::exit(1);
                }
            }
        }
        Command::Outdated(args) => {
            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            match pm::outdated(&root_dir).await {
                Ok((entries, warnings)) => {
                    if args.json {
                        let output = pm::format_outdated_json(&entries);
                        print!("{}", output);
                        // JSON consumers get warnings as NDJSON error events
                        for warning in &warnings {
                            let obj = serde_json::json!({"event": "warning", "message": warning});
                            println!("{}", obj);
                        }
                    } else {
                        // Print warnings to stderr for human output
                        for warning in &warnings {
                            eprintln!("{}", warning);
                        }
                        if entries.is_empty() {
                            let pkg = vertz_runtime::pm::types::read_package_json(&root_dir).ok();
                            let has_deps = pkg
                                .map(|p| {
                                    !p.dependencies.is_empty() || !p.dev_dependencies.is_empty()
                                })
                                .unwrap_or(false);
                            if has_deps {
                                eprintln!("All packages are up to date.");
                            } else {
                                eprintln!("No dependencies found.");
                            }
                        } else {
                            let output = pm::format_outdated_text(&entries);
                            print!("{}", output);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("{}", e);
                    std::process::exit(1);
                }
            }
        }
        Command::Why(args) => {
            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            match pm::why(&root_dir, &args.package) {
                Ok(result) => {
                    if args.json {
                        let output = pm::format_why_json(&result);
                        print!("{}", output);
                    } else {
                        let output = pm::format_why_text(&result);
                        print!("{}", output);
                    }
                }
                Err(e) => {
                    let msg = e.to_string();
                    if args.json {
                        let output: Arc<dyn PmOutput> = Arc::new(JsonOutput::new());
                        output.error(error_code_from_message(&msg), &msg);
                    } else {
                        eprintln!("{}", msg);
                    }
                    std::process::exit(1);
                }
            }
        }
        Command::Update(args) => {
            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            let output: Arc<dyn PmOutput> = if args.json {
                Arc::new(JsonOutput::new())
            } else {
                Arc::new(TextOutput::new(std::io::stderr().is_terminal()))
            };

            let package_refs: Vec<&str> = args.packages.iter().map(|s| s.as_str()).collect();

            match pm::update(
                &root_dir,
                &package_refs,
                args.latest,
                args.dry_run,
                output.clone(),
            )
            .await
            {
                Ok(results) => {
                    if args.dry_run && !args.json {
                        if results.is_empty() {
                            eprintln!("All packages are up to date.");
                        } else {
                            let text = pm::format_update_dry_run_text(&results);
                            print!("{}", text);
                        }
                    } else if args.dry_run && args.json {
                        let json = pm::format_update_dry_run_json(&results);
                        print!("{}", json);
                    }
                }
                Err(e) => {
                    let msg = e.to_string();
                    if args.json {
                        output.error(error_code_from_message(&msg), &msg);
                    } else {
                        eprintln!("{}", msg);
                    }
                    std::process::exit(1);
                }
            }
        }
        Command::Cache(cache_args) => {
            let cache_dir = pm::registry::default_cache_dir();

            match cache_args.command {
                cli::CacheCommand::Clean(args) => {
                    let result = pm::cache::cache_clean(&cache_dir, args.metadata);
                    if args.json {
                        print!("{}", pm::cache::format_cache_clean_json(&result));
                    } else {
                        eprint!("{}", pm::cache::format_cache_clean_text(&result));
                    }
                }
                cli::CacheCommand::List(args) => {
                    let stats = pm::cache::cache_stats(&cache_dir);
                    if args.json {
                        print!("{}", pm::cache::format_cache_list_json(&stats));
                    } else {
                        eprint!("{}", pm::cache::format_cache_list_text(&stats));
                    }
                }
                cli::CacheCommand::Path => {
                    println!("{}", cache_dir.display());
                }
            }
        }
    }
}
