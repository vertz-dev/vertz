//! Minimal DOM shim for server-side rendering in V8.
//!
//! Provides `document`, `window`, `Element`, `Text`, `DocumentFragment`, etc.
//! just enough for Vertz's JSX runtime to render components to HTML strings
//! without crashing on missing DOM globals.

/// The JavaScript source for the DOM shim.
/// This is a minimal implementation that provides:
/// - `document.createElement`, `createTextNode`, `createDocumentFragment`, `createComment`
/// - `Element` with `appendChild`, `setAttribute`, `innerHTML`, `outerHTML`, `textContent`
/// - `window`, `navigator`, `location` globals
/// - `document.head`, `document.body`
/// - `Node` interface with `childNodes`, `parentNode`, `nodeType`
pub const DOM_SHIM_JS: &str = r#"
// === Vertz SSR DOM Shim ===
// Minimal DOM implementation for server-side rendering.

(function() {
  'use strict';

  // --- Node types ---
  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;
  const COMMENT_NODE = 8;
  const DOCUMENT_FRAGMENT_NODE = 11;

  // --- CSS collector ---
  const __vertz_collected_css = [];

  // --- Base Node ---
  class SSRNode {
    constructor(nodeType) {
      this.nodeType = nodeType;
      this.childNodes = [];
      this.parentNode = null;
    }

    appendChild(child) {
      if (child instanceof SSRDocumentFragment) {
        // Append all children of the fragment
        for (const c of [...child.childNodes]) {
          c.parentNode = this;
          this.childNodes.push(c);
        }
        child.childNodes = [];
      } else {
        // Remove from previous parent if any
        if (child.parentNode) {
          child.parentNode.removeChild(child);
        }
        child.parentNode = this;
        this.childNodes.push(child);
      }
      return child;
    }

    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx >= 0) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }

    insertBefore(newChild, refChild) {
      if (!refChild) {
        return this.appendChild(newChild);
      }
      if (newChild instanceof SSRDocumentFragment) {
        const idx = this.childNodes.indexOf(refChild);
        for (const c of [...newChild.childNodes]) {
          c.parentNode = this;
          this.childNodes.splice(idx, 0, c);
        }
        newChild.childNodes = [];
      } else {
        if (newChild.parentNode) {
          newChild.parentNode.removeChild(newChild);
        }
        const idx = this.childNodes.indexOf(refChild);
        if (idx >= 0) {
          newChild.parentNode = this;
          this.childNodes.splice(idx, 0, newChild);
        } else {
          return this.appendChild(newChild);
        }
      }
      return newChild;
    }

    replaceChild(newChild, oldChild) {
      const idx = this.childNodes.indexOf(oldChild);
      if (idx >= 0) {
        oldChild.parentNode = null;
        newChild.parentNode = this;
        this.childNodes[idx] = newChild;
      }
      return oldChild;
    }

    get firstChild() {
      return this.childNodes[0] || null;
    }

    get lastChild() {
      return this.childNodes[this.childNodes.length - 1] || null;
    }

    get nextSibling() {
      if (!this.parentNode) return null;
      const siblings = this.parentNode.childNodes;
      const idx = siblings.indexOf(this);
      return siblings[idx + 1] || null;
    }

    get previousSibling() {
      if (!this.parentNode) return null;
      const siblings = this.parentNode.childNodes;
      const idx = siblings.indexOf(this);
      return idx > 0 ? siblings[idx - 1] : null;
    }

    cloneNode(deep) {
      return this; // Shallow clone for SSR
    }

    contains(node) {
      if (node === this) return true;
      for (const child of this.childNodes) {
        if (child === node || child.contains(node)) return true;
      }
      return false;
    }

    get ownerDocument() {
      return globalThis.document;
    }

    hasChildNodes() {
      return this.childNodes.length > 0;
    }
  }

  // --- Text Node ---
  class SSRTextNode extends SSRNode {
    constructor(text) {
      super(TEXT_NODE);
      this.textContent = String(text);
      this.data = String(text);
      this.nodeValue = String(text);
    }

    get nodeName() { return '#text'; }

    serialize() {
      return escapeHtml(this.textContent);
    }
  }

  // --- Comment Node ---
  class SSRComment extends SSRNode {
    constructor(data) {
      super(COMMENT_NODE);
      this.data = data;
      this.nodeValue = data;
    }

    get nodeName() { return '#comment'; }

    serialize() {
      return '<!--' + this.data + '-->';
    }
  }

  // --- DocumentFragment ---
  class SSRDocumentFragment extends SSRNode {
    constructor() {
      super(DOCUMENT_FRAGMENT_NODE);
    }

    get nodeName() { return '#document-fragment'; }

    get innerHTML() {
      return this.childNodes.map(c => serializeNode(c)).join('');
    }

    get textContent() {
      return this.childNodes.map(c => c.textContent || '').join('');
    }

    set textContent(val) {
      this.childNodes = [];
      if (val) {
        this.appendChild(new SSRTextNode(val));
      }
    }
  }

  // --- Element ---
  class SSRElement extends SSRNode {
    constructor(tagName) {
      super(ELEMENT_NODE);
      this.tagName = tagName.toUpperCase();
      this.nodeName = this.tagName;
      this.localName = tagName.toLowerCase();
      this.attributes = {};
      this._classList = [];
      this._style = {};
      this._eventListeners = {};
    }

    getAttribute(name) {
      return this.attributes[name] !== undefined ? this.attributes[name] : null;
    }

    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'class') {
        this._classList = String(value).split(/\s+/).filter(Boolean);
      }
    }

    removeAttribute(name) {
      delete this.attributes[name];
      if (name === 'class') {
        this._classList = [];
      }
    }

    hasAttribute(name) {
      return name in this.attributes;
    }

    get id() {
      return this.attributes.id || '';
    }

    set id(val) {
      this.attributes.id = val;
    }

    get className() {
      return this.attributes.class || '';
    }

    set className(val) {
      this.attributes.class = val;
      this._classList = String(val).split(/\s+/).filter(Boolean);
    }

    get classList() {
      const self = this;
      return {
        add(...classes) {
          for (const c of classes) {
            if (!self._classList.includes(c)) {
              self._classList.push(c);
            }
          }
          self.attributes.class = self._classList.join(' ');
        },
        remove(...classes) {
          self._classList = self._classList.filter(c => !classes.includes(c));
          self.attributes.class = self._classList.join(' ');
        },
        toggle(c) {
          if (self._classList.includes(c)) {
            self._classList = self._classList.filter(x => x !== c);
          } else {
            self._classList.push(c);
          }
          self.attributes.class = self._classList.join(' ');
        },
        contains(c) { return self._classList.includes(c); },
        get length() { return self._classList.length; },
        item(i) { return self._classList[i] || null; },
        toString() { return self._classList.join(' '); }
      };
    }

    get style() {
      const self = this;
      return new Proxy(self._style, {
        set(target, prop, value) {
          target[prop] = value;
          return true;
        },
        get(target, prop) {
          if (prop === 'cssText') {
            return Object.entries(target)
              .map(([k, v]) => camelToKebab(k) + ': ' + v)
              .join('; ');
          }
          if (prop === 'setProperty') {
            return (name, value) => { target[camelCase(name)] = value; };
          }
          if (prop === 'getPropertyValue') {
            return (name) => target[camelCase(name)] || '';
          }
          if (prop === 'removeProperty') {
            return (name) => { delete target[camelCase(name)]; };
          }
          return target[prop] || '';
        }
      });
    }

    set style(val) {
      if (typeof val === 'string') {
        this._style = {};
        // Parse basic CSS string
        val.split(';').forEach(decl => {
          const [prop, ...rest] = decl.split(':');
          if (prop && rest.length) {
            this._style[camelCase(prop.trim())] = rest.join(':').trim();
          }
        });
      } else if (val && typeof val === 'object') {
        this._style = { ...val };
      }
    }

    get innerHTML() {
      return this.childNodes.map(c => serializeNode(c)).join('');
    }

    set innerHTML(html) {
      // Clear children and set raw HTML (stored as text for SSR)
      this.childNodes = [];
      if (html) {
        // For SSR, store raw HTML as a special text node that won't be escaped
        const rawNode = new SSRTextNode('');
        rawNode._rawHtml = html;
        rawNode.serialize = function() { return this._rawHtml; };
        this.appendChild(rawNode);
      }
    }

    get outerHTML() {
      return serializeElement(this);
    }

    get textContent() {
      return this.childNodes
        .map(c => c.textContent || '')
        .join('');
    }

    set textContent(val) {
      this.childNodes = [];
      if (val) {
        this.appendChild(new SSRTextNode(val));
      }
    }

    get children() {
      return this.childNodes.filter(c => c.nodeType === ELEMENT_NODE);
    }

    querySelector(selector) {
      // Very basic selector support for SSR
      return querySelect(this, selector);
    }

    querySelectorAll(selector) {
      const results = [];
      querySelectAll(this, selector, results);
      return results;
    }

    getElementsByTagName(tag) {
      const results = [];
      const upperTag = tag.toUpperCase();
      function walk(node) {
        for (const child of node.childNodes) {
          if (child.nodeType === ELEMENT_NODE &&
              (upperTag === '*' || child.tagName === upperTag)) {
            results.push(child);
          }
          if (child.childNodes) walk(child);
        }
      }
      walk(this);
      return results;
    }

    getElementById(id) {
      function walk(node) {
        for (const child of node.childNodes) {
          if (child.nodeType === ELEMENT_NODE && child.attributes.id === id) {
            return child;
          }
          if (child.childNodes) {
            const found = walk(child);
            if (found) return found;
          }
        }
        return null;
      }
      return walk(this);
    }

    addEventListener(type, listener) {
      // No-op for SSR — events don't fire on the server
    }

    removeEventListener(type, listener) {
      // No-op for SSR
    }

    dispatchEvent(event) {
      return true;
    }

    focus() {}
    blur() {}
    click() {}

    getBoundingClientRect() {
      return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0 };
    }

    getAnimations() {
      return [];
    }

    matches(selector) {
      return false; // Simplified for SSR
    }

    closest(selector) {
      return null; // Simplified for SSR
    }

    get dataset() {
      const self = this;
      return new Proxy({}, {
        get(_, prop) {
          return self.attributes['data-' + camelToKebab(String(prop))] || undefined;
        },
        set(_, prop, value) {
          self.attributes['data-' + camelToKebab(String(prop))] = String(value);
          return true;
        }
      });
    }

    get isConnected() {
      return true; // Simplified for SSR
    }

    remove() {
      if (this.parentNode) {
        this.parentNode.removeChild(this);
      }
    }
  }

  // --- Void elements (self-closing) ---
  const VOID_ELEMENTS = new Set([
    'AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT',
    'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'
  ]);

  // --- Serialization ---
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttrValue(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
  }

  function camelToKebab(str) {
    return String(str).replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  function camelCase(str) {
    return String(str).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  function serializeStyle(styleObj) {
    return Object.entries(styleObj)
      .filter(([_, v]) => v != null && v !== '')
      .map(([k, v]) => camelToKebab(k) + ': ' + v)
      .join('; ');
  }

  function serializeAttributes(el) {
    let result = '';
    for (const [name, value] of Object.entries(el.attributes)) {
      // Skip event handlers (on*)
      if (name.startsWith('on') && name.length > 2 && name[2] === name[2].toUpperCase()) {
        continue;
      }
      if (value === 'true' || value === true) {
        result += ' ' + name;
      } else if (value === 'false' || value === false || value == null) {
        continue;
      } else {
        result += ' ' + name + '="' + escapeAttrValue(value) + '"';
      }
    }

    // Serialize style if present
    const styleStr = serializeStyle(el._style);
    if (styleStr) {
      result += ' style="' + escapeAttrValue(styleStr) + '"';
    }

    return result;
  }

  function serializeElement(el) {
    const tag = el.localName;
    const attrs = serializeAttributes(el);

    if (VOID_ELEMENTS.has(el.tagName)) {
      return '<' + tag + attrs + ' />';
    }

    const children = el.childNodes.map(c => serializeNode(c)).join('');
    return '<' + tag + attrs + '>' + children + '</' + tag + '>';
  }

  function serializeNode(node) {
    if (node.nodeType === ELEMENT_NODE) {
      return serializeElement(node);
    }
    if (node.serialize) {
      return node.serialize();
    }
    if (node.nodeType === TEXT_NODE) {
      return escapeHtml(node.textContent);
    }
    if (node.nodeType === COMMENT_NODE) {
      return '<!--' + node.data + '-->';
    }
    return '';
  }

  // --- Basic query selector support ---
  function matchesSimpleSelector(el, selector) {
    if (selector.startsWith('#')) {
      return el.attributes.id === selector.slice(1);
    }
    if (selector.startsWith('.')) {
      return el._classList.includes(selector.slice(1));
    }
    if (selector.startsWith('[')) {
      const match = selector.match(/\[([^\]=]+)(?:="([^"]*)")?\]/);
      if (match) {
        const [, attr, val] = match;
        if (val !== undefined) {
          return el.attributes[attr] === val;
        }
        return attr in el.attributes;
      }
    }
    return el.localName === selector.toLowerCase();
  }

  function querySelect(root, selector) {
    for (const child of root.childNodes) {
      if (child.nodeType === ELEMENT_NODE && matchesSimpleSelector(child, selector)) {
        return child;
      }
      if (child.childNodes) {
        const found = querySelect(child, selector);
        if (found) return found;
      }
    }
    return null;
  }

  function querySelectAll(root, selector, results) {
    for (const child of root.childNodes) {
      if (child.nodeType === ELEMENT_NODE && matchesSimpleSelector(child, selector)) {
        results.push(child);
      }
      if (child.childNodes) {
        querySelectAll(child, selector, results);
      }
    }
  }

  // --- Document ---
  class SSRDocument extends SSRElement {
    constructor() {
      super('html');
      this.nodeType = 9; // DOCUMENT_NODE
      this.nodeName = '#document';
      this.head = new SSRElement('head');
      this.body = new SSRElement('body');
      this.documentElement = new SSRElement('html');
      this.head.parentNode = this.documentElement;
      this.body.parentNode = this.documentElement;
      this.documentElement.childNodes = [this.head, this.body];
    }

    createElement(tagName) {
      return new SSRElement(tagName);
    }

    createTextNode(text) {
      return new SSRTextNode(text);
    }

    createDocumentFragment() {
      return new SSRDocumentFragment();
    }

    createComment(data) {
      return new SSRComment(data || '');
    }

    createElementNS(ns, tagName) {
      // Namespace is ignored for SSR
      return this.createElement(tagName);
    }

    createTreeWalker() {
      // No-op for SSR
      return {
        nextNode() { return null; },
        currentNode: null,
      };
    }

    getElementById(id) {
      return this.body.getElementById(id) || this.head.getElementById(id);
    }

    querySelector(sel) {
      return this.body.querySelector(sel) || this.head.querySelector(sel);
    }

    querySelectorAll(sel) {
      const results = [];
      querySelectAll(this.body, sel, results);
      querySelectAll(this.head, sel, results);
      return results;
    }

    getElementsByTagName(tag) {
      return [
        ...this.head.getElementsByTagName(tag),
        ...this.body.getElementsByTagName(tag),
      ];
    }
  }

  // --- Event (no-op) ---
  class SSREvent {
    constructor(type, options) {
      this.type = type;
      this.bubbles = options?.bubbles || false;
      this.cancelable = options?.cancelable || false;
      this.defaultPrevented = false;
    }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() {}
    stopImmediatePropagation() {}
  }

  class SSRCustomEvent extends SSREvent {
    constructor(type, options) {
      super(type, options);
      this.detail = options?.detail || null;
    }
  }

  // --- MutationObserver (no-op) ---
  class SSRMutationObserver {
    constructor() {}
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
  }

  // --- ResizeObserver (no-op) ---
  class SSRResizeObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  // --- IntersectionObserver (no-op) ---
  class SSRIntersectionObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  // --- Install globals ---
  const doc = new SSRDocument();

  // Create the #app mount point that mount() expects
  const appRoot = doc.createElement('div');
  appRoot.setAttribute('id', 'app');
  doc.body.appendChild(appRoot);

  globalThis.document = doc;
  globalThis.Document = SSRDocument;
  globalThis.Element = SSRElement;
  globalThis.HTMLElement = SSRElement;
  globalThis.HTMLDivElement = SSRElement;
  globalThis.HTMLSpanElement = SSRElement;
  globalThis.HTMLButtonElement = SSRElement;
  globalThis.HTMLInputElement = SSRElement;
  globalThis.HTMLFormElement = SSRElement;
  globalThis.HTMLAnchorElement = SSRElement;
  globalThis.HTMLImageElement = SSRElement;
  globalThis.HTMLTemplateElement = SSRElement;
  globalThis.HTMLStyleElement = SSRElement;
  globalThis.SVGElement = SSRElement;
  globalThis.Text = SSRTextNode;
  globalThis.Comment = SSRComment;
  globalThis.DocumentFragment = SSRDocumentFragment;
  globalThis.Node = SSRNode;
  globalThis.Event = SSREvent;
  globalThis.CustomEvent = SSRCustomEvent;
  globalThis.MutationObserver = SSRMutationObserver;
  globalThis.ResizeObserver = SSRResizeObserver;
  globalThis.IntersectionObserver = SSRIntersectionObserver;
  globalThis.NodeList = Array;

  // requestAnimationFrame / cancelAnimationFrame (no-op)
  globalThis.requestAnimationFrame = function(cb) { return 0; };
  globalThis.cancelAnimationFrame = function() {};

  // matchMedia (no-op)
  globalThis.matchMedia = function(query) {
    return {
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
    };
  };

  // getComputedStyle (no-op)
  globalThis.getComputedStyle = function(el) {
    return new Proxy({}, {
      get(_, prop) {
        if (prop === 'getPropertyValue') return () => '';
        return '';
      }
    });
  };

  // Event target methods (no-op in SSR)
  if (typeof globalThis.addEventListener === 'undefined') {
    globalThis.addEventListener = function() {};
    globalThis.removeEventListener = function() {};
    globalThis.dispatchEvent = function() { return true; };
  }

  // window as globalThis alias
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
  }

  // navigator
  if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = {
      userAgent: 'vertz-ssr/1.0',
      language: 'en',
      languages: ['en'],
      platform: 'server',
      onLine: true,
    };
  }

  // location (default to /)
  if (typeof globalThis.location === 'undefined') {
    globalThis.location = {
      href: 'http://localhost/',
      origin: 'http://localhost',
      protocol: 'http:',
      host: 'localhost',
      hostname: 'localhost',
      port: '',
      pathname: '/',
      search: '',
      hash: '',
    };
  }

  // history (no-op)
  if (typeof globalThis.history === 'undefined') {
    globalThis.history = {
      pushState() {},
      replaceState() {},
      back() {},
      forward() {},
      go() {},
      state: null,
      length: 1,
    };
  }

  // CSS utilities used by Vertz's css() / variants() runtime
  // __vertz_inject_css collects CSS strings during SSR
  globalThis.__vertz_inject_css = function(css, id) {
    if (id && __vertz_collected_css.some(c => c.id === id)) return;
    __vertz_collected_css.push({ css, id: id || null });
  };

  globalThis.__vertz_get_collected_css = function() {
    // Merge CSS from two sources:
    // 1. Explicit __vertz_inject_css() calls (used by native compiler pipeline)
    // 2. <style> elements appended to document.head by @vertz/ui's injectCSS()
    //    (when SSR context is not set, injectCSS falls back to DOM <style> tags)
    const seen = new Set(__vertz_collected_css.map(c => c.css));
    const merged = [...__vertz_collected_css];

    if (typeof document !== 'undefined' && document.head) {
      for (const child of document.head.childNodes) {
        if (child.nodeType === ELEMENT_NODE && child.tagName === 'STYLE') {
          const css = child.textContent || '';
          if (css && !seen.has(css)) {
            seen.add(css);
            const id = child.getAttribute ? child.getAttribute('data-css-id') || null : null;
            merged.push({ css, id });
          }
        }
      }
    }

    return merged;
  };

  globalThis.__vertz_clear_collected_css = function() {
    __vertz_collected_css.length = 0;
  };

  // URLSearchParams shim (used by the router for query string parsing)
  if (typeof globalThis.URLSearchParams === 'undefined') {
    class SSRURLSearchParams {
      constructor(init) {
        this._params = [];
        if (typeof init === 'string') {
          const s = init.startsWith('?') ? init.slice(1) : init;
          if (s) {
            for (const pair of s.split('&')) {
              const [k, ...rest] = pair.split('=');
              this._params.push([decodeURIComponent(k), decodeURIComponent(rest.join('='))]);
            }
          }
        } else if (init && typeof init === 'object') {
          for (const [k, v] of Object.entries(init)) {
            this._params.push([String(k), String(v)]);
          }
        }
      }
      get(name) {
        const entry = this._params.find(([k]) => k === name);
        return entry ? entry[1] : null;
      }
      getAll(name) { return this._params.filter(([k]) => k === name).map(([, v]) => v); }
      has(name) { return this._params.some(([k]) => k === name); }
      set(name, value) {
        const idx = this._params.findIndex(([k]) => k === name);
        if (idx >= 0) this._params[idx] = [name, String(value)];
        else this._params.push([name, String(value)]);
      }
      append(name, value) { this._params.push([name, String(value)]); }
      delete(name) { this._params = this._params.filter(([k]) => k !== name); }
      toString() {
        return this._params.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
      }
      entries() { return this._params[Symbol.iterator](); }
      keys() { return this._params.map(([k]) => k)[Symbol.iterator](); }
      values() { return this._params.map(([, v]) => v)[Symbol.iterator](); }
      forEach(cb) { this._params.forEach(([k, v]) => cb(v, k, this)); }
      [Symbol.iterator]() { return this.entries(); }
      get size() { return this._params.length; }
    }
    globalThis.URLSearchParams = SSRURLSearchParams;
  }

  // URL shim (used by the router and other utilities)
  if (typeof globalThis.URL === 'undefined') {
    class SSRURL {
      constructor(input, base) {
        let full = input;
        if (base && !input.includes('://')) {
          // Resolve relative to base
          const b = typeof base === 'string' ? base : base.href;
          if (input.startsWith('/')) {
            const origin = b.match(/^[a-z]+:\/\/[^/]+/i);
            full = (origin ? origin[0] : '') + input;
          } else {
            full = b.replace(/\/[^/]*$/, '/') + input;
          }
        }
        const match = full.match(/^([a-z]+:)\/\/([^/:]+)(:\d+)?(\/[^?#]*)(\?[^#]*)?(#.*)?$/i);
        if (match) {
          this.protocol = match[1];
          this.hostname = match[2];
          this.port = match[3] ? match[3].slice(1) : '';
          this.pathname = match[4] || '/';
          this.search = match[5] || '';
          this.hash = match[6] || '';
          this.host = this.hostname + (this.port ? ':' + this.port : '');
          this.origin = this.protocol + '//' + this.host;
        } else {
          this.protocol = '';
          this.hostname = '';
          this.port = '';
          this.pathname = full;
          this.search = '';
          this.hash = '';
          this.host = '';
          this.origin = '';
        }
        this.searchParams = new globalThis.URLSearchParams(this.search);
        this.href = this.origin + this.pathname + this.search + this.hash;
      }
      toString() { return this.href; }
    }
    globalThis.URL = SSRURL;
  }

  // AbortController / AbortSignal shim (used by router, fetch, etc.)
  if (typeof globalThis.AbortController === 'undefined') {
    class SSRAbortSignal {
      constructor() {
        this.aborted = false;
        this.reason = undefined;
        this._listeners = [];
      }
      addEventListener(type, listener) {
        if (type === 'abort') this._listeners.push(listener);
      }
      removeEventListener(type, listener) {
        if (type === 'abort') {
          this._listeners = this._listeners.filter(l => l !== listener);
        }
      }
      throwIfAborted() {
        if (this.aborted) throw this.reason;
      }
    }
    class SSRAbortController {
      constructor() {
        this.signal = new SSRAbortSignal();
      }
      abort(reason) {
        if (this.signal.aborted) return;
        this.signal.aborted = true;
        this.signal.reason = reason || new DOMException('The operation was aborted.', 'AbortError');
        for (const listener of this.signal._listeners) {
          try { listener({ type: 'abort', target: this.signal }); } catch(_) {}
        }
      }
    }
    globalThis.AbortController = SSRAbortController;
    globalThis.AbortSignal = SSRAbortSignal;
  }

  // DOMException shim
  if (typeof globalThis.DOMException === 'undefined') {
    class SSRDOMException extends Error {
      constructor(message, name) {
        super(message);
        this.name = name || 'Error';
        this.code = 0;
      }
    }
    globalThis.DOMException = SSRDOMException;
  }

  // queueMicrotask shim
  if (typeof globalThis.queueMicrotask === 'undefined') {
    globalThis.queueMicrotask = function(cb) { Promise.resolve().then(cb); };
  }

  // Expose serialization helpers for SSR render
  globalThis.__vertz_ssr = {
    serializeNode,
    serializeElement,
    escapeHtml,
    SSRElement,
    SSRTextNode,
    SSRComment,
    SSRDocumentFragment,
    SSRDocument,
    VOID_ELEMENTS,
  };
})();
"#;

/// Load the DOM shim into a V8 runtime.
///
/// This must be called before loading any app modules that use DOM APIs.
/// It installs `document`, `window`, `Element`, etc. into `globalThis`.
pub fn load_dom_shim(
    runtime: &mut crate::runtime::js_runtime::VertzJsRuntime,
) -> Result<(), deno_core::error::AnyError> {
    runtime.execute_script_void("[vertz:dom-shim]", DOM_SHIM_JS)
}

/// Set the SSR location for routing.
///
/// Updates `globalThis.location` to match the incoming request URL
/// so that router components render the correct route during SSR.
pub fn set_ssr_location(
    runtime: &mut crate::runtime::js_runtime::VertzJsRuntime,
    url: &str,
) -> Result<(), deno_core::error::AnyError> {
    // Parse the URL on the Rust side (V8 doesn't have URL constructor)
    let (pathname, search, hash) = parse_url_parts(url);

    let href = format!("http://localhost{}{}{}", pathname, search, hash);

    let code = format!(
        r#"
        (function() {{
            globalThis.location = {{
                href: {href},
                origin: "http://localhost",
                protocol: "http:",
                host: "localhost",
                hostname: "localhost",
                port: "",
                pathname: {pathname},
                search: {search},
                hash: {hash},
            }};
        }})();
        "#,
        href = serde_json::to_string(&href).unwrap(),
        pathname = serde_json::to_string(&pathname).unwrap(),
        search = serde_json::to_string(&search).unwrap(),
        hash = serde_json::to_string(&hash).unwrap(),
    );
    runtime.execute_script_void("[vertz:set-location]", &code)
}

/// Parse a URL string into (pathname, search, hash) components.
fn parse_url_parts(url: &str) -> (String, String, String) {
    let mut remaining = url;

    // Extract hash
    let (before_hash, hash) = match remaining.find('#') {
        Some(pos) => (&remaining[..pos], remaining[pos..].to_string()),
        None => (remaining, String::new()),
    };
    remaining = before_hash;

    // Extract search
    let (pathname, search) = match remaining.find('?') {
        Some(pos) => (remaining[..pos].to_string(), remaining[pos..].to_string()),
        None => (remaining.to_string(), String::new()),
    };

    // Ensure pathname starts with /
    let pathname = if pathname.starts_with('/') {
        pathname
    } else {
        format!("/{}", pathname)
    };

    (pathname, search, hash)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    fn create_runtime() -> VertzJsRuntime {
        VertzJsRuntime::new(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap()
    }

    #[test]
    fn test_dom_shim_loads_without_error() {
        let mut rt = create_runtime();
        let result = load_dom_shim(&mut rt);
        assert!(result.is_ok(), "DOM shim should load: {:?}", result.err());
    }

    #[test]
    fn test_document_is_defined() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script("<test>", "typeof globalThis.document")
            .unwrap();
        assert_eq!(result, serde_json::json!("object"));
    }

    #[test]
    fn test_window_is_defined() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script("<test>", "typeof globalThis.window")
            .unwrap();
        assert_eq!(result, serde_json::json!("object"));
    }

    #[test]
    fn test_navigator_is_defined() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script("<test>", "typeof globalThis.navigator")
            .unwrap();
        assert_eq!(result, serde_json::json!("object"));
    }

    #[test]
    fn test_location_is_defined() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script("<test>", "globalThis.location.pathname")
            .unwrap();
        assert_eq!(result, serde_json::json!("/"));
    }

    #[test]
    fn test_create_element() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                div.tagName
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("DIV"));
    }

    #[test]
    fn test_create_text_node() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const text = document.createTextNode('hello');
                text.textContent
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("hello"));
    }

    #[test]
    fn test_create_document_fragment() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const frag = document.createDocumentFragment();
                frag.nodeType
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(11));
    }

    #[test]
    fn test_element_set_attribute() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                div.setAttribute('id', 'test');
                div.getAttribute('id')
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("test"));
    }

    #[test]
    fn test_element_append_child() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                const span = document.createElement('span');
                div.appendChild(span);
                div.childNodes.length
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(1));
    }

    #[test]
    fn test_element_inner_html() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                const span = document.createElement('span');
                const text = document.createTextNode('hello');
                span.appendChild(text);
                div.appendChild(span);
                div.innerHTML
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("<span>hello</span>"));
    }

    #[test]
    fn test_element_outer_html() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                div.setAttribute('class', 'greeting');
                const text = document.createTextNode('Hello');
                div.appendChild(text);
                div.outerHTML
                "#,
            )
            .unwrap();
        assert_eq!(
            result,
            serde_json::json!(r#"<div class="greeting">Hello</div>"#)
        );
    }

    #[test]
    fn test_element_outer_html_escapes() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                div.appendChild(document.createTextNode('<script>alert("xss")</script>'));
                div.outerHTML
                "#,
            )
            .unwrap();
        assert_eq!(
            result,
            serde_json::json!(r#"<div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>"#)
        );
    }

    #[test]
    fn test_void_elements_self_close() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const input = document.createElement('input');
                input.setAttribute('type', 'text');
                input.outerHTML
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(r#"<input type="text" />"#));
    }

    #[test]
    fn test_element_class_name() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                div.className = 'foo bar';
                div.className
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("foo bar"));
    }

    #[test]
    fn test_element_class_list() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                div.classList.add('foo', 'bar');
                div.classList.contains('foo')
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_set_ssr_location() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        set_ssr_location(&mut rt, "/tasks/123?filter=active").unwrap();
        let result = rt
            .execute_script("<test>", "globalThis.location.pathname")
            .unwrap();
        assert_eq!(result, serde_json::json!("/tasks/123"));
        let search = rt
            .execute_script("<test>", "globalThis.location.search")
            .unwrap();
        assert_eq!(search, serde_json::json!("?filter=active"));
    }

    #[test]
    fn test_set_ssr_location_root() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        set_ssr_location(&mut rt, "/").unwrap();
        let result = rt
            .execute_script("<test>", "globalThis.location.pathname")
            .unwrap();
        assert_eq!(result, serde_json::json!("/"));
    }

    #[test]
    fn test_document_head_and_body_exist() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let head = rt
            .execute_script("<test>", "document.head.tagName")
            .unwrap();
        assert_eq!(head, serde_json::json!("HEAD"));
        let body = rt
            .execute_script("<test>", "document.body.tagName")
            .unwrap();
        assert_eq!(body, serde_json::json!("BODY"));
    }

    #[test]
    fn test_css_injection() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                __vertz_inject_css('.btn { color: red; }', 'btn-1');
                __vertz_inject_css('.card { padding: 8px; }', 'card-1');
                // Duplicate should be ignored
                __vertz_inject_css('.btn { color: red; }', 'btn-1');
                const collected = __vertz_get_collected_css();
                collected.length
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(2));
    }

    #[test]
    fn test_css_collection_and_clear() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        rt.execute_script_void(
            "<test>",
            r#"
            __vertz_inject_css('.foo { color: blue; }', 'foo');
            "#,
        )
        .unwrap();
        let before = rt
            .execute_script("<test>", "__vertz_get_collected_css().length")
            .unwrap();
        assert_eq!(before, serde_json::json!(1));

        rt.execute_script_void("<test>", "__vertz_clear_collected_css();")
            .unwrap();
        let after = rt
            .execute_script("<test>", "__vertz_get_collected_css().length")
            .unwrap();
        assert_eq!(after, serde_json::json!(0));
    }

    #[test]
    fn test_create_comment() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const comment = document.createComment('SSR boundary');
                const div = document.createElement('div');
                div.appendChild(comment);
                div.innerHTML
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("<!--SSR boundary-->"));
    }

    #[test]
    fn test_element_text_content_setter() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                div.textContent = 'Hello World';
                div.innerHTML
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("Hello World"));
    }

    #[test]
    fn test_nested_element_serialization() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const ul = document.createElement('ul');
                ul.setAttribute('class', 'list');
                for (let i = 0; i < 3; i++) {
                    const li = document.createElement('li');
                    li.appendChild(document.createTextNode('Item ' + i));
                    ul.appendChild(li);
                }
                ul.outerHTML
                "#,
            )
            .unwrap();
        assert_eq!(
            result,
            serde_json::json!(
                r#"<ul class="list"><li>Item 0</li><li>Item 1</li><li>Item 2</li></ul>"#
            )
        );
    }

    #[test]
    fn test_event_listeners_are_noop() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const btn = document.createElement('button');
                btn.addEventListener('click', () => {});
                btn.removeEventListener('click', () => {});
                'ok'
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("ok"));
    }

    #[test]
    fn test_request_animation_frame_is_noop() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const id = requestAnimationFrame(() => {});
                cancelAnimationFrame(id);
                typeof requestAnimationFrame
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("function"));
    }

    #[test]
    fn test_match_media_is_noop() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const mql = matchMedia('(prefers-color-scheme: dark)');
                mql.matches
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(false));
    }

    #[test]
    fn test_shim_does_not_interfere_with_globals() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        // Ensure basic JS still works after shim
        let result = rt.execute_script("<test>", "1 + 1").unwrap();
        assert_eq!(result, serde_json::json!(2));
    }

    #[test]
    fn test_mutation_observer_noop() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const observer = new MutationObserver(() => {});
                observer.observe(document.body);
                observer.disconnect();
                'ok'
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("ok"));
    }

    #[test]
    fn test_history_is_noop() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                history.pushState({}, '', '/new-path');
                'ok'
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("ok"));
    }

    #[test]
    fn test_element_style_serialization() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                div.style.backgroundColor = 'red';
                div.style.fontSize = '16px';
                div.outerHTML
                "#,
            )
            .unwrap();
        let html: String = serde_json::from_value(result).unwrap();
        assert!(html.contains("background-color: red"));
        assert!(html.contains("font-size: 16px"));
    }

    #[test]
    fn test_element_dataset() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                div.dataset.testId = 'abc';
                div.getAttribute('data-test-id')
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("abc"));
    }

    #[test]
    fn test_insert_before() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                const a = document.createElement('a');
                const b = document.createElement('b');
                div.appendChild(b);
                div.insertBefore(a, b);
                div.innerHTML
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("<a></a><b></b>"));
    }

    #[test]
    fn test_remove_child() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                const span = document.createElement('span');
                div.appendChild(span);
                div.removeChild(span);
                div.childNodes.length
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(0));
    }

    #[test]
    fn test_element_get_bounding_client_rect() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                const rect = div.getBoundingClientRect();
                rect.width
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(0));
    }

    #[test]
    fn test_document_fragment_append_to_element() {
        let mut rt = create_runtime();
        load_dom_shim(&mut rt).unwrap();
        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                const frag = document.createDocumentFragment();
                frag.appendChild(document.createElement('a'));
                frag.appendChild(document.createElement('b'));
                div.appendChild(frag);
                div.childNodes.length
                "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!(2));
    }
}
