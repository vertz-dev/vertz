use serde::{Deserialize, Serialize};

/// HMR message types sent from server to client via WebSocket.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum HmrMessage {
    /// Sent when a client first connects to the HMR WebSocket.
    #[serde(rename = "connected")]
    Connected,

    /// Module update: one or more modules have changed and should be re-imported.
    #[serde(rename = "update")]
    Update {
        /// URL paths of the changed modules (e.g., "/src/components/Button.tsx").
        modules: Vec<String>,
        /// Timestamp for cache-busting dynamic imports.
        timestamp: u64,
    },

    /// Full page reload required (e.g., entry file changed).
    #[serde(rename = "full-reload")]
    FullReload {
        /// Reason for the full reload.
        reason: String,
    },

    /// CSS-only update: a CSS file changed, swap without page reload.
    #[serde(rename = "css-update")]
    CssUpdate {
        /// URL path of the changed CSS file.
        file: String,
        /// Timestamp for cache-busting.
        timestamp: u64,
    },

    /// Navigate command sent from LLM API to client.
    #[serde(rename = "navigate")]
    Navigate {
        /// URL path to navigate to.
        to: String,
    },
}

impl HmrMessage {
    /// Serialize the message to a JSON string.
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| r#"{"type":"connected"}"#.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connected_message_json() {
        let msg = HmrMessage::Connected;
        let json = msg.to_json();
        assert_eq!(json, r#"{"type":"connected"}"#);
    }

    #[test]
    fn test_update_message_json() {
        let msg = HmrMessage::Update {
            modules: vec!["/src/Button.tsx".to_string()],
            timestamp: 1234567890,
        };
        let json = msg.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["type"], "update");
        assert_eq!(parsed["modules"][0], "/src/Button.tsx");
        assert_eq!(parsed["timestamp"], 1234567890);
    }

    #[test]
    fn test_full_reload_message_json() {
        let msg = HmrMessage::FullReload {
            reason: "entry file changed".to_string(),
        };
        let json = msg.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["type"], "full-reload");
        assert_eq!(parsed["reason"], "entry file changed");
    }

    #[test]
    fn test_css_update_message_json() {
        let msg = HmrMessage::CssUpdate {
            file: "/src/styles.css".to_string(),
            timestamp: 9999,
        };
        let json = msg.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["type"], "css-update");
        assert_eq!(parsed["file"], "/src/styles.css");
        assert_eq!(parsed["timestamp"], 9999);
    }

    #[test]
    fn test_update_multiple_modules() {
        let msg = HmrMessage::Update {
            modules: vec![
                "/src/Button.tsx".to_string(),
                "/src/Card.tsx".to_string(),
                "/src/app.tsx".to_string(),
            ],
            timestamp: 100,
        };
        let json = msg.to_json();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["modules"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn test_message_roundtrip() {
        let msg = HmrMessage::Update {
            modules: vec!["/src/app.tsx".to_string()],
            timestamp: 42,
        };
        let json = msg.to_json();
        let deserialized: HmrMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(msg, deserialized);
    }
}
