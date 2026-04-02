use reqwest::header::{HeaderMap, AUTHORIZATION, USER_AGENT};
use serde::Deserialize;

/// Client for GitHub API operations needed by the package manager.
/// Only used during `vertz add` — `vertz install` from lockfile never hits the GitHub API.
pub struct GitHubClient {
    client: reqwest::Client,
}

#[derive(Deserialize)]
struct CommitResponse {
    sha: String,
}

/// Errors specific to GitHub API operations
#[derive(Debug)]
pub enum GitHubError {
    /// Repository not found (HTTP 404, no ref specified)
    RepoNotFound { owner: String, repo: String },
    /// Ref not found (HTTP 404, ref specified)
    RefNotFound {
        owner: String,
        repo: String,
        ref_: String,
    },
    /// Rate limit exceeded (HTTP 403 with X-RateLimit-Remaining: 0)
    RateLimited,
    /// Access denied (HTTP 403, not rate-limited)
    AccessDenied { owner: String, repo: String },
    /// Other HTTP or network error
    Other(String),
}

impl std::fmt::Display for GitHubError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitHubError::RepoNotFound { owner, repo } => {
                write!(f, "repository \"github:{}/{}\" not found", owner, repo)
            }
            GitHubError::RefNotFound { owner, repo, ref_ } => {
                write!(f, "ref \"{}\" not found in github:{}/{}", ref_, owner, repo)
            }
            GitHubError::RateLimited => {
                write!(
                    f,
                    "GitHub API rate limit exceeded. Set GITHUB_TOKEN env var to increase from 60 to 5000 requests/hour."
                )
            }
            GitHubError::AccessDenied { owner, repo } => {
                write!(
                    f,
                    "access denied to github:{}/{} — repository may be private (private repos not yet supported)",
                    owner, repo
                )
            }
            GitHubError::Other(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for GitHubError {}

impl Default for GitHubClient {
    fn default() -> Self {
        Self::new()
    }
}

impl GitHubClient {
    pub fn new() -> Self {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, "vtz/0.1.0".parse().unwrap());

        // Support GITHUB_TOKEN env var for higher rate limits
        if let Ok(token) = std::env::var("GITHUB_TOKEN") {
            if !token.is_empty() {
                if let Ok(val) = format!("Bearer {}", token).parse() {
                    headers.insert(AUTHORIZATION, val);
                }
            }
        }

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .expect("Failed to create GitHub HTTP client");

        Self { client }
    }

    /// Resolve a git ref (branch, tag, commit SHA) to a full 40-char commit SHA.
    /// Uses GitHub API: GET /repos/{owner}/{repo}/commits/{ref}
    pub async fn resolve_ref(
        &self,
        owner: &str,
        repo: &str,
        ref_: Option<&str>,
    ) -> Result<String, GitHubError> {
        let ref_str = ref_.unwrap_or("HEAD");
        let url = format!(
            "https://api.github.com/repos/{}/{}/commits/{}",
            owner, repo, ref_str
        );

        let response = self
            .client
            .get(&url)
            .header("Accept", "application/vnd.github.v3+json")
            .send()
            .await
            .map_err(|e| GitHubError::Other(format!("GitHub API request failed: {}", e)))?;

        let status = response.status();

        if status == reqwest::StatusCode::NOT_FOUND {
            return if let Some(r) = ref_ {
                Err(GitHubError::RefNotFound {
                    owner: owner.to_string(),
                    repo: repo.to_string(),
                    ref_: r.to_string(),
                })
            } else {
                Err(GitHubError::RepoNotFound {
                    owner: owner.to_string(),
                    repo: repo.to_string(),
                })
            };
        }

        if status == reqwest::StatusCode::FORBIDDEN {
            // Check if this is rate limiting
            let is_rate_limited = response
                .headers()
                .get("x-ratelimit-remaining")
                .and_then(|v| v.to_str().ok())
                .map(|v| v == "0")
                .unwrap_or(false);

            return if is_rate_limited {
                Err(GitHubError::RateLimited)
            } else {
                Err(GitHubError::AccessDenied {
                    owner: owner.to_string(),
                    repo: repo.to_string(),
                })
            };
        }

        if !status.is_success() {
            return Err(GitHubError::Other(format!(
                "GitHub API returned HTTP {} for {}/{}",
                status, owner, repo
            )));
        }

        let commit: CommitResponse = response.json().await.map_err(|e| {
            GitHubError::Other(format!("Failed to parse GitHub API response: {}", e))
        })?;

        Ok(commit.sha)
    }

    /// Construct the tarball download URL for a specific commit SHA.
    /// Uses codeload.github.com which serves tarballs directly without redirect.
    pub fn tarball_url(owner: &str, repo: &str, sha: &str) -> String {
        format!(
            "https://codeload.github.com/{}/{}/tar.gz/{}",
            owner, repo, sha
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tarball_url() {
        let url =
            GitHubClient::tarball_url("user", "my-lib", "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2");
        assert_eq!(
            url,
            "https://codeload.github.com/user/my-lib/tar.gz/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
        );
    }

    #[test]
    fn test_github_error_display_repo_not_found() {
        let err = GitHubError::RepoNotFound {
            owner: "user".to_string(),
            repo: "does-not-exist".to_string(),
        };
        assert_eq!(
            err.to_string(),
            "repository \"github:user/does-not-exist\" not found"
        );
    }

    #[test]
    fn test_github_error_display_ref_not_found() {
        let err = GitHubError::RefNotFound {
            owner: "user".to_string(),
            repo: "my-lib".to_string(),
            ref_: "nonexistent".to_string(),
        };
        assert_eq!(
            err.to_string(),
            "ref \"nonexistent\" not found in github:user/my-lib"
        );
    }

    #[test]
    fn test_github_error_display_rate_limited() {
        let err = GitHubError::RateLimited;
        let msg = err.to_string();
        assert!(msg.contains("rate limit"));
        assert!(msg.contains("GITHUB_TOKEN"));
        assert!(msg.contains("5000"));
    }

    #[test]
    fn test_github_error_display_access_denied() {
        let err = GitHubError::AccessDenied {
            owner: "user".to_string(),
            repo: "private-lib".to_string(),
        };
        let msg = err.to_string();
        assert!(msg.contains("access denied"));
        assert!(msg.contains("private"));
    }

    #[test]
    fn test_client_creation() {
        // Should not panic
        let _client = GitHubClient::new();
    }
}
