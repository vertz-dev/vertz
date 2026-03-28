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

/// Print the startup banner after the server has successfully bound.
pub fn print_banner(config: &ServerConfig, startup_time: Duration) {
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
}
