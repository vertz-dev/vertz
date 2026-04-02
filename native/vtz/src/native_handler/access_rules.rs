//! Rust-native access rule evaluation, mirroring @vertz/server rules.* descriptors.
//!
//! Each rule is a discriminated union with a `type` field, exactly matching
//! the TypeScript runtime representation.

use crate::native_handler::jwt::JwtClaims;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------- Rule Types ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum AccessRule {
    Public,
    Authenticated,
    Where {
        conditions: HashMap<String, WhereValue>,
    },
    All {
        rules: Vec<AccessRule>,
    },
    Any {
        rules: Vec<AccessRule>,
    },
    Role {
        roles: Vec<String>,
    },
    Entitlement {
        entitlement: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum WhereValue {
    Marker(UserMarker),
    Literal(serde_json::Value),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserMarker {
    #[serde(rename = "__marker")]
    pub marker: String,
}

// ---------- Evaluation Result ----------

#[derive(Debug, Clone)]
pub struct EvalResult {
    pub allowed: bool,
    pub where_conditions: Vec<(String, serde_json::Value)>,
}

#[derive(Debug)]
pub enum AccessError {
    Denied(String),
}

impl std::fmt::Display for AccessError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AccessError::Denied(msg) => write!(f, "Access denied: {}", msg),
        }
    }
}

impl std::error::Error for AccessError {}

// ---------- Evaluation ----------

/// Evaluate an access rule against JWT claims.
/// Returns the resolved WHERE conditions for DB push-down.
pub fn evaluate(rule: &AccessRule, claims: &JwtClaims) -> Result<EvalResult, AccessError> {
    match rule {
        AccessRule::Public => Ok(EvalResult {
            allowed: true,
            where_conditions: vec![],
        }),

        AccessRule::Authenticated => {
            if claims.sub.is_empty() {
                Err(AccessError::Denied("Not authenticated".to_string()))
            } else {
                Ok(EvalResult {
                    allowed: true,
                    where_conditions: vec![],
                })
            }
        }

        AccessRule::Role { roles } => {
            let has_role = claims.roles.iter().any(|r| roles.contains(r));
            if has_role {
                Ok(EvalResult {
                    allowed: true,
                    where_conditions: vec![],
                })
            } else {
                Err(AccessError::Denied(format!("Requires role: {:?}", roles)))
            }
        }

        AccessRule::Entitlement { entitlement } => {
            // For the POC, entitlements are not resolved via defineAccess.
            // Just check if the role matches a simple mapping.
            Err(AccessError::Denied(format!(
                "Entitlement check not implemented in POC: {}",
                entitlement
            )))
        }

        AccessRule::Where { conditions } => {
            let mut resolved = Vec::new();
            for (field, value) in conditions {
                let resolved_value = resolve_where_value(value, claims)?;
                resolved.push((field.clone(), resolved_value));
            }
            Ok(EvalResult {
                allowed: true,
                where_conditions: resolved,
            })
        }

        AccessRule::All { rules } => {
            let mut all_conditions = Vec::new();
            for sub_rule in rules {
                let result = evaluate(sub_rule, claims)?;
                all_conditions.extend(result.where_conditions);
            }
            Ok(EvalResult {
                allowed: true,
                where_conditions: all_conditions,
            })
        }

        AccessRule::Any { rules } => {
            let mut last_error = None;
            for sub_rule in rules {
                match evaluate(sub_rule, claims) {
                    Ok(result) => return Ok(result),
                    Err(e) => last_error = Some(e),
                }
            }
            Err(last_error.unwrap_or_else(|| AccessError::Denied("No rules matched".to_string())))
        }
    }
}

fn resolve_where_value(
    value: &WhereValue,
    claims: &JwtClaims,
) -> Result<serde_json::Value, AccessError> {
    match value {
        WhereValue::Literal(v) => Ok(v.clone()),
        WhereValue::Marker(m) => match m.marker.as_str() {
            "user.id" => Ok(serde_json::Value::String(claims.sub.clone())),
            "user.tenantId" => Ok(claims
                .tenant_id
                .as_ref()
                .map(|t| serde_json::Value::String(t.clone()))
                .unwrap_or(serde_json::Value::Null)),
            _ => Err(AccessError::Denied(format!(
                "Unknown user marker: {}",
                m.marker
            ))),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_claims() -> JwtClaims {
        JwtClaims {
            sub: "user-042".to_string(),
            tenant_id: Some("tenant-001".to_string()),
            roles: vec!["user".to_string()],
            exp: 0,
            iat: 0,
        }
    }

    #[test]
    fn public_always_allows() {
        let result = evaluate(&AccessRule::Public, &test_claims());
        assert!(result.is_ok());
        assert!(result.unwrap().allowed);
    }

    #[test]
    fn authenticated_checks_sub() {
        let result = evaluate(&AccessRule::Authenticated, &test_claims());
        assert!(result.is_ok());

        let mut empty_claims = test_claims();
        empty_claims.sub = String::new();
        let result = evaluate(&AccessRule::Authenticated, &empty_claims);
        assert!(result.is_err());
    }

    #[test]
    fn where_resolves_user_marker() {
        let mut conditions = HashMap::new();
        conditions.insert(
            "userId".to_string(),
            WhereValue::Marker(UserMarker {
                marker: "user.id".to_string(),
            }),
        );
        let rule = AccessRule::Where { conditions };
        let result = evaluate(&rule, &test_claims()).unwrap();
        assert_eq!(result.where_conditions.len(), 1);
        assert_eq!(result.where_conditions[0].0, "userId");
        assert_eq!(
            result.where_conditions[0].1,
            serde_json::Value::String("user-042".to_string())
        );
    }

    #[test]
    fn all_requires_all_to_pass() {
        let rule = AccessRule::All {
            rules: vec![
                AccessRule::Authenticated,
                AccessRule::Where {
                    conditions: {
                        let mut m = HashMap::new();
                        m.insert(
                            "userId".to_string(),
                            WhereValue::Marker(UserMarker {
                                marker: "user.id".to_string(),
                            }),
                        );
                        m
                    },
                },
            ],
        };
        let result = evaluate(&rule, &test_claims()).unwrap();
        assert!(result.allowed);
        assert_eq!(result.where_conditions.len(), 1);
    }

    #[test]
    fn all_fails_if_any_fails() {
        let mut empty_claims = test_claims();
        empty_claims.sub = String::new();
        let rule = AccessRule::All {
            rules: vec![AccessRule::Authenticated, AccessRule::Public],
        };
        let result = evaluate(&rule, &empty_claims);
        assert!(result.is_err());
    }

    #[test]
    fn any_passes_if_one_passes() {
        let rule = AccessRule::Any {
            rules: vec![
                AccessRule::Role {
                    roles: vec!["admin".to_string()],
                },
                AccessRule::Authenticated,
            ],
        };
        let result = evaluate(&rule, &test_claims()).unwrap();
        assert!(result.allowed);
    }

    #[test]
    fn role_check_works() {
        let rule = AccessRule::Role {
            roles: vec!["user".to_string(), "admin".to_string()],
        };
        let result = evaluate(&rule, &test_claims());
        assert!(result.is_ok());

        let rule = AccessRule::Role {
            roles: vec!["admin".to_string()],
        };
        let result = evaluate(&rule, &test_claims());
        assert!(result.is_err());
    }
}
