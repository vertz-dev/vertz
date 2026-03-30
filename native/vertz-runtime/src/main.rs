mod cli;

use clap::Parser;
use cli::{Cli, Command};
use std::io::IsTerminal;
use std::sync::Arc;
use vertz_runtime::config::{resolve_auto_install, ServerConfig};
use vertz_runtime::pm;
use vertz_runtime::pm::output::{error_code_from_message, JsonOutput, PmOutput, TextOutput};

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    match cli.command {
        Command::Dev(args) => {
            let mut config = ServerConfig::new(args.port, args.host, args.public_dir);
            config.enable_typecheck = !args.no_typecheck;
            config.open_browser = args.open;
            config.tsconfig_path = args.tsconfig;
            config.typecheck_binary = args.typecheck_binary;

            // Resolve auto_install: CLI flag > .vertzrc > CI guard > default
            config.auto_install =
                resolve_auto_install(args.no_auto_install, args.auto_install, &config.root_dir);

            // Wire --no-watch-deps flag
            config.watch_deps = !args.no_watch_deps;

            // Load extraWatchPaths from .vertzrc
            if let Ok(vertzrc) = vertz_runtime::pm::vertzrc::load_vertzrc(&config.root_dir) {
                config.extra_watch_paths = vertzrc.extra_watch_paths;
            }

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
    }
}
