use crate::proxy::routes;

/// Marker comments for the managed hosts block.
const HOSTS_BEGIN: &str = "# BEGIN vertz-proxy";
const HOSTS_END: &str = "# END vertz-proxy";

/// Generate `/etc/hosts` entries for all registered dev server subdomains.
///
/// Returns a string block that can be inserted into `/etc/hosts`.
/// Each subdomain gets a `127.0.0.1 <subdomain>.localhost` line.
pub fn generate_hosts_block() -> String {
    let entries = routes::load_all_routes();
    generate_hosts_block_from(&entries)
}

/// Generate `/etc/hosts` entries from a list of route entries (testable variant).
fn generate_hosts_block_from(entries: &[routes::RouteEntry]) -> String {
    if entries.is_empty() {
        return String::new();
    }

    let mut lines = vec![HOSTS_BEGIN.to_string()];
    for entry in entries {
        // Multi-level subdomains (e.g., "feat-auth.my-app") need the full subdomain
        lines.push(format!("127.0.0.1 {}.localhost", entry.subdomain));
    }
    lines.push(HOSTS_END.to_string());
    lines.join("\n")
}

/// Merge the vertz hosts block into an existing hosts file content.
///
/// Replaces any existing vertz block (between BEGIN/END markers) or appends if none exists.
pub fn merge_into_hosts(existing: &str, block: &str) -> String {
    let mut result = String::new();
    let mut in_block = false;
    let mut replaced = false;

    for line in existing.lines() {
        if line.trim() == HOSTS_BEGIN {
            in_block = true;
            if !block.is_empty() {
                result.push_str(block);
                result.push('\n');
                replaced = true;
            }
            continue;
        }
        if line.trim() == HOSTS_END {
            in_block = false;
            continue;
        }
        if !in_block {
            result.push_str(line);
            result.push('\n');
        }
    }

    // Append if no existing block was found
    if !replaced && !block.is_empty() {
        // Ensure there's a newline before our block
        if !result.ends_with('\n') && !result.is_empty() {
            result.push('\n');
        }
        result.push_str(block);
        result.push('\n');
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn test_entry(subdomain: &str) -> routes::RouteEntry {
        routes::RouteEntry {
            subdomain: subdomain.to_string(),
            port: 3000,
            branch: "main".to_string(),
            project: "test".to_string(),
            pid: 1234,
            root_dir: PathBuf::from("/tmp/test"),
        }
    }

    #[test]
    fn empty_entries_produce_empty_block() {
        assert_eq!(generate_hosts_block_from(&[]), "");
    }

    #[test]
    fn single_entry_produces_hosts_line() {
        let entries = vec![test_entry("my-app")];
        let block = generate_hosts_block_from(&entries);
        assert!(block.contains("127.0.0.1 my-app.localhost"));
        assert!(block.starts_with(HOSTS_BEGIN));
        assert!(block.ends_with(HOSTS_END));
    }

    #[test]
    fn multi_level_subdomain_in_hosts() {
        let entries = vec![test_entry("feat-auth.my-app")];
        let block = generate_hosts_block_from(&entries);
        assert!(block.contains("127.0.0.1 feat-auth.my-app.localhost"));
    }

    #[test]
    fn multiple_entries_produce_multiple_lines() {
        let entries = vec![test_entry("app-a"), test_entry("app-b")];
        let block = generate_hosts_block_from(&entries);
        assert!(block.contains("127.0.0.1 app-a.localhost"));
        assert!(block.contains("127.0.0.1 app-b.localhost"));
    }

    #[test]
    fn merge_appends_to_empty_hosts() {
        let block = "# BEGIN vertz-proxy\n127.0.0.1 app.localhost\n# END vertz-proxy";
        let result = merge_into_hosts("", block);
        assert!(result.contains("127.0.0.1 app.localhost"));
    }

    #[test]
    fn merge_appends_to_existing_hosts() {
        let existing = "127.0.0.1 localhost\n::1 localhost\n";
        let block = "# BEGIN vertz-proxy\n127.0.0.1 app.localhost\n# END vertz-proxy";
        let result = merge_into_hosts(existing, block);
        assert!(result.contains("127.0.0.1 localhost"));
        assert!(result.contains("127.0.0.1 app.localhost"));
    }

    #[test]
    fn merge_replaces_existing_block() {
        let existing =
            "127.0.0.1 localhost\n# BEGIN vertz-proxy\n127.0.0.1 old.localhost\n# END vertz-proxy\n";
        let block = "# BEGIN vertz-proxy\n127.0.0.1 new.localhost\n# END vertz-proxy";
        let result = merge_into_hosts(existing, block);
        assert!(!result.contains("old.localhost"));
        assert!(result.contains("new.localhost"));
    }

    #[test]
    fn merge_removes_block_when_empty() {
        let existing =
            "127.0.0.1 localhost\n# BEGIN vertz-proxy\n127.0.0.1 old.localhost\n# END vertz-proxy\n";
        let result = merge_into_hosts(existing, "");
        assert!(!result.contains("old.localhost"));
        assert!(!result.contains("vertz-proxy"));
        assert!(result.contains("127.0.0.1 localhost"));
    }

    #[test]
    fn merge_preserves_content_after_block() {
        let existing =
            "# before\n# BEGIN vertz-proxy\n127.0.0.1 old.localhost\n# END vertz-proxy\n# after\n";
        let block = "# BEGIN vertz-proxy\n127.0.0.1 new.localhost\n# END vertz-proxy";
        let result = merge_into_hosts(existing, block);
        assert!(result.contains("# before"));
        assert!(result.contains("# after"));
        assert!(result.contains("new.localhost"));
    }
}
