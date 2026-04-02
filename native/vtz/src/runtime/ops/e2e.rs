//! E2E testing ops — control a native webview from V8 test code.
//!
//! These ops are only registered in e2e test mode. They use the `WebviewBridge`
//! stored in `OpState` to send JavaScript to the webview and return results.

use deno_core::OpDecl;

#[cfg(feature = "desktop")]
use crate::webview::bridge::WebviewBridge;
#[cfg(feature = "desktop")]
use deno_core::error::AnyError;
#[cfg(feature = "desktop")]
use deno_core::op2;
#[cfg(feature = "desktop")]
use deno_core::OpState;

/// Navigate the webview to a URL and wait for page load.
#[cfg(feature = "desktop")]
#[op2(async)]
#[string]
pub async fn op_e2e_navigate(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] url: String,
    #[bigint] timeout_ms: u64,
) -> Result<String, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };

    // Navigate to the URL
    let nav_js = format!(
        "(() => {{ window.location.href = '{}'; return 'navigating'; }})()",
        url.replace('\'', "\\'")
    );
    bridge
        .eval(&nav_js, timeout_ms)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;

    // Poll until document.readyState === 'complete'
    let poll_js = "document.readyState";
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_millis(timeout_ms);
    loop {
        let result = bridge
            .eval(poll_js, timeout_ms)
            .await
            .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
        if result.contains("complete") {
            break;
        }
        if start.elapsed() > timeout {
            return Err(deno_core::anyhow::anyhow!(
                "timeout: page did not reach readyState 'complete' within {}ms",
                timeout_ms
            ));
        }
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    Ok("ok".to_string())
}

/// Get the current URL of the webview.
#[cfg(feature = "desktop")]
#[op2(async)]
#[string]
pub async fn op_e2e_url(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
) -> Result<String, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let result = bridge
        .eval("window.location.href", 5000)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
    // Result is JSON-quoted, strip quotes
    Ok(strip_json_quotes(&result))
}

/// Query a single element by CSS selector. Returns an element handle ID or null.
#[cfg(feature = "desktop")]
#[op2(async)]
#[serde]
pub async fn op_e2e_query(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] selector: String,
) -> Result<Option<u32>, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let js = format!(
        r#"(() => {{
            const el = document.querySelector('{}');
            if (!el) return null;
            if (!window.__vtz_elements) {{ window.__vtz_elements = new Map(); window.__vtz_next_id = 1; }}
            const id = window.__vtz_next_id++;
            window.__vtz_elements.set(id, el);
            return id;
        }})()"#,
        escape_selector(&selector)
    );
    let result = bridge
        .eval(&js, 5000)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;

    if result == "null" || result.is_empty() {
        Ok(None)
    } else {
        let id: u32 = result
            .trim()
            .parse()
            .map_err(|_| deno_core::anyhow::anyhow!("unexpected query result: {}", result))?;
        Ok(Some(id))
    }
}

/// Query all elements by CSS selector. Returns an array of element handle IDs.
#[cfg(feature = "desktop")]
#[op2(async)]
#[serde]
pub async fn op_e2e_query_all(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] selector: String,
) -> Result<Vec<u32>, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let js = format!(
        r#"(() => {{
            const els = document.querySelectorAll('{}');
            if (!window.__vtz_elements) {{ window.__vtz_elements = new Map(); window.__vtz_next_id = 1; }}
            const ids = [];
            els.forEach(el => {{
                const id = window.__vtz_next_id++;
                window.__vtz_elements.set(id, el);
                ids.push(id);
            }});
            return JSON.stringify(ids);
        }})()"#,
        escape_selector(&selector)
    );
    let result = bridge
        .eval(&js, 5000)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
    let result = strip_json_quotes(&result);
    let ids: Vec<u32> = serde_json::from_str(&result)
        .map_err(|e| deno_core::anyhow::anyhow!("failed to parse query_all result: {}", e))?;
    Ok(ids)
}

/// Get text content of an element by selector or element handle ID.
#[cfg(feature = "desktop")]
#[op2(async)]
#[string]
pub async fn op_e2e_text_content(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] selector_or_id: String,
    #[bigint] timeout_ms: u64,
) -> Result<Option<String>, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let js = format!(
        "(() => {{ const el = {}; return el ? el.textContent : null; }})()",
        resolve_element_js(&selector_or_id)
    );
    let result = bridge
        .eval(&js, timeout_ms)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;

    if result == "null" {
        Ok(None)
    } else {
        Ok(Some(strip_json_quotes(&result)))
    }
}

/// Get innerHTML of an element by selector.
#[cfg(feature = "desktop")]
#[op2(async)]
#[string]
pub async fn op_e2e_inner_html(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] selector: String,
    #[bigint] timeout_ms: u64,
) -> Result<String, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let js = format!(
        "(() => {{ const el = {}; return el ? el.innerHTML : ''; }})()",
        resolve_element_js(&selector)
    );
    let result = bridge
        .eval(&js, timeout_ms)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
    Ok(strip_json_quotes(&result))
}

/// Get an attribute value from an element.
#[cfg(feature = "desktop")]
#[op2(async)]
#[string]
pub async fn op_e2e_get_attribute(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] selector: String,
    #[string] name: String,
    #[bigint] timeout_ms: u64,
) -> Result<Option<String>, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let js = format!(
        "(() => {{ const el = {}; return el ? el.getAttribute('{}') : null; }})()",
        resolve_element_js(&selector),
        name.replace('\'', "\\'")
    );
    let result = bridge
        .eval(&js, timeout_ms)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;

    if result == "null" {
        Ok(None)
    } else {
        Ok(Some(strip_json_quotes(&result)))
    }
}

/// Check if an element is visible (has dimensions and is not hidden).
#[cfg(feature = "desktop")]
#[op2(async)]
pub async fn op_e2e_is_visible(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] selector: String,
    #[bigint] timeout_ms: u64,
) -> Result<bool, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let js = format!(
        r#"(() => {{
            const el = {};
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0;
        }})()"#,
        resolve_element_js(&selector)
    );
    let result = bridge
        .eval(&js, timeout_ms)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
    Ok(result.trim() == "true")
}

/// Check if a checkbox/radio element is checked.
#[cfg(feature = "desktop")]
#[op2(async)]
pub async fn op_e2e_is_checked(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] selector: String,
    #[bigint] timeout_ms: u64,
) -> Result<bool, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let js = format!(
        "(() => {{ const el = {}; return el ? el.checked : false; }})()",
        resolve_element_js(&selector)
    );
    let result = bridge
        .eval(&js, timeout_ms)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
    Ok(result.trim() == "true")
}

/// Evaluate arbitrary JavaScript in the webview and return JSON-serialized result.
#[cfg(feature = "desktop")]
#[op2(async)]
#[string]
pub async fn op_e2e_evaluate(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] js: String,
    #[bigint] timeout_ms: u64,
) -> Result<String, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let wrapped = format!("JSON.stringify({})", js);
    let result = bridge
        .eval(&wrapped, timeout_ms)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
    // Result is double-JSON-encoded (JSON.stringify returns a string, evaluate_script wraps it again)
    // Strip outer quotes if present
    Ok(strip_json_quotes(&result))
}

/// Click an element: dispatches mousedown, mouseup, click event sequence.
#[cfg(feature = "desktop")]
#[op2(async)]
#[string]
pub async fn op_e2e_click(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] selector: String,
    #[bigint] timeout_ms: u64,
) -> Result<String, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let js = format!(
        r#"(() => {{
            const el = {};
            if (!el) throw new Error('Element not found: {}');
            if (el.scrollIntoViewIfNeeded) el.scrollIntoViewIfNeeded();
            el.dispatchEvent(new MouseEvent('mousedown', {{bubbles:true, composed:true}}));
            el.dispatchEvent(new MouseEvent('mouseup', {{bubbles:true, composed:true}}));
            el.dispatchEvent(new MouseEvent('click', {{bubbles:true, composed:true}}));
            return 'ok';
        }})()"#,
        resolve_element_js(&selector),
        escape_selector(&selector)
    );
    bridge
        .eval(&js, timeout_ms)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
    Ok("ok".to_string())
}

/// Fill an input/textarea: clears value, sets new value, dispatches input + change.
#[cfg(feature = "desktop")]
#[op2(async)]
#[string]
pub async fn op_e2e_fill(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] selector: String,
    #[string] value: String,
    #[bigint] timeout_ms: u64,
) -> Result<String, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let escaped_value = value
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n");
    let js = format!(
        r#"(() => {{
            const el = {};
            if (!el) throw new Error('Element not found: {}');
            el.focus();
            el.value = '';
            el.value = '{}';
            el.dispatchEvent(new Event('input', {{bubbles:true}}));
            el.dispatchEvent(new Event('change', {{bubbles:true}}));
            return 'ok';
        }})()"#,
        resolve_element_js(&selector),
        escape_selector(&selector),
        escaped_value
    );
    bridge
        .eval(&js, timeout_ms)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
    Ok("ok".to_string())
}

/// Type text character by character: dispatches keydown/keypress/input/keyup per char.
#[cfg(feature = "desktop")]
#[op2(async)]
#[string]
pub async fn op_e2e_type(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] selector: String,
    #[string] text: String,
    #[bigint] timeout_ms: u64,
) -> Result<String, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let escaped_text = text.replace('\\', "\\\\").replace('\'', "\\'");
    let js = format!(
        r#"(() => {{
            const el = {};
            if (!el) throw new Error('Element not found: {}');
            el.focus();
            const text = '{}';
            for (const ch of text) {{
                el.dispatchEvent(new KeyboardEvent('keydown', {{key:ch, bubbles:true}}));
                el.dispatchEvent(new KeyboardEvent('keypress', {{key:ch, bubbles:true}}));
                el.value = (el.value || '') + ch;
                el.dispatchEvent(new Event('input', {{bubbles:true}}));
                el.dispatchEvent(new KeyboardEvent('keyup', {{key:ch, bubbles:true}}));
            }}
            return 'ok';
        }})()"#,
        resolve_element_js(&selector),
        escape_selector(&selector),
        escaped_text
    );
    bridge
        .eval(&js, timeout_ms)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
    Ok("ok".to_string())
}

/// Press a key on the currently focused element.
#[cfg(feature = "desktop")]
#[op2(async)]
#[string]
pub async fn op_e2e_press(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] key: String,
    #[bigint] timeout_ms: u64,
) -> Result<String, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let escaped_key = key.replace('\\', "\\\\").replace('\'', "\\'");
    let js = format!(
        r#"(() => {{
            const el = document.activeElement || document.body;
            const key = '{}';
            const opts = {{key, bubbles:true, composed:true}};
            el.dispatchEvent(new KeyboardEvent('keydown', opts));
            el.dispatchEvent(new KeyboardEvent('keypress', opts));
            el.dispatchEvent(new KeyboardEvent('keyup', opts));
            return 'ok';
        }})()"#,
        escaped_key
    );
    bridge
        .eval(&js, timeout_ms)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
    Ok("ok".to_string())
}

/// Check a checkbox (click if not already checked).
#[cfg(feature = "desktop")]
#[op2(async)]
#[string]
pub async fn op_e2e_check(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] selector: String,
    #[bigint] timeout_ms: u64,
) -> Result<String, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let js = format!(
        r#"(() => {{
            const el = {};
            if (!el) throw new Error('Element not found: {}');
            if (!el.checked) {{
                el.dispatchEvent(new MouseEvent('click', {{bubbles:true, composed:true}}));
            }}
            return 'ok';
        }})()"#,
        resolve_element_js(&selector),
        escape_selector(&selector)
    );
    bridge
        .eval(&js, timeout_ms)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
    Ok("ok".to_string())
}

/// Uncheck a checkbox (click if currently checked).
#[cfg(feature = "desktop")]
#[op2(async)]
#[string]
pub async fn op_e2e_uncheck(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] selector: String,
    #[bigint] timeout_ms: u64,
) -> Result<String, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let js = format!(
        r#"(() => {{
            const el = {};
            if (!el) throw new Error('Element not found: {}');
            if (el.checked) {{
                el.dispatchEvent(new MouseEvent('click', {{bubbles:true, composed:true}}));
            }}
            return 'ok';
        }})()"#,
        resolve_element_js(&selector),
        escape_selector(&selector)
    );
    bridge
        .eval(&js, timeout_ms)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
    Ok("ok".to_string())
}

/// Select an option in a <select> element.
#[cfg(feature = "desktop")]
#[op2(async)]
#[string]
pub async fn op_e2e_select_option(
    state: std::rc::Rc<std::cell::RefCell<OpState>>,
    #[string] selector: String,
    #[string] value: String,
    #[bigint] timeout_ms: u64,
) -> Result<String, AnyError> {
    let bridge = {
        let state = state.borrow();
        state.borrow::<WebviewBridge>().clone()
    };
    let escaped_value = value.replace('\\', "\\\\").replace('\'', "\\'");
    let js = format!(
        r#"(() => {{
            const el = {};
            if (!el) throw new Error('Element not found: {}');
            el.value = '{}';
            el.dispatchEvent(new Event('change', {{bubbles:true}}));
            return 'ok';
        }})()"#,
        resolve_element_js(&selector),
        escape_selector(&selector),
        escaped_value
    );
    bridge
        .eval(&js, timeout_ms)
        .await
        .map_err(|e| deno_core::anyhow::anyhow!("{}", e))?;
    Ok("ok".to_string())
}

/// Get op declarations for e2e ops (only used in e2e test mode).
#[cfg(feature = "desktop")]
pub fn op_decls() -> Vec<OpDecl> {
    vec![
        op_e2e_navigate(),
        op_e2e_url(),
        op_e2e_query(),
        op_e2e_query_all(),
        op_e2e_text_content(),
        op_e2e_inner_html(),
        op_e2e_get_attribute(),
        op_e2e_is_visible(),
        op_e2e_is_checked(),
        op_e2e_evaluate(),
        op_e2e_click(),
        op_e2e_fill(),
        op_e2e_type(),
        op_e2e_press(),
        op_e2e_check(),
        op_e2e_uncheck(),
        op_e2e_select_option(),
    ]
}

#[cfg(not(feature = "desktop"))]
pub fn op_decls() -> Vec<OpDecl> {
    vec![]
}

/// JavaScript bootstrap code for the e2e page API.
pub const E2E_BOOTSTRAP_JS: &str = include_str!("e2e_bootstrap.js");

// ── Helpers ──────────────────────────────────────────────

/// Generate JS to resolve an element by selector or __id:N handle reference.
#[cfg(any(feature = "desktop", test))]
fn resolve_element_js(selector_or_id: &str) -> String {
    if let Some(id_str) = selector_or_id.strip_prefix("__id:") {
        format!("window.__vtz_elements.get({})", id_str)
    } else {
        format!(
            "document.querySelector('{}')",
            selector_or_id.replace('\'', "\\'")
        )
    }
}

/// Escape a CSS selector for embedding in a JS string literal (single-quoted).
#[cfg(any(feature = "desktop", test))]
fn escape_selector(selector: &str) -> String {
    selector.replace('\\', "\\\\").replace('\'', "\\'")
}

/// Strip surrounding JSON quotes from a string (e.g., `"\"hello\""` → `"hello"`).
#[cfg(any(feature = "desktop", test))]
fn strip_json_quotes(s: &str) -> String {
    let trimmed = s.trim();
    if trimmed.starts_with('"') && trimmed.ends_with('"') && trimmed.len() >= 2 {
        // Parse as JSON string to handle escape sequences
        serde_json::from_str::<String>(trimmed).unwrap_or_else(|_| trimmed.to_string())
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_element_js_selector() {
        let result = resolve_element_js("h1");
        assert_eq!(result, "document.querySelector('h1')");
    }

    #[test]
    fn resolve_element_js_id() {
        let result = resolve_element_js("__id:42");
        assert_eq!(result, "window.__vtz_elements.get(42)");
    }

    #[test]
    fn escape_selector_quotes() {
        assert_eq!(
            escape_selector("input[name='email']"),
            "input[name=\\'email\\']"
        );
    }

    #[test]
    fn strip_json_quotes_basic() {
        assert_eq!(strip_json_quotes("\"hello\""), "hello");
    }

    #[test]
    fn strip_json_quotes_no_quotes() {
        assert_eq!(strip_json_quotes("42"), "42");
    }

    #[test]
    fn strip_json_quotes_null() {
        assert_eq!(strip_json_quotes("null"), "null");
    }

    #[test]
    fn strip_json_quotes_escaped() {
        assert_eq!(
            strip_json_quotes("\"hello \\\"world\\\"\""),
            "hello \"world\""
        );
    }

    #[test]
    fn op_decls_returns_empty_without_desktop_feature() {
        // Without the desktop feature, op_decls should return an empty vec.
        // With the desktop feature, it returns the full set of e2e ops.
        let decls = op_decls();
        #[cfg(not(feature = "desktop"))]
        assert!(decls.is_empty());
        #[cfg(feature = "desktop")]
        assert_eq!(decls.len(), 17);
    }

    #[test]
    fn bootstrap_js_contains_page_api() {
        assert!(E2E_BOOTSTRAP_JS.contains("__vtz_e2e_page"));
        assert!(E2E_BOOTSTRAP_JS.contains("ElementHandle"));
        assert!(E2E_BOOTSTRAP_JS.contains("navigate"));
        assert!(E2E_BOOTSTRAP_JS.contains("waitForSelector"));
        // Phase 4 interaction methods
        assert!(E2E_BOOTSTRAP_JS.contains("op_e2e_click"));
        assert!(E2E_BOOTSTRAP_JS.contains("op_e2e_fill"));
        assert!(E2E_BOOTSTRAP_JS.contains("op_e2e_type"));
        assert!(E2E_BOOTSTRAP_JS.contains("op_e2e_press"));
        assert!(E2E_BOOTSTRAP_JS.contains("op_e2e_check"));
        assert!(E2E_BOOTSTRAP_JS.contains("op_e2e_uncheck"));
        assert!(E2E_BOOTSTRAP_JS.contains("op_e2e_select_option"));
    }

    #[test]
    fn resolve_element_js_escapes_quotes_in_selector() {
        let result = resolve_element_js("div[data-name='test']");
        assert!(result.contains("\\'test\\'"));
    }

    #[test]
    fn strip_json_quotes_whitespace_trimmed() {
        assert_eq!(strip_json_quotes("  \"hello\"  "), "hello");
    }

    #[test]
    fn escape_selector_backslashes() {
        assert_eq!(escape_selector("div.a\\b"), "div.a\\\\b");
    }
}
