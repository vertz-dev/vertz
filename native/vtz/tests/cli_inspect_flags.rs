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

    #[arg(long, default_value_t = 9229)]
    pub inspect_port: u16,
}

/// Resolve whether inspector is enabled from the parsed args.
fn resolve_inspect(args: &TestDevArgs) -> bool {
    args.inspect || args.inspect_brk || args.inspect_port != 9229
}

#[test]
fn test_inspect_flag_enables_inspector() {
    let cli = TestCli::parse_from(["vtz", "dev", "--inspect"]);
    let TestCommand::Dev(args) = cli.command;
    assert!(args.inspect);
    assert!(!args.inspect_brk);
    assert_eq!(args.inspect_port, 9229);
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
    assert_eq!(args.inspect_port, 9230);
    assert!(resolve_inspect(&args));
}

#[test]
fn test_no_inspect_flags_disables_inspector() {
    let cli = TestCli::parse_from(["vtz", "dev"]);
    let TestCommand::Dev(args) = cli.command;
    assert!(!args.inspect);
    assert!(!args.inspect_brk);
    assert_eq!(args.inspect_port, 9229);
    assert!(!resolve_inspect(&args));
}

#[test]
fn test_inspect_with_custom_port() {
    let cli = TestCli::parse_from(["vtz", "dev", "--inspect", "--inspect-port", "9230"]);
    let TestCommand::Dev(args) = cli.command;
    assert!(args.inspect);
    assert_eq!(args.inspect_port, 9230);
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
fn test_default_inspect_port_does_not_imply_inspect() {
    // --inspect-port with default value (9229) should NOT imply --inspect
    let cli = TestCli::parse_from(["vtz", "dev", "--inspect-port", "9229"]);
    let TestCommand::Dev(args) = cli.command;
    // When user explicitly passes --inspect-port 9229, we can't distinguish from default.
    // But resolve_inspect checks != 9229, so this is false. That's correct —
    // the user would need --inspect or a non-default port.
    assert!(!resolve_inspect(&args));
}
