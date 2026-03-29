use deno_core::error::AnyError;
use deno_core::op2;
use deno_core::OpDecl;

/// Perform an HTTP fetch request and return the response as a JSON object.
#[op2(async)]
#[serde]
pub async fn op_fetch(
    #[string] url: String,
    #[serde] options: serde_json::Value,
) -> Result<serde_json::Value, AnyError> {
    let client = reqwest::Client::new();

    let method_str = options
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("GET");

    let method: reqwest::Method = method_str
        .parse()
        .map_err(|_| deno_core::anyhow::anyhow!("Invalid HTTP method: {}", method_str))?;

    let mut request = client.request(method, &url);

    // Set headers
    if let Some(headers) = options.get("headers").and_then(|v| v.as_object()) {
        for (key, value) in headers {
            if let Some(val_str) = value.as_str() {
                request = request.header(key.as_str(), val_str);
            }
        }
    }

    // Set body
    if let Some(body) = options.get("body") {
        if let Some(body_str) = body.as_str() {
            request = request.body(body_str.to_string());
        } else {
            request = request.json(body);
        }
    }

    let response = request
        .send()
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("Fetch failed: {}", e))?;

    let status = response.status().as_u16();
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();

    let headers: serde_json::Map<String, serde_json::Value> = response
        .headers()
        .iter()
        .map(|(k, v)| {
            (
                k.as_str().to_string(),
                serde_json::Value::String(v.to_str().unwrap_or("").to_string()),
            )
        })
        .collect();

    let body = response
        .text()
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("Failed to read response body: {}", e))?;

    Ok(serde_json::json!({
        "status": status,
        "statusText": status_text,
        "headers": headers,
        "body": body,
    }))
}

/// Get the op declarations for fetch ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![op_fetch()]
}

/// JavaScript bootstrap code for the fetch API.
/// This uses the Headers, Request, and Response classes from web_api bootstrap
/// (which must be loaded first).
pub const FETCH_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  // Overwrite the fetch from web_api bootstrap (which already references op_fetch)
  // This is now a no-op because web_api bootstrap defines the full fetch().
  // We keep this file's bootstrap empty since web_api handles everything.
})(globalThis);
"#;
