use rcgen::{CertificateParams, Issuer, KeyPair};
use std::path::{Path, PathBuf};

/// Write a file with restrictive permissions (owner-only read/write: 0o600).
#[cfg(unix)]
fn write_private(path: &Path, contents: &str) -> std::io::Result<()> {
    use std::os::unix::fs::OpenOptionsExt;
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true).mode(0o600);
    std::io::Write::write_all(&mut opts.open(path)?, contents.as_bytes())
}

#[cfg(not(unix))]
fn write_private(path: &Path, contents: &str) -> std::io::Result<()> {
    std::fs::write(path, contents)
}

/// Generate a root CA certificate and private key, writing PEM files to `dir`.
///
/// Creates `ca-cert.pem` and `ca-key.pem` in the given directory.
pub fn generate_ca(dir: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;

    // Don't overwrite an existing CA — regenerating would invalidate all server certs
    if has_ca(dir) {
        return Ok(());
    }

    let mut params = CertificateParams::new(Vec::<String>::new()).map_err(std::io::Error::other)?;
    params.is_ca = rcgen::IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
    params
        .distinguished_name
        .push(rcgen::DnType::CommonName, "Vertz Dev CA");
    params
        .distinguished_name
        .push(rcgen::DnType::OrganizationName, "Vertz");

    let key_pair = KeyPair::generate().map_err(std::io::Error::other)?;
    let cert = params
        .self_signed(&key_pair)
        .map_err(std::io::Error::other)?;

    std::fs::write(dir.join("ca-cert.pem"), cert.pem())?;
    write_private(&dir.join("ca-key.pem"), &key_pair.serialize_pem())?;

    Ok(())
}

/// Check if CA certificate files exist in `dir`.
pub fn has_ca(dir: &Path) -> bool {
    dir.join("ca-cert.pem").exists() && dir.join("ca-key.pem").exists()
}

/// Check if server certificate files exist in `dir`.
pub fn has_server_cert(dir: &Path) -> bool {
    dir.join("server-cert.pem").exists() && dir.join("server-key.pem").exists()
}

/// Generate a server certificate for `*.localhost` signed by the CA in `dir`.
///
/// Reads `ca-cert.pem` and `ca-key.pem`, then writes `server-cert.pem` and `server-key.pem`.
pub fn generate_server_cert(dir: &Path) -> std::io::Result<()> {
    let ca_cert_pem = std::fs::read_to_string(dir.join("ca-cert.pem"))?;
    let ca_key_pem = std::fs::read_to_string(dir.join("ca-key.pem"))?;

    let ca_key = KeyPair::from_pem(&ca_key_pem).map_err(std::io::Error::other)?;
    let ca_issuer =
        Issuer::from_ca_cert_pem(&ca_cert_pem, ca_key).map_err(std::io::Error::other)?;

    let san = vec![
        rcgen::SanType::DnsName("localhost".try_into().map_err(std::io::Error::other)?),
        rcgen::SanType::DnsName("*.localhost".try_into().map_err(std::io::Error::other)?),
    ];
    let mut server_params =
        CertificateParams::new(Vec::<String>::new()).map_err(std::io::Error::other)?;
    server_params.subject_alt_names = san;
    server_params
        .distinguished_name
        .push(rcgen::DnType::CommonName, "localhost");

    let server_key = KeyPair::generate().map_err(std::io::Error::other)?;
    let server_cert = server_params
        .signed_by(&server_key, &ca_issuer)
        .map_err(std::io::Error::other)?;

    std::fs::write(dir.join("server-cert.pem"), server_cert.pem())?;
    write_private(&dir.join("server-key.pem"), &server_key.serialize_pem())?;

    Ok(())
}

/// Return the path to the CA certificate file.
pub fn ca_cert_path(dir: &Path) -> PathBuf {
    dir.join("ca-cert.pem")
}

/// Build the shell command to install the CA cert in the macOS trust store.
///
/// Returns the command and arguments. The caller is responsible for running it
/// (typically via `sudo` since it modifies the system keychain).
pub fn trust_store_command(dir: &Path) -> (String, Vec<String>) {
    let cert_path = ca_cert_path(dir).display().to_string();
    (
        "security".to_string(),
        vec![
            "add-trusted-cert".to_string(),
            "-d".to_string(),
            "-r".to_string(),
            "trustRoot".to_string(),
            "-k".to_string(),
            "/Library/Keychains/System.keychain".to_string(),
            cert_path,
        ],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_server_cert_creates_files_signed_by_ca() {
        let dir = tempfile::tempdir().unwrap();
        generate_ca(dir.path()).unwrap();
        generate_server_cert(dir.path()).unwrap();

        let cert_path = dir.path().join("server-cert.pem");
        let key_path = dir.path().join("server-key.pem");

        assert!(cert_path.exists(), "Server cert file should be created");
        assert!(key_path.exists(), "Server key file should be created");

        let cert_pem = std::fs::read_to_string(&cert_path).unwrap();
        let key_pem = std::fs::read_to_string(&key_path).unwrap();

        assert!(cert_pem.contains("BEGIN CERTIFICATE"));
        assert!(key_pem.contains("BEGIN PRIVATE KEY"));
    }

    #[test]
    fn generate_server_cert_fails_without_ca() {
        let dir = tempfile::tempdir().unwrap();
        assert!(generate_server_cert(dir.path()).is_err());
    }

    #[test]
    fn has_server_cert_returns_false_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!has_server_cert(dir.path()));
    }

    #[test]
    fn has_server_cert_returns_true_when_present() {
        let dir = tempfile::tempdir().unwrap();
        generate_ca(dir.path()).unwrap();
        generate_server_cert(dir.path()).unwrap();
        assert!(has_server_cert(dir.path()));
    }

    #[test]
    fn trust_store_command_contains_cert_path() {
        let dir = std::path::Path::new("/home/user/.vtz/proxy");
        let (cmd, args) = trust_store_command(dir);
        assert_eq!(cmd, "security");
        assert!(args.contains(&"add-trusted-cert".to_string()));
        assert!(args.contains(&"/home/user/.vtz/proxy/ca-cert.pem".to_string()));
    }

    #[test]
    fn ca_cert_path_returns_correct_path() {
        let dir = std::path::Path::new("/home/user/.vtz/proxy");
        assert_eq!(
            ca_cert_path(dir),
            std::path::PathBuf::from("/home/user/.vtz/proxy/ca-cert.pem")
        );
    }

    #[cfg(unix)]
    #[test]
    fn generate_ca_key_has_restrictive_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        generate_ca(dir.path()).unwrap();

        let key_perms = std::fs::metadata(dir.path().join("ca-key.pem"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(
            key_perms, 0o600,
            "CA key should be owner-only (0o600), got {key_perms:o}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn generate_server_cert_key_has_restrictive_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        generate_ca(dir.path()).unwrap();
        generate_server_cert(dir.path()).unwrap();

        let key_perms = std::fs::metadata(dir.path().join("server-key.pem"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(
            key_perms, 0o600,
            "Server key should be owner-only (0o600), got {key_perms:o}"
        );
    }

    #[test]
    fn has_ca_returns_false_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!has_ca(dir.path()));
    }

    #[test]
    fn has_ca_returns_true_when_present() {
        let dir = tempfile::tempdir().unwrap();
        generate_ca(dir.path()).unwrap();
        assert!(has_ca(dir.path()));
    }

    #[test]
    fn generate_ca_does_not_overwrite_existing() {
        let dir = tempfile::tempdir().unwrap();
        generate_ca(dir.path()).unwrap();
        let original_key = std::fs::read_to_string(dir.path().join("ca-key.pem")).unwrap();

        // Second call should not overwrite
        generate_ca(dir.path()).unwrap();
        let second_key = std::fs::read_to_string(dir.path().join("ca-key.pem")).unwrap();
        assert_eq!(
            original_key, second_key,
            "generate_ca should not overwrite existing CA"
        );
    }

    #[test]
    fn generate_ca_creates_cert_and_key_files() {
        let dir = tempfile::tempdir().unwrap();
        generate_ca(dir.path()).unwrap();

        let cert_path = dir.path().join("ca-cert.pem");
        let key_path = dir.path().join("ca-key.pem");

        assert!(cert_path.exists(), "CA cert file should be created");
        assert!(key_path.exists(), "CA key file should be created");

        let cert_pem = std::fs::read_to_string(&cert_path).unwrap();
        let key_pem = std::fs::read_to_string(&key_path).unwrap();

        assert!(cert_pem.contains("BEGIN CERTIFICATE"));
        assert!(key_pem.contains("BEGIN PRIVATE KEY"));
    }
}
