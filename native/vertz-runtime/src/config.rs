use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub port: u16,
    pub host: String,
    pub public_dir: PathBuf,
}

impl ServerConfig {
    pub fn new(port: u16, host: String, public_dir: PathBuf) -> Self {
        Self {
            port,
            host,
            public_dir,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_config_new() {
        let config = ServerConfig::new(3000, "localhost".to_string(), PathBuf::from("public"));
        assert_eq!(config.port, 3000);
        assert_eq!(config.host, "localhost");
        assert_eq!(config.public_dir, PathBuf::from("public"));
    }

    #[test]
    fn test_server_config_clone() {
        let config = ServerConfig::new(4000, "0.0.0.0".to_string(), PathBuf::from("dist"));
        let cloned = config.clone();
        assert_eq!(cloned.port, config.port);
        assert_eq!(cloned.host, config.host);
        assert_eq!(cloned.public_dir, config.public_dir);
    }
}
