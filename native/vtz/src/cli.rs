use clap::{Parser, Subcommand};
use std::path::PathBuf;

/// Version from VERTZ_VERSION env var (set by CI from npm package version),
/// falling back to CARGO_PKG_VERSION for local dev builds.
const VERSION: &str = match option_env!("VERTZ_VERSION") {
    Some(v) if !v.is_empty() => v,
    _ => env!("CARGO_PKG_VERSION"),
};

#[derive(Parser, Debug)]
#[command(name = "vtz", version = VERSION, about = "Vertz Development Runtime")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Create a new project from a template
    Create(CreateArgs),
    /// Start the development server
    Dev(DevArgs),
    /// Run tests
    Test(TestArgs),
    /// Install all dependencies from package.json
    #[command(alias = "i")]
    Install(InstallArgs),
    /// Add packages to dependencies
    Add(AddArgs),
    /// Remove packages from dependencies
    #[command(alias = "rm")]
    Remove(RemoveArgs),
    /// Migrate test files from bun:test to @vertz/test
    MigrateTests(MigrateTestsArgs),
    /// List installed packages
    #[command(alias = "ls")]
    List(ListArgs),
    /// Show why a package is installed (dependency path tracing)
    Why(WhyArgs),
    /// Scan installed packages for known vulnerabilities
    Audit(AuditArgs),
    /// Check for newer versions of installed packages
    Outdated(OutdatedArgs),
    /// Update packages to newer versions
    #[command(alias = "up")]
    Update(UpdateArgs),
    /// Manage the package cache
    Cache(CacheArgs),
    /// Run a package.json script
    Run(RunArgs),
    /// Execute a command with node_modules/.bin on PATH
    Exec(ExecArgs),
    /// Manage project configuration (.vertzrc)
    Config(ConfigArgs),
    /// Publish package to npm registry
    Publish(PublishArgs),
    /// Patch installed dependencies
    Patch(PatchArgs),
    /// Manage the local development proxy
    Proxy(ProxyArgs),
}

#[derive(Parser, Debug)]
pub struct CreateArgs {
    /// Template: short name (react), owner/repo, or https://github.com/owner/repo
    #[arg(required = true)]
    pub template: String,

    /// Destination directory (defaults to repo name)
    pub destination: Option<String>,
}

#[derive(Parser, Debug)]
pub struct DevArgs {
    /// Port to listen on
    #[arg(long, default_value_t = 3000)]
    pub port: u16,

    /// Host to bind to
    #[arg(long, default_value = "localhost")]
    pub host: String,

    /// Open browser after server starts
    #[arg(long)]
    pub open: bool,

    /// Directory to serve static files from
    #[arg(long, default_value = "public")]
    pub public_dir: PathBuf,

    /// Disable auto-install of missing packages
    #[arg(long)]
    pub no_auto_install: bool,

    /// Force-enable auto-install (overrides CI guard and .vertzrc)
    #[arg(long, conflicts_with = "no_auto_install")]
    pub auto_install: bool,

    /// Disable TypeScript type checking (tsc/tsgo)
    #[arg(long)]
    pub no_typecheck: bool,

    /// Custom tsconfig path (default: auto-detect)
    #[arg(long)]
    pub tsconfig: Option<PathBuf>,

    /// Explicit type checker binary path (skips auto-detection)
    #[arg(long)]
    pub typecheck_binary: Option<PathBuf>,

    /// Disable upstream dependency watching (auto-discovery + extra paths)
    #[arg(long)]
    pub no_watch_deps: bool,

    /// Framework plugin to use (vertz, react). Auto-detected from package.json if omitted.
    #[arg(long)]
    pub plugin: Option<String>,

    /// Custom name for proxy subdomain override (e.g., --name dashboard → https://dashboard.localhost)
    #[arg(long)]
    pub name: Option<String>,

    /// Open the app in a native desktop window instead of a browser tab (requires desktop feature)
    #[cfg(feature = "desktop")]
    #[arg(long)]
    pub desktop: bool,

    /// Initial window width in pixels (only with --desktop)
    #[cfg(feature = "desktop")]
    #[arg(long, default_value_t = 1024, requires = "desktop")]
    pub width: u32,

    /// Initial window height in pixels (only with --desktop)
    #[cfg(feature = "desktop")]
    #[arg(long, default_value_t = 768, requires = "desktop")]
    pub height: u32,
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

    /// Minimum coverage percentage (default: 95, overrides vertz.config.ts)
    #[arg(long)]
    pub coverage_threshold: Option<u32>,

    /// Timeout per test in milliseconds (default: 5000, overrides vertz.config.ts)
    #[arg(long)]
    pub timeout: Option<u64>,

    /// Max parallel test files (default: CPU count)
    #[arg(long)]
    pub concurrency: Option<usize>,

    /// Reporter format (default: terminal, overrides vertz.config.ts)
    #[arg(long)]
    pub reporter: Option<String>,

    /// Stop after first test failure
    #[arg(long)]
    pub bail: bool,

    /// Skip preload scripts
    #[arg(long)]
    pub no_preload: bool,

    /// Workspace root directory for module resolution (default: current directory)
    #[arg(long)]
    pub root_dir: Option<PathBuf>,

    /// Skip compilation cache (compile everything fresh)
    #[arg(long)]
    pub no_cache: bool,

    /// Run e2e tests (requires desktop feature: discovers *.e2e.ts files, starts dev server + webview)
    #[cfg(feature = "desktop")]
    #[arg(long)]
    pub e2e: bool,

    /// Show the webview window during e2e tests (only valid with --e2e)
    #[cfg(feature = "desktop")]
    #[arg(long, requires = "e2e")]
    pub headed: bool,

    /// Open devtools in the webview during e2e tests (implies --headed, only valid with --e2e)
    #[cfg(feature = "desktop")]
    #[arg(long, requires = "e2e")]
    pub devtools: bool,
}

#[derive(Parser, Debug)]
pub struct InstallArgs {
    /// Fail if lockfile is out of date (CI mode)
    #[arg(long, alias = "frozen-lockfile")]
    pub frozen: bool,

    /// Skip postinstall scripts
    #[arg(long, conflicts_with = "run_scripts")]
    pub ignore_scripts: bool,

    /// Force all postinstall scripts to run (bypasses trust list)
    #[arg(long, conflicts_with = "ignore_scripts")]
    pub run_scripts: bool,

    /// Force full re-link (skip incremental check)
    #[arg(long)]
    pub force: bool,

    /// Output NDJSON to stdout
    #[arg(long)]
    pub json: bool,
}

#[derive(Parser, Debug)]
pub struct AddArgs {
    /// Package specifiers (e.g., zod, react@^18.0.0, @vertz/ui@^0.1.0)
    #[arg(required = true)]
    pub packages: Vec<String>,

    /// Add to devDependencies
    #[arg(short = 'D', long)]
    pub dev: bool,

    /// Add to peerDependencies
    #[arg(short = 'P', long)]
    pub peer: bool,

    /// Add to optionalDependencies
    #[arg(short = 'O', long)]
    pub optional: bool,

    /// Pin exact version (no ^ prefix)
    #[arg(short = 'E', long)]
    pub exact: bool,

    /// Install globally (not yet supported)
    #[arg(short = 'g', long)]
    pub global: bool,

    /// Skip postinstall scripts
    #[arg(long, conflicts_with = "run_scripts")]
    pub ignore_scripts: bool,

    /// Force all postinstall scripts to run (bypasses trust list)
    #[arg(long, conflicts_with = "ignore_scripts")]
    pub run_scripts: bool,

    /// Target a specific workspace package (by name or path)
    #[arg(short = 'w', long = "workspace")]
    pub workspace: Option<String>,

    /// Output NDJSON to stdout
    #[arg(long)]
    pub json: bool,
}

#[derive(Parser, Debug)]
pub struct RemoveArgs {
    /// Package names to remove
    #[arg(required = true)]
    pub packages: Vec<String>,

    /// Remove globally (not yet supported)
    #[arg(short = 'g', long)]
    pub global: bool,

    /// Target a specific workspace package (by name or path)
    #[arg(short = 'w', long = "workspace")]
    pub workspace: Option<String>,

    /// Output NDJSON to stdout
    #[arg(long)]
    pub json: bool,
}

#[derive(Parser, Debug)]
pub struct ListArgs {
    /// Filter by package name
    #[arg(value_name = "PACKAGE")]
    pub package: Option<String>,

    /// Show full dependency tree (not just direct deps)
    #[arg(long)]
    pub all: bool,

    /// Max depth of tree traversal (implies --all)
    #[arg(long)]
    pub depth: Option<usize>,

    /// Output NDJSON to stdout
    #[arg(long)]
    pub json: bool,
}

#[derive(Parser, Debug)]
pub struct MigrateTestsArgs {
    /// Directory to migrate (default: current directory)
    #[arg(value_name = "PATH")]
    pub path: Option<PathBuf>,

    /// Dry run — show what would change without writing files
    #[arg(long)]
    pub dry_run: bool,
}

#[derive(Parser, Debug)]
pub struct WhyArgs {
    /// Package name to trace
    #[arg(required = true)]
    pub package: String,

    /// Output NDJSON to stdout
    #[arg(long)]
    pub json: bool,
}

#[derive(Parser, Debug)]
pub struct AuditArgs {
    /// Output NDJSON to stdout
    #[arg(long)]
    pub json: bool,

    /// Severity threshold: only show vulnerabilities at or above this level
    #[arg(long, value_parser = ["critical", "high", "moderate", "low"])]
    pub severity: Option<String>,

    /// Attempt to update vulnerable packages to patched versions
    #[arg(long)]
    pub fix: bool,

    /// Show what --fix would change without modifying anything
    #[arg(long)]
    pub dry_run: bool,
}

#[derive(Parser, Debug)]
pub struct OutdatedArgs {
    /// Output NDJSON to stdout
    #[arg(long)]
    pub json: bool,
}

#[derive(Parser, Debug)]
pub struct UpdateArgs {
    /// Package names to update (empty = update all)
    pub packages: Vec<String>,

    /// Ignore semver ranges — update to latest version
    #[arg(long)]
    pub latest: bool,

    /// Show what would be updated without changing anything
    #[arg(long)]
    pub dry_run: bool,

    /// Output NDJSON to stdout
    #[arg(long)]
    pub json: bool,
}

#[derive(Parser, Debug)]
pub struct CacheArgs {
    #[command(subcommand)]
    pub command: CacheCommand,
}

#[derive(Subcommand, Debug)]
pub enum CacheCommand {
    /// Remove cached packages and metadata
    Clean(CacheCleanArgs),
    /// Show cache location and size
    List(CacheListArgs),
    /// Print cache directory path
    Path,
}

#[derive(Parser, Debug)]
pub struct CacheCleanArgs {
    /// Only clear registry metadata cache (keep package store)
    #[arg(long)]
    pub metadata: bool,

    /// Output NDJSON to stdout
    #[arg(long)]
    pub json: bool,
}

#[derive(Parser, Debug)]
pub struct CacheListArgs {
    /// Output NDJSON to stdout
    #[arg(long)]
    pub json: bool,
}

#[derive(Parser, Debug)]
pub struct RunArgs {
    /// Script name to run (omit to list available scripts)
    pub script: Option<String>,

    /// Extra arguments to pass to the script (after --)
    #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
    pub args: Vec<String>,

    /// Target a specific workspace package (by name or path)
    #[arg(short = 'w', long = "workspace")]
    pub workspace: Option<String>,
}

#[derive(Parser, Debug)]
pub struct ExecArgs {
    /// Command to execute
    #[arg(required = true)]
    pub command: String,

    /// Arguments to pass to the command
    #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
    pub args: Vec<String>,

    /// Target a specific workspace package (by name or path)
    #[arg(short = 'w', long = "workspace")]
    pub workspace: Option<String>,
}

#[derive(Parser, Debug)]
pub struct ConfigArgs {
    #[command(subcommand)]
    pub command: ConfigCommand,
}

#[derive(Subcommand, Debug)]
pub enum ConfigCommand {
    /// Set a config value (replaces existing)
    Set(ConfigSetArgs),
    /// Add values to a config list
    Add(ConfigAddArgs),
    /// Remove values from a config list
    Remove(ConfigRemoveArgs),
    /// Show a config value
    Get(ConfigGetArgs),
    /// Initialize a config value from current project state
    Init(ConfigInitArgs),
}

#[derive(Parser, Debug)]
pub struct ConfigSetArgs {
    /// Config key (e.g., trust-scripts)
    pub key: String,
    /// Values to set
    #[arg(required = true)]
    pub values: Vec<String>,
}

#[derive(Parser, Debug)]
pub struct ConfigAddArgs {
    /// Config key (e.g., trust-scripts)
    pub key: String,
    /// Values to add
    #[arg(required = true)]
    pub values: Vec<String>,
}

#[derive(Parser, Debug)]
pub struct ConfigRemoveArgs {
    /// Config key (e.g., trust-scripts)
    pub key: String,
    /// Values to remove
    #[arg(required = true)]
    pub values: Vec<String>,
}

#[derive(Parser, Debug)]
pub struct ConfigGetArgs {
    /// Config key (e.g., trust-scripts)
    pub key: String,
}

#[derive(Parser, Debug)]
pub struct ConfigInitArgs {
    /// Config key (e.g., trust-scripts)
    pub key: String,
}

#[derive(Parser, Debug)]
pub struct PublishArgs {
    /// Dist-tag for this publish (default: "latest")
    #[arg(long, default_value = "latest")]
    pub tag: String,

    /// Access level for scoped packages: "public" or "restricted"
    #[arg(long)]
    pub access: Option<String>,

    /// Show what would be published without uploading
    #[arg(long)]
    pub dry_run: bool,

    /// Output as NDJSON
    #[arg(long)]
    pub json: bool,
}

#[derive(Parser, Debug)]
pub struct PatchArgs {
    #[command(subcommand)]
    pub command: Option<PatchCommand>,

    /// Package name to prepare for patching (default action)
    #[arg(value_name = "PACKAGE")]
    pub package: Option<String>,

    /// Output NDJSON to stdout
    #[arg(long)]
    pub json: bool,
}

#[derive(Subcommand, Debug)]
pub enum PatchCommand {
    /// Save the patch diff for a patched package
    Save(PatchSaveArgs),
    /// Discard in-progress patch changes
    Discard(PatchDiscardArgs),
    /// List active and saved patches
    List(PatchListArgs),
}

#[derive(Parser, Debug)]
pub struct PatchSaveArgs {
    /// Package name to save patch for
    #[arg(required = true)]
    pub package: String,

    /// Output NDJSON to stdout
    #[arg(long)]
    pub json: bool,
}

#[derive(Parser, Debug)]
pub struct PatchDiscardArgs {
    /// Package name to discard patch for
    #[arg(required = true)]
    pub package: String,

    /// Output NDJSON to stdout
    #[arg(long)]
    pub json: bool,
}

#[derive(Parser, Debug)]
pub struct PatchListArgs {
    /// Output NDJSON to stdout
    #[arg(long)]
    pub json: bool,
}

#[derive(Parser, Debug)]
pub struct ProxyArgs {
    #[command(subcommand)]
    pub command: ProxyCommand,
}

#[derive(Subcommand, Debug)]
pub enum ProxyCommand {
    /// Initialize the proxy (first-time setup)
    Init(ProxyInitArgs),
    /// Start the proxy daemon
    Start(ProxyStartArgs),
    /// Stop the proxy daemon
    Stop,
    /// Show registered dev servers and their URLs
    Status,
    /// Install the CA certificate in the system trust store
    Trust,
    /// Sync /etc/hosts entries for registered dev servers (Safari support)
    SyncHosts,
}

#[derive(Parser, Debug)]
pub struct ProxyInitArgs {
    /// Port for the proxy to listen on
    #[arg(long, default_value_t = 4000)]
    pub port: u16,
}

#[derive(Parser, Debug)]
pub struct ProxyStartArgs {
    /// Port for the proxy to listen on
    #[arg(long, default_value_t = 4000)]
    pub port: u16,
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

    fn parse_install(args: &[&str]) -> InstallArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::Install(args) => args,
            other => panic!("Expected Install, got {:?}", other),
        }
    }

    fn parse_add(args: &[&str]) -> AddArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::Add(args) => args,
            other => panic!("Expected Add, got {:?}", other),
        }
    }

    fn parse_remove(args: &[&str]) -> RemoveArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::Remove(args) => args,
            other => panic!("Expected Remove, got {:?}", other),
        }
    }

    fn parse_migrate_tests(args: &[&str]) -> MigrateTestsArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::MigrateTests(args) => args,
            other => panic!("Expected MigrateTests, got {:?}", other),
        }
    }

    fn parse_list(args: &[&str]) -> ListArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::List(args) => args,
            other => panic!("Expected List, got {:?}", other),
        }
    }

    fn parse_why(args: &[&str]) -> WhyArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::Why(args) => args,
            other => panic!("Expected Why, got {:?}", other),
        }
    }

    fn parse_outdated(args: &[&str]) -> OutdatedArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::Outdated(args) => args,
            other => panic!("Expected Outdated, got {:?}", other),
        }
    }

    fn parse_update(args: &[&str]) -> UpdateArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::Update(args) => args,
            other => panic!("Expected Update, got {:?}", other),
        }
    }

    fn parse_cache(args: &[&str]) -> CacheArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::Cache(args) => args,
            other => panic!("Expected Cache, got {:?}", other),
        }
    }

    fn parse_run(args: &[&str]) -> RunArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::Run(args) => args,
            other => panic!("Expected Run, got {:?}", other),
        }
    }

    fn parse_exec(args: &[&str]) -> ExecArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::Exec(args) => args,
            other => panic!("Expected Exec, got {:?}", other),
        }
    }

    // --- Install command tests ---

    #[test]
    fn test_install_default() {
        let args = parse_install(&["vtz", "install"]);
        assert!(!args.frozen);
    }

    #[test]
    fn test_install_alias_i() {
        let args = parse_install(&["vtz", "i"]);
        assert!(!args.frozen);
    }

    #[test]
    fn test_install_frozen() {
        let args = parse_install(&["vtz", "install", "--frozen"]);
        assert!(args.frozen);
    }

    #[test]
    fn test_install_frozen_lockfile_alias() {
        let args = parse_install(&["vtz", "install", "--frozen-lockfile"]);
        assert!(args.frozen);
    }

    // --- Add command tests ---

    #[test]
    fn test_add_single_package() {
        let args = parse_add(&["vtz", "add", "zod"]);
        assert_eq!(args.packages, vec!["zod"]);
        assert!(!args.dev);
        assert!(!args.exact);
    }

    #[test]
    fn test_add_dev_flag() {
        let args = parse_add(&["vtz", "add", "-D", "typescript"]);
        assert_eq!(args.packages, vec!["typescript"]);
        assert!(args.dev);
    }

    #[test]
    fn test_add_dev_long_flag() {
        let args = parse_add(&["vtz", "add", "--dev", "typescript"]);
        assert!(args.dev);
    }

    #[test]
    fn test_add_exact_flag() {
        let args = parse_add(&["vtz", "add", "-E", "zod"]);
        assert!(args.exact);
    }

    #[test]
    fn test_add_exact_long_flag() {
        let args = parse_add(&["vtz", "add", "--exact", "zod"]);
        assert!(args.exact);
    }

    #[test]
    fn test_add_multiple_packages() {
        let args = parse_add(&["vtz", "add", "zod", "react"]);
        assert_eq!(args.packages, vec!["zod", "react"]);
    }

    #[test]
    fn test_add_with_version_spec() {
        let args = parse_add(&["vtz", "add", "zod@^3.24.0"]);
        assert_eq!(args.packages, vec!["zod@^3.24.0"]);
    }

    #[test]
    fn test_add_scoped_package() {
        let args = parse_add(&["vtz", "add", "@vertz/ui@^0.1.0"]);
        assert_eq!(args.packages, vec!["@vertz/ui@^0.1.0"]);
    }

    #[test]
    fn test_add_peer_flag() {
        let args = parse_add(&["vtz", "add", "-P", "react"]);
        assert!(args.peer);
        assert!(!args.dev);
    }

    #[test]
    fn test_add_peer_long_flag() {
        let args = parse_add(&["vtz", "add", "--peer", "react"]);
        assert!(args.peer);
    }

    #[test]
    fn test_add_peer_default_false() {
        let args = parse_add(&["vtz", "add", "react"]);
        assert!(!args.peer);
    }

    #[test]
    fn test_add_optional_flag() {
        let args = parse_add(&["vtz", "add", "-O", "fsevents"]);
        assert!(args.optional);
    }

    #[test]
    fn test_add_optional_long_flag() {
        let args = parse_add(&["vtz", "add", "--optional", "fsevents"]);
        assert!(args.optional);
    }

    #[test]
    fn test_add_optional_default_false() {
        let args = parse_add(&["vtz", "add", "zod"]);
        assert!(!args.optional);
    }

    // --- Remove command tests ---

    #[test]
    fn test_remove_single_package() {
        let args = parse_remove(&["vtz", "remove", "zod"]);
        assert_eq!(args.packages, vec!["zod"]);
    }

    #[test]
    fn test_remove_multiple_packages() {
        let args = parse_remove(&["vtz", "remove", "zod", "react"]);
        assert_eq!(args.packages, vec!["zod", "react"]);
    }

    #[test]
    fn test_add_global_flag() {
        let args = parse_add(&["vtz", "add", "-g", "zod"]);
        assert!(args.global);
    }

    #[test]
    fn test_add_global_long_flag() {
        let args = parse_add(&["vtz", "add", "--global", "zod"]);
        assert!(args.global);
    }

    #[test]
    fn test_add_global_default_false() {
        let args = parse_add(&["vtz", "add", "zod"]);
        assert!(!args.global);
    }

    #[test]
    fn test_remove_global_flag() {
        let args = parse_remove(&["vtz", "remove", "-g", "zod"]);
        assert!(args.global);
    }

    #[test]
    fn test_remove_global_long_flag() {
        let args = parse_remove(&["vtz", "remove", "--global", "zod"]);
        assert!(args.global);
    }

    #[test]
    fn test_remove_global_default_false() {
        let args = parse_remove(&["vtz", "remove", "zod"]);
        assert!(!args.global);
    }

    // --- Dev command tests ---

    #[test]
    fn test_default_dev_args() {
        let args = parse_dev(&["vtz", "dev"]);
        assert_eq!(args.port, 3000);
        assert_eq!(args.host, "localhost");
        assert_eq!(args.public_dir, PathBuf::from("public"));
    }

    #[test]
    fn test_custom_port() {
        let args = parse_dev(&["vtz", "dev", "--port", "4000"]);
        assert_eq!(args.port, 4000);
    }

    #[test]
    fn test_custom_host() {
        let args = parse_dev(&["vtz", "dev", "--host", "0.0.0.0"]);
        assert_eq!(args.host, "0.0.0.0");
    }

    #[test]
    fn test_custom_public_dir() {
        let args = parse_dev(&["vtz", "dev", "--public-dir", "dist"]);
        assert_eq!(args.public_dir, PathBuf::from("dist"));
    }

    #[test]
    fn test_all_args_combined() {
        let args = parse_dev(&[
            "vtz",
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
        let args = parse_dev(&["vtz", "dev", "--no-typecheck"]);
        assert!(args.no_typecheck);
    }

    #[test]
    fn test_typecheck_enabled_by_default() {
        let args = parse_dev(&["vtz", "dev"]);
        assert!(!args.no_typecheck);
    }

    #[test]
    fn test_custom_tsconfig() {
        let args = parse_dev(&["vtz", "dev", "--tsconfig", "tsconfig.app.json"]);
        assert_eq!(args.tsconfig, Some(PathBuf::from("tsconfig.app.json")));
    }

    #[test]
    fn test_tsconfig_default_none() {
        let args = parse_dev(&["vtz", "dev"]);
        assert!(args.tsconfig.is_none());
    }

    #[test]
    fn test_typecheck_binary_flag() {
        let args = parse_dev(&["vtz", "dev", "--typecheck-binary", "/usr/local/bin/tsgo"]);
        assert_eq!(
            args.typecheck_binary,
            Some(PathBuf::from("/usr/local/bin/tsgo"))
        );
    }

    #[test]
    fn test_typecheck_binary_default_none() {
        let args = parse_dev(&["vtz", "dev"]);
        assert!(args.typecheck_binary.is_none());
    }

    #[test]
    fn test_no_auto_install_flag() {
        let args = parse_dev(&["vtz", "dev", "--no-auto-install"]);
        assert!(args.no_auto_install);
        assert!(!args.auto_install);
    }

    #[test]
    fn test_auto_install_flag() {
        let args = parse_dev(&["vtz", "dev", "--auto-install"]);
        assert!(args.auto_install);
        assert!(!args.no_auto_install);
    }

    #[test]
    fn test_auto_install_defaults_off() {
        let args = parse_dev(&["vtz", "dev"]);
        assert!(!args.no_auto_install);
        assert!(!args.auto_install);
    }

    // --- Test command tests ---

    #[test]
    fn test_default_test_args() {
        let args = parse_test(&["vtz", "test"]);
        assert!(args.paths.is_empty());
        assert!(args.filter.is_none());
        assert!(!args.watch);
        assert!(!args.coverage);
        assert!(args.coverage_threshold.is_none());
        assert!(args.timeout.is_none());
        assert!(args.concurrency.is_none());
        assert!(args.reporter.is_none());
        assert!(!args.bail);
        assert!(!args.no_preload);
    }

    #[test]
    fn test_test_with_paths() {
        let args = parse_test(&["vtz", "test", "src/math.test.ts", "src/string.test.ts"]);
        assert_eq!(args.paths.len(), 2);
        assert_eq!(args.paths[0], PathBuf::from("src/math.test.ts"));
        assert_eq!(args.paths[1], PathBuf::from("src/string.test.ts"));
    }

    #[test]
    fn test_test_with_filter() {
        let args = parse_test(&["vtz", "test", "--filter", "math"]);
        assert_eq!(args.filter, Some("math".to_string()));
    }

    #[test]
    fn test_test_watch_mode() {
        let args = parse_test(&["vtz", "test", "--watch"]);
        assert!(args.watch);
    }

    #[test]
    fn test_test_coverage() {
        let args = parse_test(&["vtz", "test", "--coverage", "--coverage-threshold", "80"]);
        assert!(args.coverage);
        assert_eq!(args.coverage_threshold, Some(80));
    }

    #[test]
    fn test_test_timeout() {
        let args = parse_test(&["vtz", "test", "--timeout", "10000"]);
        assert_eq!(args.timeout, Some(10000));
    }

    #[test]
    fn test_test_concurrency() {
        let args = parse_test(&["vtz", "test", "--concurrency", "4"]);
        assert_eq!(args.concurrency, Some(4));
    }

    #[test]
    fn test_test_bail() {
        let args = parse_test(&["vtz", "test", "--bail"]);
        assert!(args.bail);
    }

    #[test]
    fn test_test_reporter() {
        let args = parse_test(&["vtz", "test", "--reporter", "json"]);
        assert_eq!(args.reporter, Some("json".to_string()));
    }

    #[test]
    fn test_test_no_preload() {
        let args = parse_test(&["vtz", "test", "--no-preload"]);
        assert!(args.no_preload);
    }

    #[test]
    fn test_test_root_dir() {
        let args = parse_test(&["vtz", "test", "--root-dir", "/workspace/root"]);
        assert_eq!(args.root_dir, Some(PathBuf::from("/workspace/root")));
    }

    #[test]
    fn test_test_root_dir_default() {
        let args = parse_test(&["vtz", "test"]);
        assert!(args.root_dir.is_none());
    }

    #[test]
    fn test_test_no_cache() {
        let args = parse_test(&["vtz", "test", "--no-cache"]);
        assert!(args.no_cache);
    }

    #[test]
    fn test_test_all_flags_combined() {
        let args = parse_test(&[
            "vtz",
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
        assert_eq!(args.timeout, Some(3000));
    }

    // --- MigrateTests command tests ---

    #[test]
    fn test_default_migrate_tests_args() {
        let args = parse_migrate_tests(&["vtz", "migrate-tests"]);
        assert!(args.path.is_none());
        assert!(!args.dry_run);
    }

    #[test]
    fn test_migrate_tests_with_path() {
        let args = parse_migrate_tests(&["vtz", "migrate-tests", "src/"]);
        assert_eq!(args.path, Some(PathBuf::from("src/")));
    }

    #[test]
    fn test_migrate_tests_dry_run() {
        let args = parse_migrate_tests(&["vtz", "migrate-tests", "--dry-run"]);
        assert!(args.dry_run);
    }

    // --- List command tests ---

    #[test]
    fn test_list_default() {
        let args = parse_list(&["vtz", "list"]);
        assert!(args.package.is_none());
        assert!(!args.all);
        assert!(args.depth.is_none());
        assert!(!args.json);
    }

    #[test]
    fn test_list_alias_ls() {
        let args = parse_list(&["vtz", "ls"]);
        assert!(args.package.is_none());
    }

    #[test]
    fn test_list_with_package_filter() {
        let args = parse_list(&["vtz", "list", "react"]);
        assert_eq!(args.package, Some("react".to_string()));
    }

    #[test]
    fn test_list_all_flag() {
        let args = parse_list(&["vtz", "list", "--all"]);
        assert!(args.all);
    }

    #[test]
    fn test_list_depth_flag() {
        let args = parse_list(&["vtz", "list", "--depth", "2"]);
        assert_eq!(args.depth, Some(2));
    }

    #[test]
    fn test_list_json_flag() {
        let args = parse_list(&["vtz", "list", "--json"]);
        assert!(args.json);
    }

    #[test]
    fn test_list_all_depth_json_combined() {
        let args = parse_list(&["vtz", "list", "--all", "--depth", "2", "--json"]);
        assert!(args.all);
        assert_eq!(args.depth, Some(2));
        assert!(args.json);
    }

    #[test]
    fn test_list_package_with_all() {
        let args = parse_list(&["vtz", "list", "react", "--all"]);
        assert_eq!(args.package, Some("react".to_string()));
        assert!(args.all);
    }

    // --- rm alias tests ---

    #[test]
    fn test_remove_rm_alias() {
        let args = parse_remove(&["vtz", "rm", "zod"]);
        assert_eq!(args.packages, vec!["zod"]);
    }

    #[test]
    fn test_remove_rm_alias_multiple() {
        let args = parse_remove(&["vtz", "rm", "zod", "react"]);
        assert_eq!(args.packages, vec!["zod", "react"]);
    }

    // --- --json flag tests ---

    #[test]
    fn test_install_json_flag() {
        let args = parse_install(&["vtz", "install", "--json"]);
        assert!(args.json);
    }

    #[test]
    fn test_install_json_default_false() {
        let args = parse_install(&["vtz", "install"]);
        assert!(!args.json);
    }

    #[test]
    fn test_add_json_flag() {
        let args = parse_add(&["vtz", "add", "zod", "--json"]);
        assert!(args.json);
    }

    #[test]
    fn test_add_json_default_false() {
        let args = parse_add(&["vtz", "add", "zod"]);
        assert!(!args.json);
    }

    #[test]
    fn test_remove_json_flag() {
        let args = parse_remove(&["vtz", "remove", "zod", "--json"]);
        assert!(args.json);
    }

    #[test]
    fn test_remove_json_default_false() {
        let args = parse_remove(&["vtz", "remove", "zod"]);
        assert!(!args.json);
    }

    // --- Why command tests ---

    #[test]
    fn test_why_basic() {
        let args = parse_why(&["vtz", "why", "lodash"]);
        assert_eq!(args.package, "lodash");
        assert!(!args.json);
    }

    #[test]
    fn test_why_json_flag() {
        let args = parse_why(&["vtz", "why", "lodash", "--json"]);
        assert_eq!(args.package, "lodash");
        assert!(args.json);
    }

    #[test]
    fn test_why_scoped_package() {
        let args = parse_why(&["vtz", "why", "@vertz/ui"]);
        assert_eq!(args.package, "@vertz/ui");
    }

    // --- Outdated command tests ---

    #[test]
    fn test_outdated_default() {
        let args = parse_outdated(&["vtz", "outdated"]);
        assert!(!args.json);
    }

    #[test]
    fn test_outdated_json_flag() {
        let args = parse_outdated(&["vtz", "outdated", "--json"]);
        assert!(args.json);
    }

    // --- Update command tests ---

    #[test]
    fn test_update_default() {
        let args = parse_update(&["vtz", "update"]);
        assert!(args.packages.is_empty());
        assert!(!args.latest);
        assert!(!args.dry_run);
        assert!(!args.json);
    }

    #[test]
    fn test_update_alias_up() {
        let args = parse_update(&["vtz", "up"]);
        assert!(args.packages.is_empty());
    }

    #[test]
    fn test_update_specific_packages() {
        let args = parse_update(&["vtz", "update", "zod", "react"]);
        assert_eq!(args.packages, vec!["zod", "react"]);
    }

    #[test]
    fn test_update_latest_flag() {
        let args = parse_update(&["vtz", "update", "--latest"]);
        assert!(args.latest);
    }

    #[test]
    fn test_update_dry_run_flag() {
        let args = parse_update(&["vtz", "update", "--dry-run"]);
        assert!(args.dry_run);
    }

    #[test]
    fn test_update_json_flag() {
        let args = parse_update(&["vtz", "update", "--json"]);
        assert!(args.json);
    }

    #[test]
    fn test_update_all_flags_combined() {
        let args = parse_update(&["vtz", "update", "zod", "--latest", "--dry-run", "--json"]);
        assert_eq!(args.packages, vec!["zod"]);
        assert!(args.latest);
        assert!(args.dry_run);
        assert!(args.json);
    }

    // --- Cache command tests ---

    #[test]
    fn test_cache_clean_default() {
        let cache = parse_cache(&["vtz", "cache", "clean"]);
        match cache.command {
            CacheCommand::Clean(args) => {
                assert!(!args.metadata);
                assert!(!args.json);
            }
            other => panic!("Expected Clean, got {:?}", other),
        }
    }

    #[test]
    fn test_cache_clean_metadata_flag() {
        let cache = parse_cache(&["vtz", "cache", "clean", "--metadata"]);
        match cache.command {
            CacheCommand::Clean(args) => assert!(args.metadata),
            other => panic!("Expected Clean, got {:?}", other),
        }
    }

    #[test]
    fn test_cache_clean_json_flag() {
        let cache = parse_cache(&["vtz", "cache", "clean", "--json"]);
        match cache.command {
            CacheCommand::Clean(args) => assert!(args.json),
            other => panic!("Expected Clean, got {:?}", other),
        }
    }

    #[test]
    fn test_cache_list_default() {
        let cache = parse_cache(&["vtz", "cache", "list"]);
        match cache.command {
            CacheCommand::List(args) => assert!(!args.json),
            other => panic!("Expected List, got {:?}", other),
        }
    }

    #[test]
    fn test_cache_list_json_flag() {
        let cache = parse_cache(&["vtz", "cache", "list", "--json"]);
        match cache.command {
            CacheCommand::List(args) => assert!(args.json),
            other => panic!("Expected List, got {:?}", other),
        }
    }

    #[test]
    fn test_cache_path() {
        let cache = parse_cache(&["vtz", "cache", "path"]);
        assert!(matches!(cache.command, CacheCommand::Path));
    }

    // --- --ignore-scripts flag tests ---

    #[test]
    fn test_install_ignore_scripts_flag() {
        let args = parse_install(&["vtz", "install", "--ignore-scripts"]);
        assert!(args.ignore_scripts);
    }

    #[test]
    fn test_install_ignore_scripts_default_false() {
        let args = parse_install(&["vtz", "install"]);
        assert!(!args.ignore_scripts);
    }

    #[test]
    fn test_add_ignore_scripts_flag() {
        let args = parse_add(&["vtz", "add", "zod", "--ignore-scripts"]);
        assert!(args.ignore_scripts);
    }

    #[test]
    fn test_add_ignore_scripts_default_false() {
        let args = parse_add(&["vtz", "add", "zod"]);
        assert!(!args.ignore_scripts);
    }

    // --- --force flag tests ---

    #[test]
    fn test_install_force_flag() {
        let args = parse_install(&["vtz", "install", "--force"]);
        assert!(args.force);
    }

    #[test]
    fn test_install_force_default_false() {
        let args = parse_install(&["vtz", "install"]);
        assert!(!args.force);
    }

    // --- Run command tests ---

    #[test]
    fn test_run_no_script() {
        let args = parse_run(&["vtz", "run"]);
        assert!(args.script.is_none());
        assert!(args.workspace.is_none());
    }

    #[test]
    fn test_run_with_script() {
        let args = parse_run(&["vtz", "run", "build"]);
        assert_eq!(args.script, Some("build".to_string()));
    }

    #[test]
    fn test_run_with_workspace() {
        let args = parse_run(&["vtz", "run", "-w", "@myorg/api", "build"]);
        assert_eq!(args.workspace, Some("@myorg/api".to_string()));
        assert_eq!(args.script, Some("build".to_string()));
    }

    #[test]
    fn test_run_workspace_long_flag() {
        let args = parse_run(&["vtz", "run", "--workspace", "packages/api", "test"]);
        assert_eq!(args.workspace, Some("packages/api".to_string()));
        assert_eq!(args.script, Some("test".to_string()));
    }

    #[test]
    fn test_run_with_extra_args() {
        let args = parse_run(&["vtz", "run", "test", "--", "--bail", "--verbose"]);
        assert_eq!(args.script, Some("test".to_string()));
        assert_eq!(args.args, vec!["--bail", "--verbose"]);
    }

    // --- Exec command tests ---

    #[test]
    fn test_exec_basic() {
        let args = parse_exec(&["vtz", "exec", "tsc"]);
        assert_eq!(args.command, "tsc");
        assert!(args.args.is_empty());
    }

    #[test]
    fn test_exec_with_args() {
        let args = parse_exec(&["vtz", "exec", "tsc", "--version"]);
        assert_eq!(args.command, "tsc");
        assert_eq!(args.args, vec!["--version"]);
    }

    #[test]
    fn test_exec_with_workspace() {
        let args = parse_exec(&["vtz", "exec", "-w", "@myorg/api", "tsc"]);
        assert_eq!(args.workspace, Some("@myorg/api".to_string()));
        assert_eq!(args.command, "tsc");
    }

    // --- -w / --workspace flag tests ---

    #[test]
    fn test_add_workspace_short_flag() {
        let args = parse_add(&["vtz", "add", "zod", "-w", "@myorg/api"]);
        assert_eq!(args.workspace, Some("@myorg/api".to_string()));
    }

    #[test]
    fn test_add_workspace_long_flag() {
        let args = parse_add(&["vtz", "add", "zod", "--workspace", "@myorg/api"]);
        assert_eq!(args.workspace, Some("@myorg/api".to_string()));
    }

    #[test]
    fn test_add_workspace_default_none() {
        let args = parse_add(&["vtz", "add", "zod"]);
        assert!(args.workspace.is_none());
    }

    #[test]
    fn test_add_workspace_with_path() {
        let args = parse_add(&["vtz", "add", "zod", "-w", "packages/api"]);
        assert_eq!(args.workspace, Some("packages/api".to_string()));
    }

    #[test]
    fn test_remove_workspace_short_flag() {
        let args = parse_remove(&["vtz", "remove", "zod", "-w", "@myorg/api"]);
        assert_eq!(args.workspace, Some("@myorg/api".to_string()));
    }

    #[test]
    fn test_remove_workspace_long_flag() {
        let args = parse_remove(&["vtz", "remove", "zod", "--workspace", "@myorg/api"]);
        assert_eq!(args.workspace, Some("@myorg/api".to_string()));
    }

    #[test]
    fn test_remove_workspace_default_none() {
        let args = parse_remove(&["vtz", "remove", "zod"]);
        assert!(args.workspace.is_none());
    }

    // --- Config command tests ---

    fn parse_config(args: &[&str]) -> ConfigArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::Config(args) => args,
            other => panic!("Expected Config, got {:?}", other),
        }
    }

    #[test]
    fn test_config_set_trust_scripts() {
        let args = parse_config(&["vtz", "config", "set", "trust-scripts", "esbuild", "prisma"]);
        match args.command {
            ConfigCommand::Set(set_args) => {
                assert_eq!(set_args.key, "trust-scripts");
                assert_eq!(set_args.values, vec!["esbuild", "prisma"]);
            }
            other => panic!("Expected Set, got {:?}", other),
        }
    }

    #[test]
    fn test_config_add_trust_scripts() {
        let args = parse_config(&["vtz", "config", "add", "trust-scripts", "sharp"]);
        match args.command {
            ConfigCommand::Add(add_args) => {
                assert_eq!(add_args.key, "trust-scripts");
                assert_eq!(add_args.values, vec!["sharp"]);
            }
            other => panic!("Expected Add, got {:?}", other),
        }
    }

    #[test]
    fn test_config_remove_trust_scripts() {
        let args = parse_config(&["vtz", "config", "remove", "trust-scripts", "esbuild"]);
        match args.command {
            ConfigCommand::Remove(remove_args) => {
                assert_eq!(remove_args.key, "trust-scripts");
                assert_eq!(remove_args.values, vec!["esbuild"]);
            }
            other => panic!("Expected Remove, got {:?}", other),
        }
    }

    #[test]
    fn test_config_get_trust_scripts() {
        let args = parse_config(&["vtz", "config", "get", "trust-scripts"]);
        match args.command {
            ConfigCommand::Get(get_args) => {
                assert_eq!(get_args.key, "trust-scripts");
            }
            other => panic!("Expected Get, got {:?}", other),
        }
    }

    #[test]
    fn test_config_init_trust_scripts() {
        let args = parse_config(&["vtz", "config", "init", "trust-scripts"]);
        match args.command {
            ConfigCommand::Init(init_args) => {
                assert_eq!(init_args.key, "trust-scripts");
            }
            other => panic!("Expected Init, got {:?}", other),
        }
    }

    // --- Install --run-scripts tests ---

    #[test]
    fn test_install_run_scripts() {
        let args = parse_install(&["vtz", "install", "--run-scripts"]);
        assert!(args.run_scripts);
        assert!(!args.ignore_scripts);
    }

    #[test]
    fn test_install_ignore_scripts() {
        let args = parse_install(&["vtz", "install", "--ignore-scripts"]);
        assert!(args.ignore_scripts);
        assert!(!args.run_scripts);
    }

    #[test]
    fn test_install_run_scripts_conflicts_with_ignore_scripts() {
        let result = Cli::try_parse_from(["vtz", "install", "--run-scripts", "--ignore-scripts"]);
        assert!(
            result.is_err(),
            "--run-scripts and --ignore-scripts should conflict"
        );
    }

    #[test]
    fn test_add_run_scripts() {
        let args = parse_add(&["vtz", "add", "zod", "--run-scripts"]);
        assert!(args.run_scripts);
    }

    #[test]
    fn test_add_run_scripts_conflicts_with_ignore_scripts() {
        let result =
            Cli::try_parse_from(["vtz", "add", "zod", "--run-scripts", "--ignore-scripts"]);
        assert!(
            result.is_err(),
            "--run-scripts and --ignore-scripts should conflict"
        );
    }

    // --- Patch command tests ---

    fn parse_patch(args: &[&str]) -> PatchArgs {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::Patch(args) => args,
            other => panic!("Expected Patch, got {:?}", other),
        }
    }

    #[test]
    fn test_patch_default_action() {
        let args = parse_patch(&["vtz", "patch", "express"]);
        assert!(args.command.is_none());
        assert_eq!(args.package, Some("express".to_string()));
        assert!(!args.json);
    }

    #[test]
    fn test_patch_with_json() {
        let args = parse_patch(&["vtz", "patch", "--json", "express"]);
        assert!(args.command.is_none());
        assert_eq!(args.package, Some("express".to_string()));
        assert!(args.json);
    }

    #[test]
    fn test_patch_save() {
        let args = parse_patch(&["vtz", "patch", "save", "express"]);
        match args.command {
            Some(PatchCommand::Save(save_args)) => {
                assert_eq!(save_args.package, "express");
                assert!(!save_args.json);
            }
            other => panic!("Expected Save, got {:?}", other),
        }
    }

    #[test]
    fn test_patch_save_with_json() {
        let args = parse_patch(&["vtz", "patch", "save", "express", "--json"]);
        match args.command {
            Some(PatchCommand::Save(save_args)) => {
                assert_eq!(save_args.package, "express");
                assert!(save_args.json);
            }
            other => panic!("Expected Save, got {:?}", other),
        }
    }

    #[test]
    fn test_patch_discard() {
        let args = parse_patch(&["vtz", "patch", "discard", "express"]);
        match args.command {
            Some(PatchCommand::Discard(discard_args)) => {
                assert_eq!(discard_args.package, "express");
                assert!(!discard_args.json);
            }
            other => panic!("Expected Discard, got {:?}", other),
        }
    }

    #[test]
    fn test_patch_list() {
        let args = parse_patch(&["vtz", "patch", "list"]);
        match args.command {
            Some(PatchCommand::List(list_args)) => {
                assert!(!list_args.json);
            }
            other => panic!("Expected List, got {:?}", other),
        }
    }

    #[test]
    fn test_patch_list_with_json() {
        let args = parse_patch(&["vtz", "patch", "list", "--json"]);
        match args.command {
            Some(PatchCommand::List(list_args)) => {
                assert!(list_args.json);
            }
            other => panic!("Expected List, got {:?}", other),
        }
    }

    // --- --no-watch-deps flag tests ---

    #[test]
    fn test_no_watch_deps_flag() {
        let args = parse_dev(&["vtz", "dev", "--no-watch-deps"]);
        assert!(args.no_watch_deps);
    }

    #[test]
    fn test_no_watch_deps_default_false() {
        let args = parse_dev(&["vtz", "dev"]);
        assert!(!args.no_watch_deps);
    }

    // --- Dev --name flag tests ---

    #[test]
    fn test_dev_name_flag() {
        let args = parse_dev(&["vtz", "dev", "--name", "dashboard"]);
        assert_eq!(args.name, Some("dashboard".to_string()));
    }

    #[test]
    fn test_dev_name_default_none() {
        let args = parse_dev(&["vtz", "dev"]);
        assert!(args.name.is_none());
    }

    // --- Proxy CLI tests ---

    fn parse_proxy(args: &[&str]) -> ProxyCommand {
        let cli = Cli::parse_from(args);
        match cli.command {
            Command::Proxy(proxy_args) => proxy_args.command,
            other => panic!("Expected Proxy, got {:?}", other),
        }
    }

    #[test]
    fn test_proxy_init_default_port() {
        let cmd = parse_proxy(&["vtz", "proxy", "init"]);
        match cmd {
            ProxyCommand::Init(args) => assert_eq!(args.port, 4000),
            other => panic!("Expected Init, got {:?}", other),
        }
    }

    #[test]
    fn test_proxy_init_custom_port() {
        let cmd = parse_proxy(&["vtz", "proxy", "init", "--port", "8443"]);
        match cmd {
            ProxyCommand::Init(args) => assert_eq!(args.port, 8443),
            other => panic!("Expected Init, got {:?}", other),
        }
    }

    #[test]
    fn test_proxy_start_default_port() {
        let cmd = parse_proxy(&["vtz", "proxy", "start"]);
        match cmd {
            ProxyCommand::Start(args) => assert_eq!(args.port, 4000),
            other => panic!("Expected Start, got {:?}", other),
        }
    }

    #[test]
    fn test_proxy_stop() {
        let cmd = parse_proxy(&["vtz", "proxy", "stop"]);
        assert!(matches!(cmd, ProxyCommand::Stop));
    }

    #[test]
    fn test_proxy_status() {
        let cmd = parse_proxy(&["vtz", "proxy", "status"]);
        assert!(matches!(cmd, ProxyCommand::Status));
    }

    #[test]
    fn test_proxy_trust() {
        let cmd = parse_proxy(&["vtz", "proxy", "trust"]);
        assert!(matches!(cmd, ProxyCommand::Trust));
    }

    #[test]
    fn test_proxy_sync_hosts() {
        let cmd = parse_proxy(&["vtz", "proxy", "sync-hosts"]);
        assert!(matches!(cmd, ProxyCommand::SyncHosts));
    }
}
