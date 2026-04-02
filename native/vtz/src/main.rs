mod cli;

use clap::Parser;
use cli::{Cli, Command};
use std::io::IsTerminal;
use std::sync::Arc;
use vertz_runtime::config::{resolve_auto_install, ServerConfig};
use vertz_runtime::pm;
use vertz_runtime::pm::output::{error_code_from_message, JsonOutput, PmOutput, TextOutput};

fn main() {
    let cli = Cli::parse();

    // Desktop mode: webview event loop on main thread, tokio on background
    #[cfg(feature = "desktop")]
    if let Command::Dev(ref args) = cli.command {
        if args.desktop {
            run_desktop_mode(cli);
            return;
        }
    }

    // E2E test mode: webview event loop on main thread, tokio on background
    #[cfg(feature = "desktop")]
    if let Command::Test(ref args) = cli.command {
        if args.e2e {
            run_e2e_test_mode(cli);
            return;
        }
    }

    // Normal mode: tokio runtime on main thread
    let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");
    rt.block_on(async_main(cli));
}

/// Build a ServerConfig from DevArgs (shared between normal and desktop mode).
fn build_dev_config(args: &cli::DevArgs) -> ServerConfig {
    let mut config = ServerConfig::new(args.port, args.host.clone(), args.public_dir.clone());
    config.enable_typecheck = !args.no_typecheck;
    config.open_browser = args.open;
    config.tsconfig_path = args.tsconfig.clone();
    config.typecheck_binary = args.typecheck_binary.clone();
    config.auto_install =
        resolve_auto_install(args.no_auto_install, args.auto_install, &config.root_dir);
    config.watch_deps = !args.no_watch_deps;

    let vertzrc = vertz_runtime::pm::vertzrc::load_vertzrc(&config.root_dir).unwrap_or_default();
    config.plugin = vertz_runtime::config::resolve_plugin_choice(
        args.plugin.as_deref(),
        vertzrc.plugin.as_deref(),
        &config.root_dir,
    );
    config.extra_watch_paths = vertzrc.extra_watch_paths;
    config.proxy_name = args.name.clone();
    config
}

#[cfg(feature = "desktop")]
fn run_desktop_mode(cli: Cli) {
    use vertz_runtime::server::http::{start_server_with_lifecycle, ServerLifecycle};
    use vertz_runtime::webview::{UserEvent, WebviewApp, WebviewOptions};

    let Command::Dev(args) = cli.command else {
        unreachable!()
    };

    let config = build_dev_config(&args);

    // Derive window title from project name or directory
    let title = config
        .root_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "VTZ".to_string());

    let (app, shutdown_rx) = WebviewApp::new(WebviewOptions {
        title,
        width: args.width,
        height: args.height,
        hidden: false,
        devtools: cfg!(debug_assertions),
    })
    .expect("failed to create webview");

    let proxy = app.proxy();

    // Background thread: tokio runtime + dev server
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");
        rt.block_on(async move {
            let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
            let (shutdown_tx, server_shutdown_rx) = tokio::sync::oneshot::channel();

            // Forward ready notification to webview
            let proxy_for_ready = proxy.clone();
            tokio::spawn(async move {
                if let Ok(port) = ready_rx.await {
                    let _ = proxy_for_ready.send_event(UserEvent::ServerReady { port });
                }
            });

            // Forward webview close to server shutdown
            tokio::spawn(async move {
                let _ = shutdown_rx.await;
                let _ = shutdown_tx.send(());
            });

            let lifecycle = ServerLifecycle {
                ready_tx,
                shutdown_rx: server_shutdown_rx,
            };

            if let Err(e) = start_server_with_lifecycle(config, Some(lifecycle)).await {
                eprintln!("Error: {}", e);
                std::process::exit(1);
            }
        });
    });

    // Main thread: run the native event loop (blocks forever)
    app.run();
}

/// E2E test mode: hidden webview on main thread, tokio + test runner on background thread.
#[cfg(feature = "desktop")]
fn run_e2e_test_mode(cli: Cli) {
    use vertz_runtime::test::e2e_runner::run_e2e_tests;
    use vertz_runtime::webview::{UserEvent, WebviewApp, WebviewOptions};

    let Command::Test(args) = cli.command else {
        unreachable!()
    };

    let root_dir = args.root_dir.unwrap_or_else(|| {
        std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
    });

    let headed = args.headed || args.devtools;

    let (app, _shutdown_rx) = WebviewApp::new(WebviewOptions {
        title: "VTZ E2E".to_string(),
        width: 1024,
        height: 768,
        hidden: !headed,
        devtools: args.devtools,
    })
    .expect("failed to create webview");

    let proxy = app.proxy();
    // Load config file (if present)
    let file_config = vertz_runtime::test::config::load_test_config(&root_dir).unwrap_or_default();

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

    let test_config = vertz_runtime::test::runner::TestRunConfig {
        root_dir: root_dir.clone(),
        paths: args.paths,
        include: file_config.include,
        exclude: file_config.exclude,
        concurrency: args.concurrency.or(file_config.concurrency),
        filter: args.filter,
        bail: args.bail,
        timeout_ms: args.timeout.or(file_config.timeout_ms).unwrap_or(30_000),
        reporter,
        coverage: false,
        coverage_threshold: 0.0,
        preload: if args.no_preload {
            vec![]
        } else {
            file_config.preload
        },
        no_cache: args.no_cache,
    };

    // Build a server config for the e2e dev server (port 0 = OS-assigned)
    let mut server_config = ServerConfig::new(0, "127.0.0.1".to_string(), None);
    server_config.root_dir = root_dir;

    let proxy_for_quit = proxy.clone();

    // Background thread: tokio runtime + e2e test runner
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("failed to create tokio runtime");

        rt.block_on(async move {
            let (result, output) = run_e2e_tests(test_config, server_config, proxy).await;
            print!("{}", output);

            let code = if result.success() { 0 } else { 1 };

            // Signal the webview to close, then exit with the test result code
            let _ = proxy_for_quit.send_event(UserEvent::Quit);
            // Give the event loop a moment to process Quit before forcing exit
            std::thread::sleep(std::time::Duration::from_millis(100));
            std::process::exit(code);
        });
    });

    // Main thread: run the native event loop (blocks until Quit event)
    app.run();
}

async fn async_main(cli: Cli) {
    match cli.command {
        Command::Create(args) => {
            let output: Arc<dyn pm::output::PmOutput> =
                Arc::new(TextOutput::new(std::io::stderr().is_terminal()));

            if let Err(e) =
                pm::create::create(&args.template, args.destination.as_deref(), output).await
            {
                eprintln!("error: {}", e);
                std::process::exit(1);
            }
        }
        Command::Dev(args) => {
            let config = build_dev_config(&args);

            if let Err(e) = vertz_runtime::server::http::start_server(config).await {
                eprintln!("Error: {}", e);
                std::process::exit(1);
            }
        }
        Command::Test(args) => {
            let root_dir = args.root_dir.unwrap_or_else(|| {
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
            });

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
                no_cache: args.no_cache,
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

            let script_policy = if args.ignore_scripts {
                pm::vertzrc::ScriptPolicy::IgnoreAll
            } else if args.run_scripts {
                pm::vertzrc::ScriptPolicy::RunAll
            } else {
                pm::vertzrc::ScriptPolicy::TrustBased
            };

            if let Err(e) = pm::install(
                &root_dir,
                args.frozen,
                script_policy,
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
            let exclusive_count = [args.dev, args.peer, args.optional]
                .iter()
                .filter(|&&x| x)
                .count();
            if exclusive_count > 1 {
                eprintln!("error: --dev, --peer, and --optional are mutually exclusive");
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

            let script_policy = if args.ignore_scripts {
                pm::vertzrc::ScriptPolicy::IgnoreAll
            } else if args.run_scripts {
                pm::vertzrc::ScriptPolicy::RunAll
            } else {
                pm::vertzrc::ScriptPolicy::TrustBased
            };

            if let Err(e) = pm::add(
                &root_dir,
                &package_refs,
                args.dev,
                args.peer,
                args.optional,
                args.exact,
                script_policy,
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
        Command::Audit(args) => {
            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            let severity_threshold = vertz_runtime::pm::types::Severity::parse(
                args.severity.as_deref().unwrap_or("low"),
            )
            .unwrap_or(vertz_runtime::pm::types::Severity::Low);

            if args.dry_run && !args.fix {
                eprintln!("error: --dry-run requires --fix");
                std::process::exit(1);
            }

            if args.fix {
                // --fix mode: audit + attempt fixes
                if !args.json {
                    let lockfile_path = root_dir.join("vertz.lock");
                    if lockfile_path.exists() {
                        if let Ok(lf) = vertz_runtime::pm::lockfile::read_lockfile(&lockfile_path) {
                            let pkg_count = lf
                                .entries
                                .values()
                                .filter(|e| !e.resolved.starts_with("link:"))
                                .map(|e| &e.name)
                                .collect::<std::collections::HashSet<_>>()
                                .len();
                            eprintln!("Scanning {} packages for vulnerabilities...", pkg_count);
                        }
                    }
                }

                match pm::audit_fix(&root_dir, severity_threshold, args.dry_run).await {
                    Ok(result) => {
                        if args.json {
                            let audit_json = pm::format_audit_json(
                                &result.audit.entries,
                                result.audit.total_packages,
                                result.audit.below_threshold,
                            );
                            print!("{}", audit_json);
                            for be in &result.audit.batch_errors {
                                let obj = serde_json::json!({"event": "batch_error", "batch": be.batch, "error": be.error});
                                println!("{}", obj);
                            }
                            for warning in &result.audit.warnings {
                                let obj =
                                    serde_json::json!({"event": "warning", "message": warning});
                                println!("{}", obj);
                            }
                            let fix_json = pm::format_fix_json(&result.fixed, &result.manual);
                            print!("{}", fix_json);
                        } else {
                            for warning in &result.audit.warnings {
                                eprintln!("{}", warning);
                            }
                            if !result.audit.entries.is_empty() {
                                let table = pm::format_audit_text(&result.audit.entries);
                                print!("{}", table);
                            }
                            eprintln!(
                                "{}",
                                pm::format_audit_summary(
                                    &result.audit.entries,
                                    result.audit.below_threshold
                                )
                            );
                            let fix_text =
                                pm::format_fix_text(&result.fixed, &result.manual, args.dry_run);
                            if !fix_text.is_empty() {
                                eprint!("{}", fix_text);
                            }
                        }

                        // Exit 1 if unfixed vulns remain. A single fix resolves
                        // all advisories for that package, so compare unique
                        // package names, not raw advisory count.
                        let fixed_names: std::collections::HashSet<&str> =
                            result.fixed.iter().map(|f| f.name.as_str()).collect();
                        let has_unfixed = result
                            .audit
                            .entries
                            .iter()
                            .any(|e| !fixed_names.contains(e.name.as_str()));
                        if has_unfixed || !result.manual.is_empty() {
                            std::process::exit(1);
                        }
                    }
                    Err(e) => {
                        if args.json {
                            let obj =
                                serde_json::json!({"event": "error", "message": e.to_string()});
                            println!("{}", obj);
                        } else {
                            eprintln!("{}", e);
                        }
                        std::process::exit(1);
                    }
                }
                return;
            }

            // Print scanning message before the (potentially slow) network call
            if !args.json {
                let lockfile_path = root_dir.join("vertz.lock");
                if lockfile_path.exists() {
                    if let Ok(lf) = vertz_runtime::pm::lockfile::read_lockfile(&lockfile_path) {
                        let pkg_count = lf
                            .entries
                            .values()
                            .filter(|e| !e.resolved.starts_with("link:"))
                            .map(|e| &e.name)
                            .collect::<std::collections::HashSet<_>>()
                            .len();
                        eprintln!("Scanning {} packages for vulnerabilities...", pkg_count);
                    }
                }
            }

            match pm::audit(&root_dir, severity_threshold).await {
                Ok(result) => {
                    if args.json {
                        let output = pm::format_audit_json(
                            &result.entries,
                            result.total_packages,
                            result.below_threshold,
                        );
                        print!("{}", output);
                        for be in &result.batch_errors {
                            let obj = serde_json::json!({"event": "batch_error", "batch": be.batch, "error": be.error});
                            println!("{}", obj);
                        }
                        for warning in &result.warnings {
                            let obj = serde_json::json!({"event": "warning", "message": warning});
                            println!("{}", obj);
                        }
                    } else {
                        for warning in &result.warnings {
                            eprintln!("{}", warning);
                        }
                        if !result.entries.is_empty() {
                            let output = pm::format_audit_text(&result.entries);
                            print!("{}", output);
                        }
                        eprintln!(
                            "{}",
                            pm::format_audit_summary(&result.entries, result.below_threshold)
                        );
                    }

                    if !result.entries.is_empty() {
                        std::process::exit(1);
                    }
                }
                Err(e) => {
                    if args.json {
                        let obj = serde_json::json!({"event": "error", "message": e.to_string()});
                        println!("{}", obj);
                    } else {
                        eprintln!("{}", e);
                    }
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
        Command::Run(args) => {
            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            match args.script {
                None => {
                    // No script name — list available scripts
                    match pm::list_scripts(&root_dir, args.workspace.as_deref()) {
                        Ok(scripts) => {
                            if scripts.is_empty() {
                                eprintln!("No scripts found in package.json");
                            } else {
                                for (name, cmd) in &scripts {
                                    println!("  {}: {}", name, cmd);
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("{}", e);
                            std::process::exit(1);
                        }
                    }
                }
                Some(script_name) => {
                    match pm::run_script(
                        &root_dir,
                        &script_name,
                        &args.args,
                        args.workspace.as_deref(),
                    )
                    .await
                    {
                        Ok(code) => {
                            if code != 0 {
                                std::process::exit(code);
                            }
                        }
                        Err(e) => {
                            eprintln!("{}", e);
                            std::process::exit(1);
                        }
                    }
                }
            }
        }
        Command::Exec(args) => {
            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            match pm::exec_command(
                &root_dir,
                &args.command,
                &args.args,
                args.workspace.as_deref(),
            )
            .await
            {
                Ok(code) => {
                    if code != 0 {
                        std::process::exit(code);
                    }
                }
                Err(e) => {
                    eprintln!("{}", e);
                    std::process::exit(1);
                }
            }
        }
        Command::Publish(args) => {
            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            let output: Arc<dyn PmOutput> = if args.json {
                Arc::new(JsonOutput::new())
            } else {
                Arc::new(TextOutput::new(std::io::stderr().is_terminal()))
            };

            if let Err(e) = pm::publish(
                &root_dir,
                &args.tag,
                args.access.as_deref(),
                args.dry_run,
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
        Command::Patch(patch_args) => {
            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            match patch_args.command {
                Some(cli::PatchCommand::Save(args)) => {
                    match pm::patch::patch_save(&root_dir, &args.package) {
                        Ok(result) => {
                            if result.no_changes {
                                if args.json {
                                    println!(
                                        "{}",
                                        serde_json::json!({
                                            "event": "patch_no_changes",
                                            "package": result.name,
                                            "version": result.version,
                                        })
                                    );
                                } else {
                                    eprintln!(
                                        "warning: no changes detected in \"{}\". Skipping patch creation.",
                                        result.name
                                    );
                                }
                                // Exit 0 — no changes is a warning, not an error
                            } else if args.json {
                                println!(
                                    "{}",
                                    serde_json::json!({
                                        "event": "patch_saved",
                                        "package": result.name,
                                        "version": result.version,
                                        "path": result.patch_path,
                                        "files_changed": result.files_changed,
                                    })
                                );
                            } else {
                                eprintln!(
                                    "Patch saved: {} ({} file{} changed) \u{2713}",
                                    result.patch_path,
                                    result.files_changed,
                                    if result.files_changed == 1 { "" } else { "s" },
                                );
                                eprintln!("Updated package.json with patch reference.");
                            }
                        }
                        Err(e) => {
                            let msg = e.to_string();
                            if args.json {
                                let output: Arc<dyn PmOutput> =
                                    Arc::new(pm::output::JsonOutput::new());
                                output.error(error_code_from_message(&msg), &msg);
                            } else {
                                eprintln!("{}", msg);
                            }
                            std::process::exit(1);
                        }
                    }
                }
                Some(cli::PatchCommand::Discard(args)) => {
                    match pm::patch::patch_discard(&root_dir, &args.package) {
                        Ok(result) => {
                            if args.json {
                                println!(
                                    "{}",
                                    serde_json::json!({
                                        "event": "patch_discarded",
                                        "package": result.name,
                                        "version": result.version,
                                    })
                                );
                            } else {
                                eprintln!(
                                    "Discarded in-progress changes for {}@{}.",
                                    result.name, result.version
                                );
                                if let Some(patch_path) = &result.patch_path {
                                    eprintln!("Re-applied saved patch: {} \u{2713}", patch_path);
                                }
                            }
                        }
                        Err(e) => {
                            let msg = e.to_string();
                            if args.json {
                                let output: Arc<dyn PmOutput> =
                                    Arc::new(pm::output::JsonOutput::new());
                                output.error(error_code_from_message(&msg), &msg);
                            } else {
                                eprintln!("{}", msg);
                            }
                            std::process::exit(1);
                        }
                    }
                }
                Some(cli::PatchCommand::List(args)) => {
                    let result = pm::patch::patch_list(&root_dir);

                    if args.json {
                        for (name, version) in &result.active {
                            println!(
                                "{}",
                                serde_json::json!({
                                    "event": "patch_active",
                                    "package": name,
                                    "version": version,
                                })
                            );
                        }
                        for (key, path) in &result.saved {
                            let name =
                                pm::patch::parse_patch_key_name_pub(key).unwrap_or(key.as_str());
                            let version = if name.len() < key.len() {
                                &key[name.len() + 1..] // skip "name@"
                            } else {
                                ""
                            };
                            println!(
                                "{}",
                                serde_json::json!({
                                    "event": "patch_saved",
                                    "package": name,
                                    "version": version,
                                    "path": path,
                                })
                            );
                        }
                    } else if result.active.is_empty() && result.saved.is_empty() {
                        eprintln!("No patches found.");
                    } else {
                        if !result.active.is_empty() {
                            eprintln!("Active patches (in progress):");
                            for (name, version) in &result.active {
                                eprintln!("  {}@{} (editing)", name, version);
                            }
                            eprintln!();
                        }
                        if !result.saved.is_empty() {
                            eprintln!("Saved patches:");
                            for (key, path) in &result.saved {
                                eprintln!("  {} \u{2192} {}", key, path);
                            }
                        }
                    }
                }
                None => {
                    // Default action: prepare package for patching
                    let package = match patch_args.package {
                        Some(p) => p,
                        None => {
                            eprintln!("error: package name required. Usage: vertz patch <package>");
                            std::process::exit(1);
                        }
                    };
                    match pm::patch::patch_prepare(&root_dir, &package) {
                        Ok(result) => {
                            if patch_args.json {
                                println!(
                                    "{}",
                                    serde_json::json!({
                                        "event": "patch_prepared",
                                        "package": result.name,
                                        "version": result.version,
                                    })
                                );
                            } else {
                                eprintln!(
                                    "Prepared {}@{} for patching.",
                                    result.name, result.version
                                );
                                eprintln!();
                                eprintln!("Edit files in node_modules/{}/ then run:", result.name);
                                eprintln!("  vertz patch save {}", result.name);
                            }
                        }
                        Err(e) => {
                            let msg = e.to_string();
                            if patch_args.json {
                                let output: Arc<dyn PmOutput> =
                                    Arc::new(pm::output::JsonOutput::new());
                                output.error(error_code_from_message(&msg), &msg);
                            } else {
                                eprintln!("{}", msg);
                            }
                            std::process::exit(1);
                        }
                    }
                }
            }
        }
        Command::Config(config_args) => {
            let root_dir =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

            match config_args.command {
                cli::ConfigCommand::Set(args) => {
                    if args.key != "trust-scripts" {
                        eprintln!("error: unknown config key: {}", args.key);
                        std::process::exit(1);
                    }
                    match pm::vertzrc::config_set_trust_scripts(&root_dir, &args.values) {
                        Ok(removed) => {
                            for name in &removed {
                                eprintln!("removed: {}", name);
                            }
                            eprintln!("trustScripts set to: {}", args.values.join(", "));
                        }
                        Err(e) => {
                            eprintln!("{}", e);
                            std::process::exit(1);
                        }
                    }
                }
                cli::ConfigCommand::Add(args) => {
                    if args.key != "trust-scripts" {
                        eprintln!("error: unknown config key: {}", args.key);
                        std::process::exit(1);
                    }
                    if let Err(e) = pm::vertzrc::config_add_trust_scripts(&root_dir, &args.values) {
                        eprintln!("{}", e);
                        std::process::exit(1);
                    }
                    eprintln!("added to trustScripts: {}", args.values.join(", "));
                }
                cli::ConfigCommand::Remove(args) => {
                    if args.key != "trust-scripts" {
                        eprintln!("error: unknown config key: {}", args.key);
                        std::process::exit(1);
                    }
                    match pm::vertzrc::config_remove_trust_scripts(&root_dir, &args.values) {
                        Ok(removed) => {
                            if removed.is_empty() {
                                eprintln!("no matching entries found");
                            } else {
                                eprintln!("removed from trustScripts: {}", removed.join(", "));
                            }
                        }
                        Err(e) => {
                            eprintln!("{}", e);
                            std::process::exit(1);
                        }
                    }
                }
                cli::ConfigCommand::Get(args) => {
                    if args.key != "trust-scripts" {
                        eprintln!("error: unknown config key: {}", args.key);
                        std::process::exit(1);
                    }
                    match pm::vertzrc::config_get_trust_scripts(&root_dir) {
                        Ok(scripts) => {
                            if scripts.is_empty() {
                                println!("trustScripts: (empty)");
                            } else {
                                for s in &scripts {
                                    println!("  {}", s);
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("{}", e);
                            std::process::exit(1);
                        }
                    }
                }
                cli::ConfigCommand::Init(args) => {
                    if args.key != "trust-scripts" {
                        eprintln!("error: unknown config key: {}", args.key);
                        std::process::exit(1);
                    }
                    match pm::vertzrc::config_init_trust_scripts(&root_dir) {
                        Ok(names) => {
                            if names.is_empty() {
                                eprintln!("No packages with postinstall scripts found.");
                            } else {
                                eprintln!("Added {} packages to trustScripts:", names.len());
                                for name in &names {
                                    eprintln!("  {}", name);
                                }
                            }
                        }
                        Err(e) => {
                            eprintln!("{}", e);
                            std::process::exit(1);
                        }
                    }
                }
            }
        }
        Command::Proxy(proxy_args) => {
            use vertz_runtime::proxy::{daemon, hosts, routes, tls};

            let proxy_dir = routes::proxy_dir();
            let routes_dir = routes::routes_dir();

            match proxy_args.command {
                cli::ProxyCommand::Init(args) => {
                    // Clean stale routes first
                    let removed = routes::clean_stale_routes();
                    for name in &removed {
                        eprintln!("Cleaned stale route: {}", name);
                    }

                    // Generate CA + server certs if not already present
                    if !tls::has_server_cert(&proxy_dir) {
                        eprintln!("Generating TLS certificates...");
                        if let Err(e) = tls::generate_ca(&proxy_dir) {
                            eprintln!("Failed to generate CA: {}", e);
                            std::process::exit(1);
                        }
                        if let Err(e) = tls::generate_server_cert(&proxy_dir) {
                            eprintln!("Failed to generate server cert: {}", e);
                            std::process::exit(1);
                        }
                        eprintln!("TLS certificates generated.");
                        eprintln!("  CA cert: {}/ca-cert.pem", proxy_dir.display());
                        eprintln!();
                        eprintln!(
                            "To trust the CA (macOS), run:\n  sudo security add-trusted-cert -d -r trustRoot \
                             -k /Library/Keychains/System.keychain {}/ca-cert.pem",
                            proxy_dir.display()
                        );
                        eprintln!();
                    }

                    // Start the proxy daemon with TLS
                    let cert_path = proxy_dir.join("server-cert.pem");
                    let key_path = proxy_dir.join("server-key.pem");
                    eprintln!("Starting HTTPS proxy on port {}...", args.port);
                    match daemon::start_proxy_tls(args.port, routes_dir, cert_path, key_path).await
                    {
                        Ok((actual_port, handle)) => {
                            daemon::write_pid_file(&proxy_dir, std::process::id()).unwrap_or_else(
                                |e| {
                                    eprintln!("Warning: failed to write PID file: {}", e);
                                },
                            );
                            daemon::write_port_file(&proxy_dir, actual_port).unwrap_or_else(|e| {
                                eprintln!("Warning: failed to write port file: {}", e);
                            });
                            eprintln!(
                                "\n\u{25b2} Vertz Proxy running on https://localhost:{}\n",
                                actual_port
                            );
                            eprintln!(
                                "  Dev servers will auto-register when started with `vtz dev`."
                            );
                            eprintln!("  Dashboard: https://localhost:{}\n", actual_port);

                            // Block until the server exits
                            handle.await.ok();
                            daemon::remove_pid_file(&proxy_dir).ok();
                            daemon::remove_port_file(&proxy_dir).ok();
                        }
                        Err(e) => {
                            eprintln!("Failed to start proxy: {}", e);
                            std::process::exit(1);
                        }
                    }
                }
                cli::ProxyCommand::Start(args) => {
                    // Check if already running
                    if let Some(pid) = daemon::read_pid_file(&proxy_dir) {
                        if routes::is_pid_alive(pid) {
                            eprintln!("Proxy is already running (PID {})", pid);
                            std::process::exit(0);
                        }
                        // Stale PID file — clean up
                        daemon::remove_pid_file(&proxy_dir).ok();
                    }

                    // Clean stale routes
                    routes::clean_stale_routes();

                    // Start with TLS if certs are available, otherwise HTTP
                    let use_tls = tls::has_server_cert(&proxy_dir);
                    let result = if use_tls {
                        let cert_path = proxy_dir.join("server-cert.pem");
                        let key_path = proxy_dir.join("server-key.pem");
                        eprintln!("Starting HTTPS proxy on port {}...", args.port);
                        daemon::start_proxy_tls(args.port, routes_dir, cert_path, key_path).await
                    } else {
                        eprintln!("Starting HTTP proxy on port {}...", args.port);
                        eprintln!("  (Run `vtz proxy init` first for HTTPS support)");
                        daemon::start_proxy(args.port, routes_dir).await
                    };

                    match result {
                        Ok((actual_port, handle)) => {
                            daemon::write_pid_file(&proxy_dir, std::process::id()).unwrap_or_else(
                                |e| {
                                    eprintln!("Warning: failed to write PID file: {}", e);
                                },
                            );
                            daemon::write_port_file(&proxy_dir, actual_port).unwrap_or_else(|e| {
                                eprintln!("Warning: failed to write port file: {}", e);
                            });
                            let scheme = if use_tls { "https" } else { "http" };
                            eprintln!(
                                "\u{25b2} Vertz Proxy running on {}://localhost:{}",
                                scheme, actual_port
                            );
                            handle.await.ok();
                            daemon::remove_pid_file(&proxy_dir).ok();
                            daemon::remove_port_file(&proxy_dir).ok();
                        }
                        Err(e) => {
                            eprintln!("Failed to start proxy: {}", e);
                            std::process::exit(1);
                        }
                    }
                }
                cli::ProxyCommand::Stop => {
                    match daemon::read_pid_file(&proxy_dir) {
                        Some(pid) => {
                            if routes::is_pid_alive(pid) {
                                // SAFETY: Sending SIGTERM to a known PID from our own PID file.
                                unsafe {
                                    libc::kill(pid as libc::pid_t, libc::SIGTERM);
                                }
                                // Verify the process actually stopped
                                let mut stopped = false;
                                for _ in 0..10 {
                                    std::thread::sleep(std::time::Duration::from_millis(200));
                                    if !routes::is_pid_alive(pid) {
                                        stopped = true;
                                        break;
                                    }
                                }
                                if stopped {
                                    eprintln!("Stopped proxy (PID {})", pid);
                                } else {
                                    eprintln!(
                                        "Warning: proxy (PID {}) did not stop; you may need to `kill -9 {}`",
                                        pid, pid
                                    );
                                }
                            } else {
                                eprintln!("Proxy is not running (stale PID file)");
                            }
                            daemon::remove_pid_file(&proxy_dir).ok();
                        }
                        None => {
                            eprintln!("Proxy is not running");
                        }
                    }
                }
                cli::ProxyCommand::Status => {
                    // Clean stale routes first
                    routes::clean_stale_routes();
                    let entries = routes::load_all_routes();

                    // Check if proxy daemon is running
                    let proxy_running = daemon::read_pid_file(&proxy_dir)
                        .map(routes::is_pid_alive)
                        .unwrap_or(false);

                    if proxy_running {
                        eprintln!("\u{25b2} Vertz Proxy — running");
                    } else {
                        eprintln!("\u{25b2} Vertz Proxy — stopped");
                    }
                    eprintln!();

                    if entries.is_empty() {
                        eprintln!("  No dev servers registered.");
                    } else {
                        let header_status = "STATUS";
                        eprintln!(
                            "  {:<30} {:<8} {:<20} {:<8} {}",
                            "SUBDOMAIN", "PORT", "BRANCH", "PID", header_status
                        );
                        for entry in &entries {
                            let status = if routes::is_pid_alive(entry.pid) {
                                "\u{25cf} connected"
                            } else {
                                "\u{25cb} disconnected"
                            };
                            eprintln!(
                                "  {:<30} {:<8} {:<20} {:<8} {}",
                                entry.subdomain, entry.port, entry.branch, entry.pid, status
                            );
                        }
                    }
                    eprintln!();
                }
                cli::ProxyCommand::Trust => {
                    if !cfg!(target_os = "macos") {
                        eprintln!("Trust store installation is only supported on macOS.");
                        eprintln!(
                            "On Linux, manually add the CA cert to your system's trust store."
                        );
                        std::process::exit(1);
                    }
                    let ca_path = tls::ca_cert_path(&proxy_dir);
                    if !ca_path.exists() {
                        eprintln!("No CA certificate found. Run `vtz proxy init` first.");
                        std::process::exit(1);
                    }
                    let (cmd, args) = tls::trust_store_command(&proxy_dir);
                    eprintln!("Installing CA certificate in system trust store...");
                    eprintln!("  Running: sudo {} {}", cmd, args.join(" "));
                    let status = std::process::Command::new("sudo")
                        .arg(&cmd)
                        .args(&args)
                        .status();
                    match status {
                        Ok(s) if s.success() => {
                            eprintln!("CA certificate trusted successfully.");
                        }
                        Ok(s) => {
                            eprintln!("Trust installation failed (exit code: {:?})", s.code());
                            std::process::exit(1);
                        }
                        Err(e) => {
                            eprintln!("Failed to run security command: {}", e);
                            std::process::exit(1);
                        }
                    }
                }
                cli::ProxyCommand::SyncHosts => {
                    routes::clean_stale_routes();
                    let block = hosts::generate_hosts_block();
                    if block.is_empty() {
                        eprintln!("No dev servers registered. Nothing to sync.");
                        std::process::exit(0);
                    }
                    let hosts_content = std::fs::read_to_string("/etc/hosts").unwrap_or_default();
                    let merged = hosts::merge_into_hosts(&hosts_content, &block);
                    let tmp_path = proxy_dir.join("hosts.tmp");
                    if let Err(e) = std::fs::write(&tmp_path, &merged) {
                        eprintln!("Failed to write temp hosts file: {}", e);
                        std::process::exit(1);
                    }
                    eprintln!("Syncing /etc/hosts with registered dev servers...");
                    let status = std::process::Command::new("sudo")
                        .args(["cp", &tmp_path.display().to_string(), "/etc/hosts"])
                        .status();
                    std::fs::remove_file(&tmp_path).ok();
                    match status {
                        Ok(s) if s.success() => {
                            eprintln!("Hosts file updated successfully.");
                        }
                        Ok(s) => {
                            eprintln!("Failed to update /etc/hosts (exit code: {:?})", s.code());
                            std::process::exit(1);
                        }
                        Err(e) => {
                            eprintln!("Failed to run sudo cp: {}", e);
                            std::process::exit(1);
                        }
                    }
                }
            }
        }
    }
}
