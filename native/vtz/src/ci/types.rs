use serde::de::{self, MapAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::BTreeMap;
use std::fmt;

// ---------------------------------------------------------------------------
// Top-level config
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipeConfig {
    #[serde(default)]
    pub secrets: Vec<String>,
    pub workspace: Option<WorkspaceConfig>,
    pub tasks: BTreeMap<String, TaskDef>,
    #[serde(default)]
    pub workflows: BTreeMap<String, WorkflowConfig>,
    pub cache: Option<CacheConfig>,
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceConfig {
    #[serde(default)]
    pub packages: Vec<String>,
    pub native: Option<NativeWorkspaceConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeWorkspaceConfig {
    pub root: String,
    pub members: Vec<String>,
}

// ---------------------------------------------------------------------------
// Tasks — discriminated union: Command xor Steps
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum TaskDef {
    Command(CommandTask),
    Steps(StepsTask),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandTask {
    pub command: String,
    #[serde(flatten)]
    pub base: TaskBase,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepsTask {
    pub steps: Vec<String>,
    #[serde(flatten)]
    pub base: TaskBase,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TaskBase {
    #[serde(default)]
    pub deps: Vec<Dep>,
    pub cond: Option<Condition>,
    pub cache: Option<TaskCacheConfig>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    pub timeout: Option<u64>,
    #[serde(default)]
    pub scope: TaskScope,
}

impl TaskDef {
    pub fn base(&self) -> &TaskBase {
        match self {
            TaskDef::Command(t) => &t.base,
            TaskDef::Steps(t) => &t.base,
        }
    }

    pub fn command_str(&self) -> Option<&str> {
        match self {
            TaskDef::Command(t) => Some(&t.command),
            TaskDef::Steps(_) => None,
        }
    }

    pub fn steps(&self) -> Option<&[String]> {
        match self {
            TaskDef::Steps(t) => Some(&t.steps),
            TaskDef::Command(_) => None,
        }
    }
}

// Custom deserializer: if JSON has "command" → Command, "steps" → Steps, both → error
impl<'de> Deserialize<'de> for TaskDef {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        // Deserialize into a raw JSON value first to inspect fields
        let value = serde_json::Value::deserialize(deserializer)?;
        let obj = value
            .as_object()
            .ok_or_else(|| de::Error::custom("task definition must be an object"))?;

        let has_command = obj.contains_key("command");
        let has_steps = obj.contains_key("steps");

        match (has_command, has_steps) {
            (true, true) => Err(de::Error::custom(
                "task definition cannot have both 'command' and 'steps' — use one or the other",
            )),
            (false, false) => Err(de::Error::custom(
                "task definition must have either 'command' or 'steps'",
            )),
            (true, false) => {
                let task: CommandTask = serde_json::from_value(value).map_err(de::Error::custom)?;
                Ok(TaskDef::Command(task))
            }
            (false, true) => {
                let task: StepsTask = serde_json::from_value(value).map_err(de::Error::custom)?;
                Ok(TaskDef::Steps(task))
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Task scope
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskScope {
    #[default]
    Package,
    Root,
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(untagged)]
pub enum Dep {
    /// Bare string dep: "build" or "^build". skip=continue, fail=block.
    Simple(String),
    /// Explicit control: { task, on }
    Edge(DepEdge),
}

// Custom deserializer: string → Simple, object → Edge
impl<'de> Deserialize<'de> for Dep {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct DepVisitor;

        impl<'de> Visitor<'de> for DepVisitor {
            type Value = Dep;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a string or a dependency edge object { task, on }")
            }

            fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
                Ok(Dep::Simple(v.to_string()))
            }

            fn visit_string<E: de::Error>(self, v: String) -> Result<Self::Value, E> {
                Ok(Dep::Simple(v))
            }

            fn visit_map<M: MapAccess<'de>>(self, map: M) -> Result<Self::Value, M::Error> {
                let edge = DepEdge::deserialize(de::value::MapAccessDeserializer::new(map))?;
                Ok(Dep::Edge(edge))
            }
        }

        deserializer.deserialize_any(DepVisitor)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepEdge {
    pub task: String,
    pub on: DepCondition,
}

#[derive(Debug, Clone, Serialize)]
pub enum DepCondition {
    Success,
    Always,
    Failure,
    /// Callback ID — evaluated via the Bun bridge at runtime
    Callback(u64),
}

// Custom deserializer: string shortcut or { type: "callback", id: N }
impl<'de> Deserialize<'de> for DepCondition {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct DepCondVisitor;

        impl<'de> Visitor<'de> for DepCondVisitor {
            type Value = DepCondition;

            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str(
                    "'success', 'always', 'failure', or { type: 'callback', id: <number> }",
                )
            }

            fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
                match v {
                    "success" => Ok(DepCondition::Success),
                    "always" => Ok(DepCondition::Always),
                    "failure" => Ok(DepCondition::Failure),
                    other => Err(de::Error::unknown_variant(
                        other,
                        &["success", "always", "failure"],
                    )),
                }
            }

            fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
                let mut typ: Option<String> = None;
                let mut id: Option<u64> = None;

                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "type" => typ = Some(map.next_value()?),
                        "id" => id = Some(map.next_value()?),
                        _ => {
                            let _ = map.next_value::<serde_json::Value>()?;
                        }
                    }
                }

                match typ.as_deref() {
                    Some("callback") => {
                        let id = id.ok_or_else(|| de::Error::missing_field("id"))?;
                        Ok(DepCondition::Callback(id))
                    }
                    Some(other) => Err(de::Error::unknown_variant(other, &["callback"])),
                    None => Err(de::Error::missing_field("type")),
                }
            }
        }

        deserializer.deserialize_any(DepCondVisitor)
    }
}

// ---------------------------------------------------------------------------
// Task result (produced at runtime, passed to callbacks)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskResult {
    pub status: TaskStatus,
    pub exit_code: Option<i32>,
    #[serde(rename = "duration")]
    pub duration_ms: u64,
    pub package: Option<String>,
    pub task: String,
    pub cached: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Success,
    Failed,
    Skipped,
}

// ---------------------------------------------------------------------------
// Conditions (cond.* builders produce these)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Condition {
    Changed { patterns: Vec<String> },
    Branch { names: Vec<String> },
    Env { name: String, value: Option<String> },
    All { conditions: Vec<Condition> },
    Any { conditions: Vec<Condition> },
}

impl<'de> Deserialize<'de> for Condition {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        let obj = value
            .as_object()
            .ok_or_else(|| de::Error::custom("condition must be an object"))?;

        let typ = obj
            .get("type")
            .and_then(|v| v.as_str())
            .ok_or_else(|| de::Error::missing_field("type"))?;

        match typ {
            "changed" => {
                let patterns = obj
                    .get("patterns")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .map(|v| {
                                v.as_str()
                                    .map(String::from)
                                    .ok_or_else(|| de::Error::custom("pattern must be a string"))
                            })
                            .collect::<Result<Vec<_>, _>>()
                    })
                    .transpose()?
                    .unwrap_or_default();
                Ok(Condition::Changed { patterns })
            }
            "branch" => {
                let names = obj
                    .get("names")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .map(|v| {
                                v.as_str().map(String::from).ok_or_else(|| {
                                    de::Error::custom("branch name must be a string")
                                })
                            })
                            .collect::<Result<Vec<_>, _>>()
                    })
                    .transpose()?
                    .unwrap_or_default();
                Ok(Condition::Branch { names })
            }
            "env" => {
                let name = obj
                    .get("name")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| de::Error::missing_field("name"))?
                    .to_string();
                let value = obj.get("value").and_then(|v| v.as_str()).map(String::from);
                Ok(Condition::Env { name, value })
            }
            "all" => {
                let conditions: Vec<Condition> = obj
                    .get("conditions")
                    .cloned()
                    .map(|v| serde_json::from_value(v).map_err(de::Error::custom))
                    .transpose()?
                    .unwrap_or_default();
                Ok(Condition::All { conditions })
            }
            "any" => {
                let conditions: Vec<Condition> = obj
                    .get("conditions")
                    .cloned()
                    .map(|v| serde_json::from_value(v).map_err(de::Error::custom))
                    .transpose()?
                    .unwrap_or_default();
                Ok(Condition::Any { conditions })
            }
            other => Err(de::Error::unknown_variant(
                other,
                &["changed", "branch", "env", "all", "any"],
            )),
        }
    }
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowConfig {
    pub run: Vec<String>,
    #[serde(default)]
    pub filter: WorkflowFilter,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(untagged)]
pub enum WorkflowFilter {
    Affected,
    #[default]
    All,
    Packages(Vec<String>),
}

impl<'de> Deserialize<'de> for WorkflowFilter {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        match &value {
            serde_json::Value::String(s) => match s.as_str() {
                "affected" => Ok(WorkflowFilter::Affected),
                "all" => Ok(WorkflowFilter::All),
                other => Err(de::Error::unknown_variant(other, &["affected", "all"])),
            },
            serde_json::Value::Array(arr) => {
                let packages = arr
                    .iter()
                    .map(|v| {
                        v.as_str()
                            .map(String::from)
                            .ok_or_else(|| de::Error::custom("filter array items must be strings"))
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(WorkflowFilter::Packages(packages))
            }
            _ => Err(de::Error::custom(
                "filter must be 'affected', 'all', or a string array",
            )),
        }
    }
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheConfig {
    pub local: Option<String>,
    pub remote: Option<RemoteCacheConfig>,
    pub max_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub enum RemoteCacheConfig {
    Auto,
    Url(String),
    Disabled,
}

impl<'de> Deserialize<'de> for RemoteCacheConfig {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        match &value {
            serde_json::Value::String(s) => match s.as_str() {
                "auto" => Ok(RemoteCacheConfig::Auto),
                url => Ok(RemoteCacheConfig::Url(url.to_string())),
            },
            serde_json::Value::Bool(false) => Ok(RemoteCacheConfig::Disabled),
            _ => Err(de::Error::custom(
                "remote cache must be 'auto', a URL string, or false",
            )),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCacheConfig {
    pub inputs: Vec<String>,
    pub outputs: Vec<String>,
}

// ---------------------------------------------------------------------------
// Resolved workspace (produced by workspace resolution, not from config JSON)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Default)]
pub struct ResolvedWorkspace {
    pub packages: BTreeMap<String, WorkspacePackage>,
    pub native_crates: BTreeMap<String, NativeCrate>,
}

#[derive(Debug, Clone)]
pub struct WorkspacePackage {
    pub name: String,
    pub version: String,
    pub path: std::path::PathBuf,
    /// Names of other workspace packages this depends on
    pub internal_deps: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct NativeCrate {
    pub name: String,
    pub path: std::path::PathBuf,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialize_command_task() {
        let json = r#"{"command": "bun run build"}"#;
        let task: TaskDef = serde_json::from_str(json).unwrap();
        assert!(matches!(task, TaskDef::Command(_)));
        assert_eq!(task.command_str(), Some("bun run build"));
    }

    #[test]
    fn deserialize_steps_task() {
        let json = r#"{"steps": ["cargo fmt", "cargo clippy"]}"#;
        let task: TaskDef = serde_json::from_str(json).unwrap();
        assert!(matches!(task, TaskDef::Steps(_)));
        assert_eq!(task.steps().unwrap().len(), 2);
    }

    #[test]
    fn reject_both_command_and_steps() {
        let json = r#"{"command": "build", "steps": ["a"]}"#;
        let result: Result<TaskDef, _> = serde_json::from_str(json);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("cannot have both"));
    }

    #[test]
    fn reject_neither_command_nor_steps() {
        let json = r#"{"env": {"FOO": "bar"}}"#;
        let result: Result<TaskDef, _> = serde_json::from_str(json);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("must have either"));
    }

    #[test]
    fn deserialize_simple_dep() {
        let json = r#""^build""#;
        let dep: Dep = serde_json::from_str(json).unwrap();
        assert!(matches!(dep, Dep::Simple(ref s) if s == "^build"));
    }

    #[test]
    fn deserialize_dep_edge_success() {
        let json = r#"{"task": "build", "on": "success"}"#;
        let dep: Dep = serde_json::from_str(json).unwrap();
        match dep {
            Dep::Edge(edge) => {
                assert_eq!(edge.task, "build");
                assert!(matches!(edge.on, DepCondition::Success));
            }
            _ => panic!("expected Edge"),
        }
    }

    #[test]
    fn deserialize_dep_edge_always() {
        let json = r#"{"task": "lint", "on": "always"}"#;
        let dep: Dep = serde_json::from_str(json).unwrap();
        match dep {
            Dep::Edge(edge) => {
                assert_eq!(edge.task, "lint");
                assert!(matches!(edge.on, DepCondition::Always));
            }
            _ => panic!("expected Edge"),
        }
    }

    #[test]
    fn deserialize_dep_edge_failure() {
        let json = r#"{"task": "deploy", "on": "failure"}"#;
        let dep: Dep = serde_json::from_str(json).unwrap();
        match dep {
            Dep::Edge(edge) => {
                assert_eq!(edge.task, "deploy");
                assert!(matches!(edge.on, DepCondition::Failure));
            }
            _ => panic!("expected Edge"),
        }
    }

    #[test]
    fn deserialize_dep_edge_callback() {
        let json = r#"{"task": "smoke-test", "on": {"type": "callback", "id": 3}}"#;
        let dep: Dep = serde_json::from_str(json).unwrap();
        match dep {
            Dep::Edge(edge) => {
                assert_eq!(edge.task, "smoke-test");
                assert!(matches!(edge.on, DepCondition::Callback(3)));
            }
            _ => panic!("expected Edge"),
        }
    }

    #[test]
    fn reject_invalid_dep_condition() {
        let json = r#"{"task": "build", "on": "maybe"}"#;
        let result: Result<Dep, _> = serde_json::from_str(json);
        assert!(result.is_err());
    }

    #[test]
    fn deserialize_condition_changed() {
        let json = r#"{"type": "changed", "patterns": ["src/**", "package.json"]}"#;
        let cond: Condition = serde_json::from_str(json).unwrap();
        match cond {
            Condition::Changed { patterns } => {
                assert_eq!(patterns, vec!["src/**", "package.json"]);
            }
            _ => panic!("expected Changed"),
        }
    }

    #[test]
    fn deserialize_condition_branch() {
        let json = r#"{"type": "branch", "names": ["main", "release/*"]}"#;
        let cond: Condition = serde_json::from_str(json).unwrap();
        assert!(matches!(cond, Condition::Branch { names } if names.len() == 2));
    }

    #[test]
    fn deserialize_condition_env() {
        let json = r#"{"type": "env", "name": "CI"}"#;
        let cond: Condition = serde_json::from_str(json).unwrap();
        assert!(matches!(cond, Condition::Env { name, value } if name == "CI" && value.is_none()));
    }

    #[test]
    fn deserialize_condition_env_with_value() {
        let json = r#"{"type": "env", "name": "NODE_ENV", "value": "production"}"#;
        let cond: Condition = serde_json::from_str(json).unwrap();
        assert!(
            matches!(cond, Condition::Env { name, value } if name == "NODE_ENV" && value.as_deref() == Some("production"))
        );
    }

    #[test]
    fn deserialize_condition_all() {
        let json = r#"{"type": "all", "conditions": [{"type": "changed", "patterns": ["native/**"]}, {"type": "branch", "names": ["main"]}]}"#;
        let cond: Condition = serde_json::from_str(json).unwrap();
        match cond {
            Condition::All { conditions } => assert_eq!(conditions.len(), 2),
            _ => panic!("expected All"),
        }
    }

    #[test]
    fn deserialize_condition_any() {
        let json = r#"{"type": "any", "conditions": [{"type": "env", "name": "CI"}, {"type": "branch", "names": ["main"]}]}"#;
        let cond: Condition = serde_json::from_str(json).unwrap();
        match cond {
            Condition::Any { conditions } => assert_eq!(conditions.len(), 2),
            _ => panic!("expected Any"),
        }
    }

    #[test]
    fn deserialize_workflow_filter_affected() {
        let json = r#""affected""#;
        let filter: WorkflowFilter = serde_json::from_str(json).unwrap();
        assert!(matches!(filter, WorkflowFilter::Affected));
    }

    #[test]
    fn deserialize_workflow_filter_all() {
        let json = r#""all""#;
        let filter: WorkflowFilter = serde_json::from_str(json).unwrap();
        assert!(matches!(filter, WorkflowFilter::All));
    }

    #[test]
    fn deserialize_workflow_filter_packages() {
        let json = r#"["@vertz/ui", "@vertz/core"]"#;
        let filter: WorkflowFilter = serde_json::from_str(json).unwrap();
        match filter {
            WorkflowFilter::Packages(pkgs) => {
                assert_eq!(pkgs, vec!["@vertz/ui", "@vertz/core"]);
            }
            _ => panic!("expected Packages"),
        }
    }

    #[test]
    fn deserialize_task_scope_defaults_to_package() {
        let json = r#"{"command": "bun test"}"#;
        let task: TaskDef = serde_json::from_str(json).unwrap();
        assert_eq!(task.base().scope, TaskScope::Package);
    }

    #[test]
    fn deserialize_task_scope_root() {
        let json = r#"{"command": "oxlint .", "scope": "root"}"#;
        let task: TaskDef = serde_json::from_str(json).unwrap();
        assert_eq!(task.base().scope, TaskScope::Root);
    }

    #[test]
    fn deserialize_remote_cache_auto() {
        let json = r#""auto""#;
        let remote: RemoteCacheConfig = serde_json::from_str(json).unwrap();
        assert!(matches!(remote, RemoteCacheConfig::Auto));
    }

    #[test]
    fn deserialize_remote_cache_disabled() {
        let json = r#"false"#;
        let remote: RemoteCacheConfig = serde_json::from_str(json).unwrap();
        assert!(matches!(remote, RemoteCacheConfig::Disabled));
    }

    #[test]
    fn deserialize_remote_cache_url() {
        let json = r#""s3://my-bucket/cache""#;
        let remote: RemoteCacheConfig = serde_json::from_str(json).unwrap();
        assert!(matches!(remote, RemoteCacheConfig::Url(ref u) if u == "s3://my-bucket/cache"));
    }

    #[test]
    fn deserialize_full_config() {
        let json = r#"{
            "secrets": ["NPM_TOKEN"],
            "tasks": {
                "build": {
                    "command": "bun run build",
                    "deps": ["^build"],
                    "cache": {
                        "inputs": ["src/**"],
                        "outputs": ["dist/**"]
                    }
                },
                "test": {
                    "command": "bun test",
                    "deps": ["^build", "build"]
                },
                "lint": {
                    "command": "oxlint .",
                    "scope": "root"
                },
                "rust-checks": {
                    "steps": ["cargo fmt", "cargo clippy", "cargo test"],
                    "scope": "root",
                    "cond": {"type": "changed", "patterns": ["native/**"]}
                }
            },
            "workflows": {
                "ci": {
                    "run": ["lint", "build", "test", "rust-checks"],
                    "filter": "affected"
                }
            },
            "cache": {
                "local": ".pipe/cache",
                "maxSize": 2048
            }
        }"#;

        let config: PipeConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.secrets, vec!["NPM_TOKEN"]);
        assert_eq!(config.tasks.len(), 4);
        assert!(matches!(config.tasks["build"], TaskDef::Command(_)));
        assert!(matches!(config.tasks["rust-checks"], TaskDef::Steps(_)));
        assert_eq!(config.tasks["build"].base().deps.len(), 1);
        assert!(matches!(&config.tasks["build"].base().deps[0], Dep::Simple(s) if s == "^build"));
        assert_eq!(config.tasks["test"].base().deps.len(), 2);
        assert_eq!(config.tasks["lint"].base().scope, TaskScope::Root);
        assert!(config.tasks["rust-checks"].base().cond.is_some());
        assert_eq!(config.workflows.len(), 1);
        assert!(matches!(
            config.workflows["ci"].filter,
            WorkflowFilter::Affected
        ));
        assert!(config.cache.is_some());
        assert_eq!(config.cache.as_ref().unwrap().max_size, Some(2048));
    }

    #[test]
    fn deserialize_task_result() {
        let json = r#"{
            "status": "success",
            "exitCode": 0,
            "duration": 1234,
            "package": "@vertz/ui",
            "task": "build",
            "cached": false
        }"#;
        let result: TaskResult = serde_json::from_str(json).unwrap();
        assert_eq!(result.status, TaskStatus::Success);
        assert_eq!(result.exit_code, Some(0));
        assert_eq!(result.duration_ms, 1234);
        assert_eq!(result.package.as_deref(), Some("@vertz/ui"));
        assert_eq!(result.task, "build");
        assert!(!result.cached);
    }

    #[test]
    fn serialize_task_result_for_callback() {
        let result = TaskResult {
            status: TaskStatus::Failed,
            exit_code: Some(1),
            duration_ms: 5000,
            package: None,
            task: "lint".to_string(),
            cached: false,
        };
        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains(r#""status":"failed"#));
        assert!(json.contains(r#""exitCode":1"#));
        assert!(json.contains(r#""duration":5000"#));
        assert!(json.contains(r#""package":null"#));
    }
}
