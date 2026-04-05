use clap::Parser;

// We need to test the CLI struct directly. Import from the binary crate's cli module.
// Since cli.rs is in the binary crate (main.rs), we test via the clap parsing behavior.

/// Minimal replica of the CLI structure for testing flag parsing.
/// This mirrors the relevant parts of cli.rs to test flag semantics.
#[derive(Parser, Debug)]
#[command(name = "vtz")]
struct TestCli {
    #[command(subcommand)]
    command: TestCommand,
}

#[derive(clap::Subcommand, Debug)]
enum TestCommand {
    Dev(TestDevArgs),
}

#[derive(Parser, Debug)]
struct TestDevArgs {
    #[arg(long)]
    pub port: Option<u16>,

    #[arg(long)]
    pub inspect: bool,

    #[arg(long, conflicts_with = "inspect")]
    pub inspect_brk: bool,

    #[arg(long)]
    pub inspect_port: Option<u16>,
}

/// Resolve whether inspector is enabled from the parsed args.
fn resolve_inspect(args: &TestDevArgs) -> bool {
    args.inspect || args.inspect_brk || args.inspect_port.is_some()
}

/// Resolve the actual inspector port.
fn resolve_inspect_port(args: &TestDevArgs) -> u16 {
    args.inspect_port.unwrap_or(9229)
}

#[test]
fn test_inspect_flag_enables_inspector() {
    let cli = TestCli::parse_from(["vtz", "dev", "--inspect"]);
    let TestCommand::Dev(args) = cli.command;
    assert!(args.inspect);
    assert!(!args.inspect_brk);
    assert_eq!(resolve_inspect_port(&args), 9229);
    assert!(resolve_inspect(&args));
}

#[test]
fn test_inspect_brk_flag_enables_inspector() {
    let cli = TestCli::parse_from(["vtz", "dev", "--inspect-brk"]);
    let TestCommand::Dev(args) = cli.command;
    assert!(!args.inspect);
    assert!(args.inspect_brk);
    assert!(resolve_inspect(&args));
}

#[test]
fn test_inspect_port_implies_inspect() {
    let cli = TestCli::parse_from(["vtz", "dev", "--inspect-port", "9230"]);
    let TestCommand::Dev(args) = cli.command;
    assert!(!args.inspect);
    assert!(!args.inspect_brk);
    assert_eq!(resolve_inspect_port(&args), 9230);
    assert!(resolve_inspect(&args));
}

#[test]
fn test_no_inspect_flags_disables_inspector() {
    let cli = TestCli::parse_from(["vtz", "dev"]);
    let TestCommand::Dev(args) = cli.command;
    assert!(!args.inspect);
    assert!(!args.inspect_brk);
    assert!(args.inspect_port.is_none());
    assert!(!resolve_inspect(&args));
}

#[test]
fn test_inspect_with_custom_port() {
    let cli = TestCli::parse_from(["vtz", "dev", "--inspect", "--inspect-port", "9230"]);
    let TestCommand::Dev(args) = cli.command;
    assert!(args.inspect);
    assert_eq!(resolve_inspect_port(&args), 9230);
    assert!(resolve_inspect(&args));
}

#[test]
fn test_inspect_and_inspect_brk_conflict() {
    let result = TestCli::try_parse_from(["vtz", "dev", "--inspect", "--inspect-brk"]);
    assert!(
        result.is_err(),
        "Should error when both --inspect and --inspect-brk are passed"
    );
}

#[test]
fn test_inspect_port_default_value_implies_inspect() {
    // --inspect-port 9229 explicitly passed SHOULD imply --inspect
    let cli = TestCli::parse_from(["vtz", "dev", "--inspect-port", "9229"]);
    let TestCommand::Dev(args) = cli.command;
    assert!(args.inspect_port.is_some());
    assert_eq!(resolve_inspect_port(&args), 9229);
    assert!(resolve_inspect(&args));
}
