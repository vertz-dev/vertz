use crate::config::ServerConfig;
use owo_colors::OwoColorize;
use std::time::Duration;

const VERSION: &str = "0.1.0-dev";

/// Attempt to detect the local LAN IP address.
fn detect_network_ip() -> Option<String> {
    local_ip_address::local_ip().ok().map(|ip| ip.to_string())
}

/// Format startup duration for display.
fn format_startup_time(duration: Duration) -> String {
    let millis = duration.as_millis();
    if millis == 0 {
        format!("{}μs", duration.as_micros())
    } else {
        format!("{}ms", millis)
    }
}

/// Format the upstream dependency line for the banner.
///
/// Returns `None` if the list is empty.
/// Shows up to 5 package names, then "+N more" for the rest.
pub fn format_upstream_line(package_names: &[String]) -> Option<String> {
    if package_names.is_empty() {
        return None;
    }

    const MAX_DISPLAY: usize = 5;

    if package_names.len() <= MAX_DISPLAY {
        Some(package_names.join(", "))
    } else {
        let shown: Vec<&str> = package_names[..MAX_DISPLAY]
            .iter()
            .map(|s| s.as_str())
            .collect();
        let remaining = package_names.len() - MAX_DISPLAY;
        Some(format!("{}, +{} more", shown.join(", "), remaining))
    }
}

/// Print the startup banner after the server has successfully bound.
pub fn print_banner(config: &ServerConfig, startup_time: Duration) {
    print_banner_with_upstream(config, startup_time, &[]);
}

/// Print the startup banner with optional upstream dependency info.
///
/// When `upstream_packages` is non-empty, an additional `Upstream:` line
/// is shown listing the watched workspace packages.
pub fn print_banner_with_upstream(
    config: &ServerConfig,
    startup_time: Duration,
    upstream_packages: &[String],
) {
    let local_url = format!("http://{}:{}", config.host, config.port);
    let network_ip = detect_network_ip();
    let time_str = format_startup_time(startup_time);

    eprintln!();
    eprintln!(
        "  {} {} {}",
        "▲".cyan().bold(),
        "Vertz".bold(),
        format!("v{}", VERSION).dimmed()
    );
    eprintln!();
    eprintln!("  {}  {}", "Local:".dimmed(), local_url.cyan().underline());

    if let Some(ip) = network_ip {
        let network_url = format!("http://{}:{}", ip, config.port);
        eprintln!(
            "  {}  {}",
            "Network:".dimmed(),
            network_url.cyan().underline()
        );
    } else {
        eprintln!("  {}  {}", "Network:".dimmed(), "not available".dimmed());
    }

    eprintln!(
        "  {}  {}",
        "MCP:".dimmed(),
        format!("http://{}:{}/__vertz_mcp", config.host, config.port)
            .cyan()
            .underline()
    );

    if let Some(line) = format_upstream_line(upstream_packages) {
        eprintln!("  {}  {}", "Upstream:".dimmed(), line.yellow());
    }

    eprintln!();
    eprintln!("  {} {}", "Ready in".dimmed(), time_str.green().bold());
    eprintln!();
    eprintln!("  {}", "Shortcuts:".dimmed());
    eprintln!(
        "  {} restart  {} open  {} clear  {} quit",
        "r".bold(),
        "o".bold(),
        "c".bold(),
        "q".bold()
    );
    eprintln!();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_startup_time_millis() {
        let d = Duration::from_millis(42);
        assert_eq!(format_startup_time(d), "42ms");
    }

    #[test]
    fn test_format_startup_time_micros() {
        let d = Duration::from_micros(500);
        assert_eq!(format_startup_time(d), "500μs");
    }

    #[test]
    fn test_format_startup_time_zero() {
        let d = Duration::from_millis(0);
        assert_eq!(format_startup_time(d), "0μs");
    }

    #[test]
    fn test_detect_network_ip_returns_some_or_none() {
        // This test just verifies the function doesn't panic.
        // On CI or containers it may return None; on dev machines it returns Some.
        let _ip = detect_network_ip();
    }

    #[test]
    fn test_format_upstream_line_empty() {
        let result = format_upstream_line(&[]);
        assert_eq!(result, None);
    }

    #[test]
    fn test_format_upstream_line_single_package() {
        let result = format_upstream_line(&["@vertz/ui".to_string()]);
        assert_eq!(result, Some("@vertz/ui".to_string()));
    }

    #[test]
    fn test_format_upstream_line_two_packages() {
        let result = format_upstream_line(&["@vertz/ui".to_string(), "@vertz/server".to_string()]);
        assert_eq!(result, Some("@vertz/ui, @vertz/server".to_string()));
    }

    #[test]
    fn test_format_upstream_line_five_packages() {
        let names: Vec<String> = (1..=5).map(|i| format!("pkg-{}", i)).collect();
        let result = format_upstream_line(&names);
        assert_eq!(
            result,
            Some("pkg-1, pkg-2, pkg-3, pkg-4, pkg-5".to_string())
        );
    }

    #[test]
    fn test_format_upstream_line_truncates_after_five() {
        let names: Vec<String> = (1..=7).map(|i| format!("pkg-{}", i)).collect();
        let result = format_upstream_line(&names);
        assert_eq!(
            result,
            Some("pkg-1, pkg-2, pkg-3, pkg-4, pkg-5, +2 more".to_string())
        );
    }

    #[test]
    fn test_format_upstream_line_twelve_packages() {
        let names: Vec<String> = (1..=12).map(|i| format!("pkg-{}", i)).collect();
        let result = format_upstream_line(&names);
        assert_eq!(
            result,
            Some("pkg-1, pkg-2, pkg-3, pkg-4, pkg-5, +7 more".to_string())
        );
    }
}
