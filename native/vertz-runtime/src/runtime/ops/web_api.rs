use deno_core::OpDecl;

/// No Rust ops — EventTarget, Event, Headers, Request, Response,
/// AbortController, AbortSignal are all pure JS.
pub fn op_decls() -> Vec<OpDecl> {
    vec![]
}

/// Bootstrap JS for Web API classes: Event, EventTarget, Headers,
/// Request, Response, AbortController, AbortSignal.
pub const WEB_API_BOOTSTRAP_JS: &str = r#"
((globalThis) => {
  // =====================================================================
  // Event
  // =====================================================================
  class Event {
    #type;
    #bubbles;
    #cancelable;
    #defaultPrevented = false;
    #target = null;
    #currentTarget = null;
    #timeStamp;

    constructor(type, options = {}) {
      this.#type = String(type);
      this.#bubbles = !!options.bubbles;
      this.#cancelable = !!options.cancelable;
      this.#timeStamp = performance.now();
    }

    get type() { return this.#type; }
    get bubbles() { return this.#bubbles; }
    get cancelable() { return this.#cancelable; }
    get defaultPrevented() { return this.#defaultPrevented; }
    get target() { return this.#target; }
    get currentTarget() { return this.#currentTarget; }
    get timeStamp() { return this.#timeStamp; }

    preventDefault() {
      if (this.#cancelable) this.#defaultPrevented = true;
    }

    stopPropagation() {}
    stopImmediatePropagation() {}

    // Internal setters used by EventTarget.dispatchEvent
    _setTarget(t) { this.#target = t; }
    _setCurrentTarget(t) { this.#currentTarget = t; }
  }

  // =====================================================================
  // EventTarget
  // =====================================================================
  class EventTarget {
    #listeners = new Map();

    addEventListener(type, callback, options) {
      if (typeof callback !== 'function') return;
      const once = typeof options === 'object' ? !!options.once : false;
      if (!this.#listeners.has(type)) {
        this.#listeners.set(type, []);
      }
      this.#listeners.get(type).push({ callback, once });
    }

    removeEventListener(type, callback) {
      const list = this.#listeners.get(type);
      if (!list) return;
      const idx = list.findIndex(l => l.callback === callback);
      if (idx !== -1) list.splice(idx, 1);
    }

    dispatchEvent(event) {
      if (typeof event._setTarget === 'function') {
        event._setTarget(this);
        event._setCurrentTarget(this);
      }
      const list = this.#listeners.get(event.type);
      if (!list) return true;
      const toRemove = [];
      for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        try {
          entry.callback.call(this, event);
        } catch (e) {
          // Swallow — per spec, listener errors don't propagate
          // but we log them for debugging
          console.error('EventTarget listener error:', e);
        }
        if (entry.once) toRemove.push(i);
      }
      for (let i = toRemove.length - 1; i >= 0; i--) {
        list.splice(toRemove[i], 1);
      }
      return !event.defaultPrevented;
    }
  }

  // =====================================================================
  // AbortSignal (extends EventTarget)
  // =====================================================================
  class AbortSignal extends EventTarget {
    #aborted = false;
    #reason = undefined;

    get aborted() { return this.#aborted; }
    get reason() { return this.#reason; }

    throwIfAborted() {
      if (this.#aborted) throw this.#reason;
    }

    // Internal — called by AbortController
    _abort(reason) {
      if (this.#aborted) return;
      this.#aborted = true;
      this.#reason = reason !== undefined ? reason : new DOMException_('The operation was aborted.', 'AbortError');
      const event = new Event('abort');
      this.dispatchEvent(event);
      if (typeof this.onabort === 'function') {
        this.onabort(event);
      }
    }

    static abort(reason) {
      const signal = new AbortSignal();
      signal._abort(reason !== undefined ? reason : new DOMException_('The operation was aborted.', 'AbortError'));
      return signal;
    }

    static timeout(ms) {
      const signal = new AbortSignal();
      setTimeout(() => {
        signal._abort(new DOMException_('The operation timed out.', 'TimeoutError'));
      }, ms);
      return signal;
    }

    static any(signals) {
      const combined = new AbortSignal();
      for (const s of signals) {
        if (s.aborted) {
          combined._abort(s.reason);
          return combined;
        }
      }
      for (const s of signals) {
        s.addEventListener('abort', () => {
          if (!combined.aborted) combined._abort(s.reason);
        }, { once: true });
      }
      return combined;
    }
  }

  // =====================================================================
  // AbortController
  // =====================================================================
  class AbortController {
    #signal = new AbortSignal();

    get signal() { return this.#signal; }

    abort(reason) {
      this.#signal._abort(reason);
    }
  }

  // =====================================================================
  // DOMException polyfill (minimal)
  // =====================================================================
  class DOMException_ extends Error {
    #name;
    #code;

    constructor(message = '', name = 'Error') {
      super(message);
      this.#name = name;
      this.#code = DOMException_._codeFor(name);
    }

    get name() { return this.#name; }
    get code() { return this.#code; }

    static _codeFor(name) {
      const codes = {
        'AbortError': 20,
        'TimeoutError': 23,
        'QuotaExceededError': 22,
        'NotSupportedError': 9,
        'InvalidAccessError': 15,
        'DataError': 0,
        'OperationError': 0,
      };
      return codes[name] || 0;
    }
  }

  // =====================================================================
  // Headers
  // =====================================================================
  class Headers {
    #map = new Map(); // lowercase name → [values]

    constructor(init) {
      if (init instanceof Headers) {
        for (const [k, v] of init.entries()) {
          this.append(k, v);
        }
      } else if (Array.isArray(init)) {
        for (const [k, v] of init) {
          this.append(k, v);
        }
      } else if (init && typeof init === 'object') {
        for (const key of Object.keys(init)) {
          this.append(key, init[key]);
        }
      }
    }

    append(name, value) {
      const key = String(name).toLowerCase();
      const val = String(value);
      if (this.#map.has(key)) {
        this.#map.get(key).push(val);
      } else {
        this.#map.set(key, [val]);
      }
    }

    delete(name) {
      this.#map.delete(String(name).toLowerCase());
    }

    get(name) {
      const values = this.#map.get(String(name).toLowerCase());
      return values ? values.join(', ') : null;
    }

    has(name) {
      return this.#map.has(String(name).toLowerCase());
    }

    set(name, value) {
      this.#map.set(String(name).toLowerCase(), [String(value)]);
    }

    getSetCookie() {
      return this.#map.get('set-cookie') || [];
    }

    forEach(callback, thisArg) {
      for (const [name, values] of this.#map) {
        callback.call(thisArg, values.join(', '), name, this);
      }
    }

    *entries() {
      for (const [name, values] of this.#map) {
        yield [name, values.join(', ')];
      }
    }

    *keys() {
      for (const name of this.#map.keys()) {
        yield name;
      }
    }

    *values() {
      for (const values of this.#map.values()) {
        yield values.join(', ');
      }
    }

    [Symbol.iterator]() {
      return this.entries();
    }
  }

  // =====================================================================
  // Body mixin helper
  // =====================================================================
  function createBodyMixin(bodyInit) {
    let bodyUsed = false;
    let bodyBytes = null;
    let bodyText = null;

    if (bodyInit === undefined || bodyInit === null) {
      bodyText = '';
      bodyBytes = new Uint8Array(0);
    } else if (typeof bodyInit === 'string') {
      bodyText = bodyInit;
    } else if (bodyInit instanceof ArrayBuffer) {
      bodyBytes = new Uint8Array(bodyInit);
    } else if (ArrayBuffer.isView(bodyInit)) {
      bodyBytes = new Uint8Array(bodyInit.buffer, bodyInit.byteOffset, bodyInit.byteLength);
    }

    function consumeBody() {
      if (bodyUsed) throw new TypeError('body already consumed');
      bodyUsed = true;
    }

    function getBytes() {
      if (bodyBytes !== null) return bodyBytes;
      if (bodyText !== null) return new TextEncoder().encode(bodyText);
      return new Uint8Array(0);
    }

    return {
      get bodyUsed() { return bodyUsed; },
      get body() {
        // Return a ReadableStream that enqueues the body bytes
        const bytes = getBytes();
        return new ReadableStream({
          start(controller) {
            if (bytes.byteLength > 0) {
              controller.enqueue(new Uint8Array(bytes));
            }
            controller.close();
          }
        });
      },
      async text() {
        consumeBody();
        if (bodyText !== null) return bodyText;
        return new TextDecoder().decode(bodyBytes);
      },
      async json() {
        consumeBody();
        const text = bodyText !== null ? bodyText : new TextDecoder().decode(bodyBytes);
        return JSON.parse(text);
      },
      async arrayBuffer() {
        consumeBody();
        if (bodyBytes !== null) return bodyBytes.buffer.slice(bodyBytes.byteOffset, bodyBytes.byteOffset + bodyBytes.byteLength);
        return new TextEncoder().encode(bodyText).buffer;
      },
      clone() {
        if (bodyUsed) throw new TypeError('Cannot clone a consumed body');
        return createBodyMixin(bodyText !== null ? bodyText : bodyBytes ? new Uint8Array(bodyBytes) : null);
      },
    };
  }

  // =====================================================================
  // Request
  // =====================================================================
  class Request {
    #url;
    #method;
    #headers;
    #body;
    #signal;

    constructor(input, init = {}) {
      if (input instanceof Request) {
        this.#url = input.url;
        this.#method = init.method || input.method;
        this.#headers = new Headers(init.headers || input.headers);
        // Copy body from input Request when init.body not provided
        this.#body = init.body !== undefined
          ? createBodyMixin(init.body)
          : (input.bodyUsed ? createBodyMixin(null) : input.#body.clone());
        this.#signal = init.signal || input.signal || null;
      } else {
        this.#url = String(input);
        this.#method = (init.method || 'GET').toUpperCase();
        this.#headers = new Headers(init.headers);
        this.#body = createBodyMixin(init.body !== undefined ? init.body : null);
        this.#signal = init.signal || null;
      }
    }

    get url() { return this.#url; }
    get method() { return this.#method; }
    get headers() { return this.#headers; }
    get body() { return this.#body.body; }
    get bodyUsed() { return this.#body.bodyUsed; }
    get signal() { return this.#signal; }

    async text() { return this.#body.text(); }
    async json() { return this.#body.json(); }
    async arrayBuffer() { return this.#body.arrayBuffer(); }

    clone() {
      return new Request(this.#url, {
        method: this.#method,
        headers: new Headers(this.#headers),
        body: this.#body.clone(),
        signal: this.#signal,
      });
    }
  }

  // =====================================================================
  // Response
  // =====================================================================
  class Response {
    #status;
    #statusText;
    #headers;
    #body;
    #ok;
    #url;
    #type;
    #redirected;

    constructor(body, init = {}) {
      this.#status = init.status !== undefined ? init.status : 200;
      this.#statusText = init.statusText !== undefined ? init.statusText : '';
      this.#headers = new Headers(init.headers);
      this.#body = createBodyMixin(body);
      this.#ok = this.#status >= 200 && this.#status < 300;
      this.#url = init.url || '';
      this.#type = 'default';
      this.#redirected = false;
    }

    get status() { return this.#status; }
    get statusText() { return this.#statusText; }
    get headers() { return this.#headers; }
    get ok() { return this.#ok; }
    get body() { return this.#body.body; }
    get bodyUsed() { return this.#body.bodyUsed; }
    get url() { return this.#url; }
    get type() { return this.#type; }
    get redirected() { return this.#redirected; }

    async text() { return this.#body.text(); }
    async json() { return this.#body.json(); }
    async arrayBuffer() { return this.#body.arrayBuffer(); }

    clone() {
      if (this.#body.bodyUsed) throw new TypeError('Cannot clone a consumed response');
      const clonedBody = this.#body.clone();
      const res = new Response(null, {
        status: this.#status,
        statusText: this.#statusText,
        headers: new Headers(this.#headers),
        url: this.#url,
      });
      // Replace the body with the cloned one
      res.#body = clonedBody;
      return res;
    }

    static json(data, init = {}) {
      const body = JSON.stringify(data);
      const headers = new Headers(init.headers);
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
      return new Response(body, {
        ...init,
        headers,
      });
    }

    static redirect(url, status = 302) {
      if (![301, 302, 303, 307, 308].includes(status)) {
        throw new RangeError('Invalid redirect status: ' + status);
      }
      return new Response(null, {
        status,
        headers: { Location: String(url) },
      });
    }
  }

  // =====================================================================
  // Upgraded fetch()
  // =====================================================================
  const _originalFetch = globalThis.fetch;

  globalThis.fetch = async function(input, init = {}) {
    const req = input instanceof Request ? input : new Request(input, init);
    const signal = init.signal || req.signal;

    // Check if already aborted
    if (signal && signal.aborted) {
      throw signal.reason || new DOMException_('The operation was aborted.', 'AbortError');
    }

    // Build options for Rust op
    const options = {
      method: req.method,
      headers: {},
      body: undefined,
    };

    for (const [k, v] of req.headers.entries()) {
      options.headers[k] = v;
    }

    if (init.body !== undefined) {
      options.body = init.body;
    } else if (input instanceof Request && !req.bodyUsed && req.method !== 'GET' && req.method !== 'HEAD') {
      // Read body from Request object
      options.body = await req.text();
    }

    // Set up abort handling
    let abortReject;
    let abortPromise;
    if (signal) {
      abortPromise = new Promise((_, reject) => {
        abortReject = reject;
        if (signal.aborted) {
          reject(signal.reason || new DOMException_('The operation was aborted.', 'AbortError'));
        } else {
          signal.addEventListener('abort', () => {
            reject(signal.reason || new DOMException_('The operation was aborted.', 'AbortError'));
          }, { once: true });
        }
      });
    }

    const fetchPromise = Deno.core.ops.op_fetch(req.url, options);

    let raw;
    if (abortPromise) {
      raw = await Promise.race([fetchPromise, abortPromise]);
    } else {
      raw = await fetchPromise;
    }

    const responseHeaders = new Headers(raw.headers);

    return new Response(raw.body, {
      status: raw.status,
      statusText: raw.statusText,
      headers: responseHeaders,
      url: req.url,
    });
  };

  // =====================================================================
  // Expose globals
  // =====================================================================
  globalThis.Event = Event;
  globalThis.EventTarget = EventTarget;
  globalThis.AbortController = AbortController;
  globalThis.AbortSignal = AbortSignal;
  globalThis.DOMException = DOMException_;
  globalThis.Headers = Headers;
  globalThis.Request = Request;
  globalThis.Response = Response;
})(globalThis);
"#;

#[cfg(test)]
mod tests {
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions::default()).unwrap()
    }

    async fn run_async(rt: &mut VertzJsRuntime, code: &str) -> serde_json::Value {
        let wrapped = format!(
            r#"(async () => {{ {} }})().then(v => {{ globalThis.__result = v; }}).catch(e => {{ globalThis.__result = 'ERROR: ' + e.message; }})"#,
            code
        );
        rt.execute_script_void("<test>", &wrapped).unwrap();
        rt.run_event_loop().await.unwrap();
        rt.execute_script("<read>", "globalThis.__result").unwrap()
    }

    // --- Event ---

    #[test]
    fn test_event_type() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const e = new Event('click');
                [e.type, e.bubbles, e.cancelable, e.defaultPrevented]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["click", false, false, false]));
    }

    #[test]
    fn test_event_prevent_default() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const e = new Event('submit', { cancelable: true });
                e.preventDefault();
                e.defaultPrevented
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    // --- EventTarget ---

    #[test]
    fn test_event_target_add_dispatch() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const results = [];
                const target = new EventTarget();
                target.addEventListener('test', (e) => results.push(e.type));
                target.dispatchEvent(new Event('test'));
                results
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["test"]));
    }

    #[test]
    fn test_event_target_remove_listener() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const results = [];
                const target = new EventTarget();
                const handler = () => results.push('called');
                target.addEventListener('test', handler);
                target.removeEventListener('test', handler);
                target.dispatchEvent(new Event('test'));
                results.length
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(0));
    }

    #[test]
    fn test_event_target_once() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                let count = 0;
                const target = new EventTarget();
                target.addEventListener('test', () => count++, { once: true });
                target.dispatchEvent(new Event('test'));
                target.dispatchEvent(new Event('test'));
                count
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(1));
    }

    // --- Headers ---

    #[test]
    fn test_headers_case_insensitive() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const h = new Headers({ 'Content-Type': 'application/json' });
                [h.get('content-type'), h.get('Content-Type'), h.has('CONTENT-TYPE')]
            "#,
            )
            .unwrap();
        assert_eq!(
            result,
            serde_json::json!(["application/json", "application/json", true])
        );
    }

    #[test]
    fn test_headers_append_multiple() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const h = new Headers();
                h.append('X-Custom', 'a');
                h.append('X-Custom', 'b');
                h.get('x-custom')
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("a, b"));
    }

    #[test]
    fn test_headers_iteration() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const h = new Headers({ 'A': '1', 'B': '2' });
                const entries = [];
                for (const [k, v] of h) {
                    entries.push(k + '=' + v);
                }
                entries.sort()
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["a=1", "b=2"]));
    }

    #[test]
    fn test_headers_from_headers() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const h1 = new Headers({ 'X-Foo': 'bar' });
                const h2 = new Headers(h1);
                h2.get('x-foo')
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("bar"));
    }

    #[test]
    fn test_headers_set_overwrites() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const h = new Headers();
                h.append('X-Foo', 'a');
                h.append('X-Foo', 'b');
                h.set('X-Foo', 'c');
                h.get('x-foo')
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("c"));
    }

    #[test]
    fn test_headers_delete() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const h = new Headers({ 'X-Foo': 'bar' });
                h.delete('x-foo');
                h.has('x-foo')
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(false));
    }

    // --- Response ---

    #[tokio::test]
    async fn test_response_text() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const res = new Response('hello world');
            return await res.text();
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!("hello world"));
    }

    #[tokio::test]
    async fn test_response_json() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const res = new Response('{"a":1}');
            return await res.json();
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!({"a": 1}));
    }

    #[tokio::test]
    async fn test_response_body_consumed_twice_throws() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const res = new Response('data');
            await res.text();
            try {
                await res.text();
                return 'no-throw';
            } catch (e) {
                return e.message.includes('consumed') ? 'consumed-error' : e.message;
            }
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!("consumed-error"));
    }

    #[tokio::test]
    async fn test_response_body_used() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const res = new Response('data');
            const before = res.bodyUsed;
            await res.text();
            return [before, res.bodyUsed];
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!([false, true]));
    }

    #[tokio::test]
    async fn test_response_clone() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const res = new Response('data');
            const clone = res.clone();
            const a = await res.text();
            const b = await clone.text();
            return [a, b];
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!(["data", "data"]));
    }

    #[test]
    fn test_response_status_ok() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const res200 = new Response('ok', { status: 200 });
                const res404 = new Response('nf', { status: 404, statusText: 'Not Found' });
                [res200.ok, res200.status, res404.ok, res404.status, res404.statusText]
            "#,
            )
            .unwrap();
        assert_eq!(
            result,
            serde_json::json!([true, 200, false, 404, "Not Found"])
        );
    }

    #[test]
    fn test_response_json_static() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const res = Response.json({ ok: true });
                [res.status, res.headers.get('content-type')]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([200, "application/json"]));
    }

    #[test]
    fn test_response_redirect() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const res = Response.redirect('/new', 301);
                [res.status, res.headers.get('location')]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([301, "/new"]));
    }

    // --- Request ---

    #[test]
    fn test_request_basic() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const req = new Request('https://example.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });
                [req.url, req.method, req.headers.get('content-type')]
            "#,
            )
            .unwrap();
        assert_eq!(
            result,
            serde_json::json!(["https://example.com", "POST", "application/json"])
        );
    }

    #[tokio::test]
    async fn test_request_body() {
        let mut rt = create_runtime();
        let result = run_async(
            &mut rt,
            r#"
            const req = new Request('https://example.com', {
                method: 'POST',
                body: '{"a":1}',
            });
            return await req.json();
        "#,
        )
        .await;
        assert_eq!(result, serde_json::json!({"a": 1}));
    }

    // --- AbortController / AbortSignal ---

    #[test]
    fn test_abort_controller_basic() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const ac = new AbortController();
                const before = ac.signal.aborted;
                ac.abort();
                [before, ac.signal.aborted]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([false, true]));
    }

    #[test]
    fn test_abort_signal_reason() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const ac = new AbortController();
                ac.abort('custom reason');
                ac.signal.reason
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("custom reason"));
    }

    #[test]
    fn test_abort_signal_event_listener() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const ac = new AbortController();
                let fired = false;
                ac.signal.addEventListener('abort', () => { fired = true; });
                ac.abort();
                fired
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_abort_signal_abort_static() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const s = AbortSignal.abort();
                [s.aborted, s.reason instanceof DOMException, s.reason.name]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([true, true, "AbortError"]));
    }

    #[test]
    fn test_abort_signal_any() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const ac1 = new AbortController();
                const ac2 = new AbortController();
                const combined = AbortSignal.any([ac1.signal, ac2.signal]);
                const before = combined.aborted;
                ac2.abort('from ac2');
                [before, combined.aborted, combined.reason]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!([false, true, "from ac2"]));
    }

    #[test]
    fn test_abort_signal_throw_if_aborted() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const ac = new AbortController();
                ac.abort();
                try {
                    ac.signal.throwIfAborted();
                    'no-throw'
                } catch (e) {
                    e.name === 'AbortError' ? 'correct' : e.name
                }
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("correct"));
    }

    // --- DOMException ---

    #[test]
    fn test_dom_exception() {
        let mut rt = create_runtime();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const e = new DOMException('test', 'AbortError');
                [e.message, e.name, e.code, e instanceof Error]
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(["test", "AbortError", 20, true]));
    }
}
