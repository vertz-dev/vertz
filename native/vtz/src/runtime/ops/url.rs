use deno_core::op2;
use deno_core::OpDecl;
use serde::Serialize;

/// Parsed URL components returned to JavaScript.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlParts {
    pub href: String,
    pub origin: String,
    pub protocol: String,
    pub username: String,
    pub password: String,
    pub host: String,
    pub hostname: String,
    pub port: String,
    pub pathname: String,
    pub search: String,
    pub hash: String,
}

/// Parse a URL string into its components.
/// If base is provided and non-empty, resolve relative to base.
#[op2]
#[serde]
pub fn op_url_parse(
    #[string] href: String,
    #[string] base: String,
) -> Result<UrlParts, deno_core::error::AnyError> {
    let parsed = if base.is_empty() {
        url::Url::parse(&href)
            .map_err(|e| deno_core::anyhow::anyhow!("TypeError: Invalid URL '{}': {}", href, e))?
    } else {
        let base_url = url::Url::parse(&base).map_err(|e| {
            deno_core::anyhow::anyhow!("TypeError: Invalid base URL '{}': {}", base, e)
        })?;
        base_url
            .join(&href)
            .map_err(|e| deno_core::anyhow::anyhow!("TypeError: Invalid URL '{}': {}", href, e))?
    };

    let origin = if parsed.scheme() == "http" || parsed.scheme() == "https" {
        parsed.origin().ascii_serialization()
    } else {
        "null".to_string()
    };

    Ok(UrlParts {
        href: parsed.as_str().to_string(),
        origin,
        protocol: format!("{}:", parsed.scheme()),
        username: parsed.username().to_string(),
        password: parsed.password().unwrap_or("").to_string(),
        host: parsed
            .host_str()
            .map(|h| {
                if let Some(port) = parsed.port() {
                    format!("{}:{}", h, port)
                } else {
                    h.to_string()
                }
            })
            .unwrap_or_default(),
        hostname: parsed.host_str().unwrap_or("").to_string(),
        port: parsed.port().map(|p| p.to_string()).unwrap_or_default(),
        pathname: parsed.path().to_string(),
        search: if let Some(q) = parsed.query() {
            format!("?{}", q)
        } else {
            String::new()
        },
        hash: if let Some(f) = parsed.fragment() {
            format!("#{}", f)
        } else {
            String::new()
        },
    })
}

/// Check if a URL can be parsed.
#[op2(fast)]
pub fn op_url_can_parse(#[string] href: String, #[string] base: String) -> bool {
    if base.is_empty() {
        url::Url::parse(&href).is_ok()
    } else {
        url::Url::parse(&base).and_then(|b| b.join(&href)).is_ok()
    }
}

/// Convert a file:// URL to a platform path.
#[op2]
#[string]
pub fn op_file_url_to_path(
    #[string] url_str: String,
) -> Result<String, deno_core::error::AnyError> {
    let parsed = url::Url::parse(&url_str)
        .map_err(|e| deno_core::anyhow::anyhow!("TypeError: Invalid URL: {}", e))?;
    if parsed.scheme() != "file" {
        return Err(deno_core::anyhow::anyhow!(
            "TypeError: The URL must be of scheme file"
        ));
    }
    let path = parsed
        .to_file_path()
        .map_err(|_| deno_core::anyhow::anyhow!("TypeError: Invalid file URL: {}", url_str))?;
    Ok(path.to_string_lossy().to_string())
}

/// Convert a platform path to a file:// URL string.
#[op2]
#[string]
pub fn op_path_to_file_url(
    #[string] path_str: String,
) -> Result<String, deno_core::error::AnyError> {
    let path = std::path::PathBuf::from(&path_str);
    let abs_path = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("/"))
            .join(path)
    };
    let url = url::Url::from_file_path(&abs_path)
        .map_err(|_| deno_core::anyhow::anyhow!("TypeError: Invalid file path: {}", path_str))?;
    Ok(url.to_string())
}

/// Get the op declarations for URL ops.
pub fn op_decls() -> Vec<OpDecl> {
    vec![
        op_url_parse(),
        op_url_can_parse(),
        op_file_url_to_path(),
        op_path_to_file_url(),
    ]
}

/// JavaScript bootstrap code for URL and URLSearchParams.
pub const URL_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  // Helper: decode form-urlencoded (+ becomes space)
  function formDecode(str) {
    return decodeURIComponent(str.replace(/\+/g, ' '));
  }

  // Helper: encode form-urlencoded (space becomes +)
  function formEncode(str) {
    return encodeURIComponent(str).replace(/%20/g, '+');
  }

  // --- URLSearchParams ---
  class URLSearchParams {
    #entries = [];
    #urlRef = null;

    constructor(init) {
      if (typeof init === 'string') {
        const qs = init.startsWith('?') ? init.slice(1) : init;
        if (qs) {
          for (const pair of qs.split('&')) {
            const idx = pair.indexOf('=');
            if (idx === -1) {
              this.#entries.push([formDecode(pair), '']);
            } else {
              this.#entries.push([
                formDecode(pair.slice(0, idx)),
                formDecode(pair.slice(idx + 1)),
              ]);
            }
          }
        }
      } else if (Array.isArray(init)) {
        for (const [k, v] of init) {
          this.#entries.push([String(k), String(v)]);
        }
      } else if (init && typeof init === 'object' && !(init instanceof URLSearchParams)) {
        for (const key of Object.keys(init)) {
          this.#entries.push([key, String(init[key])]);
        }
      } else if (init instanceof URLSearchParams) {
        this.#entries = [...init.#entries];
      }
    }

    // Internal: link to URL for live updates
    _setUrlRef(urlRef) { this.#urlRef = urlRef; }
    _notifyChange() {
      if (this.#urlRef) this.#urlRef._onSearchParamsChange();
    }

    append(name, value) {
      this.#entries.push([String(name), String(value)]);
      this._notifyChange();
    }

    delete(name, value) {
      if (arguments.length > 1) {
        const v = String(value);
        this.#entries = this.#entries.filter(([k, ev]) => !(k === name && ev === v));
      } else {
        this.#entries = this.#entries.filter(([k]) => k !== name);
      }
      this._notifyChange();
    }

    get(name) {
      const entry = this.#entries.find(([k]) => k === name);
      return entry ? entry[1] : null;
    }

    getAll(name) {
      return this.#entries.filter(([k]) => k === name).map(([, v]) => v);
    }

    has(name, value) {
      if (arguments.length > 1) {
        const v = String(value);
        return this.#entries.some(([k, ev]) => k === name && ev === v);
      }
      return this.#entries.some(([k]) => k === name);
    }

    set(name, value) {
      const nameStr = String(name);
      const valueStr = String(value);
      let found = false;
      this.#entries = this.#entries.filter(([k]) => {
        if (k === nameStr) {
          if (!found) { found = true; return true; }
          return false;
        }
        return true;
      });
      if (found) {
        const idx = this.#entries.findIndex(([k]) => k === nameStr);
        this.#entries[idx] = [nameStr, valueStr];
      } else {
        this.#entries.push([nameStr, valueStr]);
      }
      this._notifyChange();
    }

    sort() {
      this.#entries.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
      this._notifyChange();
    }

    toString() {
      return this.#entries
        .map(([k, v]) => `${formEncode(k)}=${formEncode(v)}`)
        .join('&');
    }

    forEach(callback, thisArg) {
      for (const [key, value] of this.#entries) {
        callback.call(thisArg, value, key, this);
      }
    }

    *entries() {
      for (const entry of this.#entries) yield entry;
    }
    *keys() {
      for (const [k] of this.#entries) yield k;
    }
    *values() {
      for (const [, v] of this.#entries) yield v;
    }
    [Symbol.iterator]() {
      return this.entries();
    }

    get size() {
      return this.#entries.length;
    }
  }

  // --- URL ---
  class URL {
    #parts;
    #searchParams;

    constructor(url, base) {
      const baseStr = base !== undefined ? String(base) : '';
      try {
        this.#parts = Deno.core.ops.op_url_parse(String(url), baseStr);
      } catch (e) {
        throw new TypeError(e.message || `Invalid URL: ${url}`);
      }
      this.#searchParams = new URLSearchParams(this.#parts.search);
      this.#searchParams._setUrlRef(this);
    }

    // Called by searchParams when it mutates
    _onSearchParamsChange() {
      const qs = this.#searchParams.toString();
      this.#parts.search = qs ? '?' + qs : '';
      // Rebuild href
      this.#rebuildHref();
    }

    #rebuildHref() {
      let href = this.#parts.protocol + '//';
      if (this.#parts.username) {
        href += this.#parts.username;
        if (this.#parts.password) href += ':' + this.#parts.password;
        href += '@';
      }
      href += this.#parts.hostname;
      if (this.#parts.port) href += ':' + this.#parts.port;
      href += this.#parts.pathname;
      href += this.#parts.search;
      href += this.#parts.hash;
      this.#parts.href = href;
    }

    get href() { return this.#parts.href; }
    set href(val) {
      try {
        this.#parts = Deno.core.ops.op_url_parse(String(val), '');
      } catch (e) {
        throw new TypeError(e.message || `Invalid URL: ${val}`);
      }
      this.#searchParams = new URLSearchParams(this.#parts.search);
      this.#searchParams._setUrlRef(this);
    }

    get origin() { return this.#parts.origin; }
    get protocol() { return this.#parts.protocol; }
    set protocol(val) {
      // Re-parse with new protocol
      const newHref = String(val).replace(/:$/, '') + ':' + this.#parts.href.slice(this.#parts.protocol.length);
      try {
        this.#parts = Deno.core.ops.op_url_parse(newHref, '');
        this.#searchParams = new URLSearchParams(this.#parts.search);
        this.#searchParams._setUrlRef(this);
      } catch (e) {
        // Ignore invalid — per spec, invalid protocol setter is a no-op
      }
    }

    get username() { return this.#parts.username; }
    set username(val) {
      this.#parts.username = String(val);
      this.#rebuildHref();
    }

    get password() { return this.#parts.password; }
    set password(val) {
      this.#parts.password = String(val);
      this.#rebuildHref();
    }

    get host() { return this.#parts.host; }
    set host(val) {
      const str = String(val);
      const colonIdx = str.indexOf(':');
      if (colonIdx !== -1) {
        this.#parts.hostname = str.slice(0, colonIdx);
        this.#parts.port = str.slice(colonIdx + 1);
        this.#parts.host = str;
      } else {
        this.#parts.hostname = str;
        this.#parts.port = '';
        this.#parts.host = str;
      }
      this.#rebuildHref();
    }

    get hostname() { return this.#parts.hostname; }
    set hostname(val) {
      this.#parts.hostname = String(val);
      this.#parts.host = this.#parts.port
        ? this.#parts.hostname + ':' + this.#parts.port
        : this.#parts.hostname;
      this.#rebuildHref();
    }

    get port() { return this.#parts.port; }
    set port(val) {
      this.#parts.port = String(val);
      this.#parts.host = this.#parts.port
        ? this.#parts.hostname + ':' + this.#parts.port
        : this.#parts.hostname;
      this.#rebuildHref();
    }

    get pathname() { return this.#parts.pathname; }
    set pathname(val) {
      const v = String(val);
      this.#parts.pathname = v.startsWith('/') ? v : '/' + v;
      this.#rebuildHref();
    }

    get search() { return this.#parts.search; }
    set search(val) {
      const s = String(val);
      this.#parts.search = s.startsWith('?') ? s : (s ? '?' + s : '');
      this.#searchParams = new URLSearchParams(this.#parts.search);
      this.#searchParams._setUrlRef(this);
      this.#rebuildHref();
    }

    get hash() { return this.#parts.hash; }
    set hash(val) {
      const h = String(val);
      this.#parts.hash = h.startsWith('#') ? h : (h ? '#' + h : '');
      this.#rebuildHref();
    }

    get searchParams() { return this.#searchParams; }

    toString() { return this.href; }
    toJSON() { return this.href; }

    static canParse(url, base) {
      const baseStr = base !== undefined ? String(base) : '';
      return Deno.core.ops.op_url_can_parse(String(url), baseStr);
    }
  }

  globalThis.URL = URL;
  globalThis.URLSearchParams = URLSearchParams;
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap()
    }

    // --- URL constructor tests ---

    #[test]
    fn test_url_parse_basic() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const url = new URL('https://example.com/path?q=1#hash');
                [url.protocol, url.hostname, url.pathname, url.search, url.hash]
            "#,
            )
            .unwrap();
        assert_eq!(
            result,
            serde_json::json!(["https:", "example.com", "/path", "?q=1", "#hash"])
        );
    }

    #[test]
    fn test_url_origin() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"new URL('https://example.com:8080/path').origin"#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("https://example.com:8080"));
    }

    #[test]
    fn test_url_host_with_port() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", r#"new URL('https://example.com:3000/path').host"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("example.com:3000"));
    }

    #[test]
    fn test_url_host_without_port() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", r#"new URL('https://example.com/path').host"#)
            .unwrap();
        assert_eq!(result, serde_json::json!("example.com"));
    }

    #[test]
    fn test_url_port_empty_when_default() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", r#"new URL('https://example.com/path').port"#)
            .unwrap();
        assert_eq!(result, serde_json::json!(""));
    }

    #[test]
    fn test_url_relative_with_base() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const url = new URL('/api/data', 'https://example.com');
                url.href
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("https://example.com/api/data"));
    }

    // --- SHOULD-FIX-3: TypeError on invalid URL ---

    #[test]
    fn test_url_invalid_throws_typeerror() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
            try {
                new URL('not-a-url');
                'no error';
            } catch (e) {
                e instanceof TypeError ? 'TypeError' : e.constructor.name;
            }
        "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("TypeError"));
    }

    #[test]
    fn test_url_can_parse_valid() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "URL.canParse('https://example.com')")
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_url_can_parse_invalid() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "URL.canParse('not-a-url')")
            .unwrap();
        assert_eq!(result, serde_json::json!(false));
    }

    #[test]
    fn test_url_can_parse_with_base() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "URL.canParse('/path', 'https://example.com')")
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_url_to_string() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"new URL('https://example.com/path').toString()"#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("https://example.com/path"));
    }

    #[test]
    fn test_url_to_json() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"JSON.parse(JSON.stringify({ url: new URL('https://example.com') })).url"#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("https://example.com/"));
    }

    // --- BLOCKER-1: URL property setters ---

    #[test]
    fn test_url_pathname_setter() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const url = new URL('https://example.com/old');
                url.pathname = '/new';
                url.pathname
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("/new"));
    }

    #[test]
    fn test_url_pathname_setter_updates_href() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const url = new URL('https://example.com/old');
                url.pathname = '/new';
                url.href
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("https://example.com/new"));
    }

    #[test]
    fn test_url_hostname_setter() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const url = new URL('https://old.com/path');
                url.hostname = 'new.com';
                url.href
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("https://new.com/path"));
    }

    #[test]
    fn test_url_hash_setter() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const url = new URL('https://example.com/path');
                url.hash = '#section';
                url.href
            "#,
            )
            .unwrap();
        assert_eq!(
            result,
            serde_json::json!("https://example.com/path#section")
        );
    }

    #[test]
    fn test_url_search_setter() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const url = new URL('https://example.com/path');
                url.search = '?q=hello';
                [url.search, url.searchParams.get('q')]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["?q=hello", "hello"]));
    }

    // --- SHOULD-FIX-6: searchParams live ---

    #[test]
    fn test_url_search_params_live_append() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const url = new URL('https://example.com/?a=1');
                url.searchParams.append('b', '2');
                url.search
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("?a=1&b=2"));
    }

    #[test]
    fn test_url_search_params_live_href_update() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const url = new URL('https://example.com/?a=1');
                url.searchParams.append('b', '2');
                url.href
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("https://example.com/?a=1&b=2"));
    }

    // --- URLSearchParams tests ---

    #[test]
    fn test_search_params_from_string() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams('a=1&b=2');
                [params.get('a'), params.get('b')]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["1", "2"]));
    }

    #[test]
    fn test_search_params_from_string_with_question_mark() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams('?a=1&b=2');
                params.get('a')
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("1"));
    }

    #[test]
    fn test_search_params_append() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams('a=1&b=2');
                params.append('c', '3');
                params.toString()
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("a=1&b=2&c=3"));
    }

    #[test]
    fn test_search_params_delete() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams('a=1&b=2&c=3');
                params.delete('b');
                params.toString()
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("a=1&c=3"));
    }

    #[test]
    fn test_search_params_has() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams('a=1');
                [params.has('a'), params.has('b')]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([true, false]));
    }

    #[test]
    fn test_search_params_set() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams('a=1');
                params.set('a', '99');
                params.get('a')
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("99"));
    }

    #[test]
    fn test_search_params_get_all() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams('a=1&a=2&a=3');
                params.getAll('a')
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["1", "2", "3"]));
    }

    #[test]
    fn test_search_params_get_missing_returns_null() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "new URLSearchParams('a=1').get('missing')")
            .unwrap();
        assert!(result.is_null());
    }

    #[test]
    fn test_search_params_iteration() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams('x=1&y=2');
                const entries = [];
                for (const [k, v] of params) {
                    entries.push(k + '=' + v);
                }
                entries
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["x=1", "y=2"]));
    }

    #[test]
    fn test_search_params_size() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script("<test>", "new URLSearchParams('a=1&b=2&c=3').size")
            .unwrap();
        assert_eq!(result, serde_json::json!(3));
    }

    #[test]
    fn test_search_params_sort() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams('c=3&a=1&b=2');
                params.sort();
                params.toString()
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("a=1&b=2&c=3"));
    }

    #[test]
    fn test_search_params_from_object() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams({ foo: 'bar', baz: '42' });
                [params.get('foo'), params.get('baz')]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["bar", "42"]));
    }

    // --- SHOULD-FIX-1: + as space ---

    #[test]
    fn test_search_params_plus_as_space() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams('q=hello+world');
                params.get('q')
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("hello world"));
    }

    #[test]
    fn test_search_params_space_encoded_as_plus() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams();
                params.set('q', 'hello world');
                params.toString()
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("q=hello+world"));
    }

    // --- SHOULD-FIX-2: delete/has with value ---

    #[test]
    fn test_search_params_delete_with_value() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams('a=1&a=2&b=3');
                params.delete('a', '1');
                params.toString()
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("a=2&b=3"));
    }

    #[test]
    fn test_search_params_has_with_value() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams('a=1&a=2');
                [params.has('a', '1'), params.has('a', '3')]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([true, false]));
    }

    // --- URL.searchParams integration ---

    #[test]
    fn test_url_search_params_integration() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const url = new URL('https://example.com/path?q=hello&page=1');
                [url.searchParams.get('q'), url.searchParams.get('page')]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["hello", "1"]));
    }

    #[test]
    fn test_search_params_foreach() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams('a=1&b=2');
                const results = [];
                params.forEach((value, key) => {
                    results.push(key + ':' + value);
                });
                results
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["a:1", "b:2"]));
    }

    #[test]
    fn test_url_username_password() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const url = new URL('https://user:pass@example.com/path');
                [url.username, url.password]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["user", "pass"]));
    }

    // --- NIT-5: no-arg constructor ---

    #[test]
    fn test_search_params_no_arg_constructor() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const params = new URLSearchParams();
                [params.size, params.toString()]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([0, ""]));
    }

    // --- Phase 5a: fileURLToPath / pathToFileURL ---

    #[test]
    fn test_file_url_to_path() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"Deno.core.ops.op_file_url_to_path("file:///home/user/file.txt")"#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("/home/user/file.txt"));
    }

    #[test]
    fn test_file_url_to_path_encoded() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"Deno.core.ops.op_file_url_to_path("file:///home/user/my%20file.txt")"#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("/home/user/my file.txt"));
    }

    #[test]
    fn test_file_url_to_path_non_file_scheme_errors() {
        let mut rt = create_runtime();
        let result = rt.execute_script(
            "<test>",
            r#"
            try {
                Deno.core.ops.op_file_url_to_path("https://example.com");
                "no error";
            } catch (e) {
                "error";
            }
        "#,
        );
        assert_eq!(result.unwrap(), serde_json::json!("error"));
    }

    #[test]
    fn test_path_to_file_url() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"Deno.core.ops.op_path_to_file_url("/home/user/file.txt")"#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("file:///home/user/file.txt"));
    }

    #[test]
    fn test_path_to_file_url_with_spaces() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"Deno.core.ops.op_path_to_file_url("/home/user/my file.txt")"#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("file:///home/user/my%20file.txt"));
    }
}
