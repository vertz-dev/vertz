use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

/// Configuration for a signal-returning API.
pub struct SignalApiConfig {
    /// Properties that are signals and need auto-unwrapping.
    pub signal_properties: HashSet<&'static str>,
    /// Properties that are plain values (no unwrapping needed).
    pub plain_properties: HashSet<&'static str>,
    /// Per-field signal properties (e.g., form field error/dirty/touched/value).
    pub field_signal_properties: Option<HashSet<&'static str>>,
}

/// Core signal-returning APIs from @vertz/ui.
pub static SIGNAL_API_REGISTRY: LazyLock<HashMap<&'static str, SignalApiConfig>> =
    LazyLock::new(|| {
        let mut m = HashMap::new();
        m.insert(
            "query",
            SignalApiConfig {
                signal_properties: HashSet::from([
                    "data",
                    "loading",
                    "error",
                    "revalidating",
                    "idle",
                ]),
                plain_properties: HashSet::from(["refetch", "revalidate", "dispose"]),
                field_signal_properties: None,
            },
        );
        m.insert(
            "form",
            SignalApiConfig {
                signal_properties: HashSet::from(["submitting", "dirty", "valid"]),
                plain_properties: HashSet::from([
                    "action",
                    "method",
                    "onSubmit",
                    "reset",
                    "setFieldError",
                    "submit",
                ]),
                field_signal_properties: Some(HashSet::from([
                    "error", "dirty", "touched", "value",
                ])),
            },
        );
        m.insert(
            "createLoader",
            SignalApiConfig {
                signal_properties: HashSet::from(["data", "loading", "error"]),
                plain_properties: HashSet::from(["refetch"]),
                field_signal_properties: None,
            },
        );
        m.insert(
            "can",
            SignalApiConfig {
                signal_properties: HashSet::from([
                    "allowed", "reasons", "reason", "meta", "loading",
                ]),
                plain_properties: HashSet::new(),
                field_signal_properties: None,
            },
        );
        m
    });

/// APIs that return objects whose properties are all reactive sources.
pub static REACTIVE_SOURCE_APIS: LazyLock<HashSet<&'static str>> =
    LazyLock::new(|| HashSet::from(["useContext", "useAuth", "useSearchParams"]));

/// Get the config for a signal API, if registered.
pub fn get_signal_api_config(name: &str) -> Option<&'static SignalApiConfig> {
    SIGNAL_API_REGISTRY.get(name)
}
