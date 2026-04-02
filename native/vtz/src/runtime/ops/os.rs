use deno_core::op2;
use deno_core::OpDecl;

/// Get the OS temporary directory.
#[op2]
#[string]
pub fn op_os_tmpdir() -> String {
    std::env::temp_dir().to_string_lossy().to_string()
}

/// Get the user's home directory.
#[op2]
#[string]
pub fn op_os_homedir() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default()
}

/// Get the platform identifier (matching Node.js conventions).
#[op2]
#[string]
pub fn op_os_platform() -> String {
    if cfg!(target_os = "macos") {
        "darwin".to_string()
    } else if cfg!(target_os = "windows") {
        "win32".to_string()
    } else if cfg!(target_os = "linux") {
        "linux".to_string()
    } else {
        std::env::consts::OS.to_string()
    }
}

/// Get the CPU architecture (matching Node.js conventions).
#[op2]
#[string]
pub fn op_os_arch() -> String {
    match std::env::consts::ARCH {
        "x86_64" => "x64".to_string(),
        "aarch64" => "arm64".to_string(),
        "x86" => "ia32".to_string(),
        "arm" => "arm".to_string(),
        other => other.to_string(),
    }
}

/// Get the hostname.
#[op2]
#[string]
pub fn op_os_hostname() -> String {
    #[cfg(unix)]
    {
        let mut buf = [0u8; 256];
        unsafe {
            if libc::gethostname(buf.as_mut_ptr() as *mut libc::c_char, buf.len()) == 0 {
                let len = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
                return String::from_utf8_lossy(&buf[..len]).to_string();
            }
        }
        String::new()
    }
    #[cfg(not(unix))]
    {
        String::new()
    }
}

/// Get the op declarations for os ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![
        op_os_tmpdir(),
        op_os_homedir(),
        op_os_platform(),
        op_os_arch(),
        op_os_hostname(),
    ]
}

/// JavaScript bootstrap code for os utilities.
/// Stores the module on globalThis for synthetic node:os module access.
pub const OS_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  const EOL = Deno.core.ops.op_os_platform() === 'win32' ? '\r\n' : '\n';
  const osModule = {
    tmpdir: () => Deno.core.ops.op_os_tmpdir(),
    homedir: () => Deno.core.ops.op_os_homedir(),
    platform: () => Deno.core.ops.op_os_platform(),
    hostname: () => Deno.core.ops.op_os_hostname(),
    EOL,
    type: () => {
      const p = Deno.core.ops.op_os_platform();
      if (p === 'darwin') return 'Darwin';
      if (p === 'linux') return 'Linux';
      if (p === 'win32') return 'Windows_NT';
      return p;
    },
    arch: () => Deno.core.ops.op_os_arch(),
    cpus: () => [],
    totalmem: () => 0,
    freemem: () => 0,
    release: () => '',
    networkInterfaces: () => ({}),
    userInfo: () => ({
      username: Deno.core.ops.op_os_homedir().split('/').pop() || '',
      homedir: Deno.core.ops.op_os_homedir(),
      shell: null,
      uid: -1,
      gid: -1,
    }),
    endianness: () => 'LE',
  };
  globalThis.__vertz_os = osModule;
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap()
    }

    #[test]
    fn test_os_tmpdir_returns_string() {
        let mut rt = create_runtime();
        let result = rt.execute_script("<test>", "__vertz_os.tmpdir()").unwrap();
        let tmpdir = result.as_str().unwrap();
        assert!(!tmpdir.is_empty(), "tmpdir should not be empty");
    }

    #[test]
    fn test_os_homedir_returns_string() {
        let mut rt = create_runtime();
        let result = rt.execute_script("<test>", "__vertz_os.homedir()").unwrap();
        let homedir = result.as_str().unwrap();
        assert!(!homedir.is_empty(), "homedir should not be empty");
    }

    #[test]
    fn test_os_platform_returns_known_value() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "__vertz_os.platform()")
            .unwrap();
        let platform = result.as_str().unwrap();
        assert!(
            ["darwin", "linux", "win32"].contains(&platform),
            "Unexpected platform: {}",
            platform
        );
    }

    #[test]
    fn test_os_eol() {
        let mut rt = create_runtime();
        let result = rt.execute_script("<test>", "__vertz_os.EOL").unwrap();
        assert_eq!(result, serde_json::json!("\n"));
    }

    #[test]
    fn test_os_type_matches_platform() {
        let mut rt = create_runtime();
        let result = rt.execute_script("<test>", "__vertz_os.type()").unwrap();
        let os_type = result.as_str().unwrap();
        // On macOS, type() should return "Darwin"
        assert!(
            ["Darwin", "Linux", "Windows_NT"].contains(&os_type),
            "Unexpected os type: {}",
            os_type
        );
    }

    #[test]
    fn test_os_hostname_returns_string() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "__vertz_os.hostname()")
            .unwrap();
        // hostname might be empty in some environments, but should be a string
        assert!(result.is_string());
    }

    #[test]
    fn test_os_user_info() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const info = __vertz_os.userInfo();
                [typeof info.username, typeof info.homedir]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["string", "string"]));
    }
}
