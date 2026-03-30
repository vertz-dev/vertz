//! Full DOM shim for the test runner.
//!
//! Provides a complete DOM environment (document, window, elements, events,
//! selectors, TreeWalker) for component and integration tests. Pre-baked into
//! the V8 startup snapshot for zero per-file initialization cost.
//!
//! This is the test-mode counterpart of the SSR DOM shim (`ssr/dom_shim.rs`).
//! Unlike the SSR shim, this implementation:
//! - Uses class-based StyleMap/DatasetMap (no Proxy — V8 snapshots can't serialize Proxy)
//! - Returns correct subclasses from createElement (TAG_MAP dispatch)
//! - Has a real innerHTML parser that produces DOM nodes
//! - Implements full event dispatch (capture/target/bubble) — added in Phase 2
//! - Has a CSS selector engine — added in Phase 3

/// Phase 1: Core DOM — Node tree, attributes, content, element types, innerHTML parser.
/// Event dispatch (Phase 2), selector engine (Phase 3), and window/document extras (Phase 4)
/// will extend this constant or add companion constants.
pub const TEST_DOM_SHIM_JS: &str = r#"
// === Vertz Test DOM Shim (Phase 1: Core DOM) ===
(function() {
  'use strict';

  // Guard against double-initialization (e.g., if SSR shim already loaded)
  if (globalThis.__VERTZ_DOM_MODE) return;

  globalThis.__VERTZ_DOM_MODE = 'test';

  // --- Constants ---
  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;
  const COMMENT_NODE = 8;
  const DOCUMENT_NODE = 9;
  const DOCUMENT_FRAGMENT_NODE = 11;

  const VOID_ELEMENTS = new Set([
    'AREA','BASE','BR','COL','EMBED','HR','IMG','INPUT',
    'LINK','META','PARAM','SOURCE','TRACK','WBR'
  ]);

  const RAW_TEXT_ELEMENTS = new Set(['SCRIPT','STYLE']);

  // --- Utility helpers ---
  function camelToKebab(str) {
    return String(str).replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  function kebabToCamel(str) {
    return String(str).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

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

  function decodeEntities(str) {
    return String(str)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
  }

  // --- StyleMap (class-based, NOT Proxy — V8 snapshot safe) ---
  class StyleMap {
    constructor(element) {
      this._element = element;
      this._styles = new Map();
    }

    setProperty(name, value) {
      if (value == null || value === '') {
        this._styles.delete(kebabToCamel(name));
      } else {
        this._styles.set(kebabToCamel(name), String(value));
      }
      this._syncAttribute();
    }

    getPropertyValue(name) {
      return this._styles.get(kebabToCamel(name)) || '';
    }

    removeProperty(name) {
      const camel = kebabToCamel(name);
      const old = this._styles.get(camel) || '';
      this._styles.delete(camel);
      this._syncAttribute();
      return old;
    }

    get cssText() {
      const parts = [];
      for (const [k, v] of this._styles) {
        if (v != null && v !== '') {
          parts.push(camelToKebab(k) + ': ' + v);
        }
      }
      return parts.join('; ');
    }

    set cssText(val) {
      this._styles.clear();
      if (val) {
        val.split(';').forEach(decl => {
          const colonIdx = decl.indexOf(':');
          if (colonIdx > 0) {
            const prop = decl.slice(0, colonIdx).trim();
            const value = decl.slice(colonIdx + 1).trim();
            if (prop && value) {
              this._styles.set(kebabToCamel(prop), value);
            }
          }
        });
      }
      this._syncAttribute();
    }

    _syncAttribute() {
      const css = this.cssText;
      if (css) {
        this._element.attributes['style'] = css;
      } else {
        delete this._element.attributes['style'];
      }
    }

    get length() { return this._styles.size; }
  }

  // Make StyleMap properties work like el.style.color = 'red' / el.style.color
  // We use a getter/setter pattern on the prototype via defineProperty in the constructor.
  // Actually, we'll use a wrapper approach: the Element.style getter returns
  // a stable StyleMap instance, and we define a Proxy-free property access pattern
  // using the get/set trap on the StyleMap class itself.

  // For camelCase property access (el.style.backgroundColor = 'red'), we wrap
  // StyleMap in a helper that intercepts property access. Since we can't use Proxy,
  // we define common CSS properties as getters/setters on the prototype.
  const CSS_PROPERTIES = [
    'color','backgroundColor','fontSize','fontWeight','fontFamily','fontStyle',
    'margin','marginTop','marginRight','marginBottom','marginLeft',
    'padding','paddingTop','paddingRight','paddingBottom','paddingLeft',
    'border','borderTop','borderRight','borderBottom','borderLeft',
    'borderColor','borderWidth','borderStyle','borderRadius',
    'width','height','minWidth','minHeight','maxWidth','maxHeight',
    'display','position','top','right','bottom','left',
    'overflow','overflowX','overflowY',
    'opacity','visibility','zIndex',
    'textAlign','textDecoration','textTransform','lineHeight','letterSpacing',
    'cursor','pointerEvents','userSelect',
    'transform','transition','animation',
    'flexDirection','flexWrap','flexGrow','flexShrink','flexBasis',
    'justifyContent','alignItems','alignContent','alignSelf',
    'gap','rowGap','columnGap',
    'gridTemplateColumns','gridTemplateRows','gridColumn','gridRow',
    'boxShadow','outline','outlineColor','outlineStyle','outlineWidth',
    'whiteSpace','wordBreak','wordWrap',
    'backgroundImage','backgroundSize','backgroundPosition','backgroundRepeat',
    'listStyle','listStyleType',
    'float','clear','content','boxSizing',
  ];

  for (const prop of CSS_PROPERTIES) {
    Object.defineProperty(StyleMap.prototype, prop, {
      get() { return this._styles.get(prop) || ''; },
      set(val) {
        if (val == null || val === '') {
          this._styles.delete(prop);
        } else {
          this._styles.set(prop, String(val));
        }
        this._syncAttribute();
      },
      enumerable: true,
      configurable: true,
    });
  }

  // --- DatasetMap (class-based, NOT Proxy — V8 snapshot safe) ---
  // We define common data-* properties lazily. Since we can't use Proxy,
  // we intercept get/set using a wrapper approach. However, for maximum
  // compatibility, we'll use Object.defineProperty on each instance when
  // a data-* attribute is set. This is acceptable for test-sized DOMs.
  class DatasetMap {
    constructor(element) {
      this._element = element;
    }
  }

  // We need dynamic property access on DatasetMap. Since we can't use Proxy
  // in snapshots, we'll use a different approach: define get/set methods and
  // also sync defined properties when attributes change.
  // Actually, the simplest correct approach: make DatasetMap a plain object
  // with a reference to the element, and define getters/setters as attributes
  // are added. We'll do this by overriding setAttribute/removeAttribute to
  // sync the dataset. But that's complex.
  //
  // Simplest approach that works for tests: DatasetMap stores its own map
  // and syncs bidirectionally with element attributes.
  DatasetMap.prototype._get = function(prop) {
    const attrName = 'data-' + camelToKebab(String(prop));
    const val = this._element.getAttribute(attrName);
    return val === null ? undefined : val;
  };

  DatasetMap.prototype._set = function(prop, value) {
    const attrName = 'data-' + camelToKebab(String(prop));
    this._element.setAttribute(attrName, String(value));
    // Define the property on this instance for future direct access
    if (!Object.getOwnPropertyDescriptor(this, prop)) {
      Object.defineProperty(this, prop, {
        get() { return this._get(prop); },
        set(v) { this._set(prop, v); },
        enumerable: true,
        configurable: true,
      });
    }
  };

  DatasetMap.prototype._syncFromAttributes = function() {
    // Called when attributes change to ensure dataset properties exist
    for (const name in this._element.attributes) {
      if (name.startsWith('data-')) {
        const camel = kebabToCamel(name.slice(5));
        if (!Object.getOwnPropertyDescriptor(this, camel)) {
          const prop = camel;
          Object.defineProperty(this, prop, {
            get() { return this._get(prop); },
            set(v) { this._set(prop, v); },
            enumerable: true,
            configurable: true,
          });
        }
      }
    }
  };

  // --- ClassList ---
  class ClassList {
    constructor(element) {
      this._element = element;
    }

    _getList() {
      const cls = this._element.attributes['class'];
      return cls ? String(cls).split(/\s+/).filter(Boolean) : [];
    }

    _setList(list) {
      if (list.length > 0) {
        this._element.attributes['class'] = list.join(' ');
      } else {
        delete this._element.attributes['class'];
      }
    }

    add(...classes) {
      const list = this._getList();
      for (const c of classes) {
        if (c && !list.includes(c)) list.push(c);
      }
      this._setList(list);
    }

    remove(...classes) {
      const list = this._getList().filter(c => !classes.includes(c));
      this._setList(list);
    }

    toggle(cls, force) {
      const list = this._getList();
      const has = list.includes(cls);
      if (force !== undefined) {
        if (force && !has) { list.push(cls); this._setList(list); return true; }
        if (!force && has) { this._setList(list.filter(c => c !== cls)); return false; }
        return force;
      }
      if (has) { this._setList(list.filter(c => c !== cls)); return false; }
      list.push(cls);
      this._setList(list);
      return true;
    }

    contains(cls) { return this._getList().includes(cls); }
    item(i) { return this._getList()[i] || null; }
    get length() { return this._getList().length; }

    entries() { return this._getList().entries(); }
    forEach(cb, thisArg) { this._getList().forEach(cb, thisArg); }
    keys() { return this._getList().keys(); }
    values() { return this._getList().values(); }
    toString() { return this._getList().join(' '); }
    [Symbol.iterator]() { return this._getList()[Symbol.iterator](); }
  }

  // --- EventTarget (full spec dispatch: capture → target → bubble) ---
  class EventTarget {
    constructor() {
      this._listeners = {};
    }

    addEventListener(type, listener, options) {
      if (!listener) return;
      const capture = typeof options === 'boolean' ? options : (options?.capture ?? false);
      const once = typeof options === 'object' ? (options?.once ?? false) : false;
      if (!this._listeners[type]) this._listeners[type] = [];
      // Deduplicate: same type + listener + capture = no-op (per spec)
      const exists = this._listeners[type].some(
        e => e.listener === listener && e.capture === capture
      );
      if (exists) return;
      this._listeners[type].push({ listener, capture, once });
    }

    removeEventListener(type, listener, options) {
      if (!this._listeners[type]) return;
      const capture = typeof options === 'boolean' ? options : (options?.capture || false);
      this._listeners[type] = this._listeners[type].filter(
        e => !(e.listener === listener && e.capture === capture)
      );
    }

    dispatchEvent(event) {
      event.target = this;

      // Build propagation path: target → ancestors (root-first order for capture).
      const path = [];
      let node = this.parentNode;
      while (node) {
        path.unshift(node);
        node = node.parentNode;
      }

      // Helper: invoke listeners on a single node for the given phase.
      function invokeListeners(node, event, phase) {
        const entries = node._listeners[event.type];
        if (!entries) return;
        const snapshot = entries.slice(); // Snapshot semantics: additions during dispatch are ignored.
        for (const entry of snapshot) {
          if (event._stopImmediate) break;
          // During capture phase, only call capture listeners.
          // During bubble phase, only call non-capture listeners.
          // During at-target phase, call ALL listeners (regardless of capture flag).
          if (phase === 1 && !entry.capture) continue;
          if (phase === 3 && entry.capture) continue;
          event.currentTarget = node;
          event.eventPhase = phase;
          entry.listener.call(node, event);
          if (entry.once) {
            node.removeEventListener(event.type, entry.listener, { capture: entry.capture });
          }
        }
      }

      // 1. Capture phase — root to parent of target
      event.eventPhase = 1;
      for (const ancestor of path) {
        if (event._stopProp) break;
        invokeListeners(ancestor, event, 1);
      }

      // 2. At-target phase
      if (!event._stopProp) {
        event.eventPhase = 2;
        invokeListeners(this, event, 2);
      }

      // 3. Bubble phase — parent of target to root (only if event bubbles)
      if (event.bubbles && !event._stopProp) {
        event.eventPhase = 3;
        for (let i = path.length - 1; i >= 0; i--) {
          if (event._stopProp) break;
          invokeListeners(path[i], event, 3);
        }
      }

      event.eventPhase = 0;
      event.currentTarget = null;
      return !event.defaultPrevented;
    }
  }

  // --- Node ---
  class Node extends EventTarget {
    constructor(nodeType, nodeName) {
      super();
      this.nodeType = nodeType;
      this.nodeName = nodeName || '';
      this.childNodes = [];
      this.parentNode = null;
    }

    appendChild(child) {
      if (child instanceof DocumentFragment) {
        for (const c of [...child.childNodes]) {
          this._appendSingle(c);
        }
        child.childNodes = [];
        return child;
      }
      return this._appendSingle(child);
    }

    _appendSingle(child) {
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }

    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx < 0) {
        throw new DOMException('Node is not a child of this node', 'NotFoundError');
      }
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
      return child;
    }

    insertBefore(newChild, refChild) {
      if (!refChild) return this.appendChild(newChild);
      if (newChild instanceof DocumentFragment) {
        let insertIdx = this.childNodes.indexOf(refChild);
        for (const c of [...newChild.childNodes]) {
          if (c.parentNode) c.parentNode.removeChild(c);
          c.parentNode = this;
          this.childNodes.splice(insertIdx++, 0, c);
        }
        newChild.childNodes = [];
        return newChild;
      }
      if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
      const idx = this.childNodes.indexOf(refChild);
      if (idx >= 0) {
        newChild.parentNode = this;
        this.childNodes.splice(idx, 0, newChild);
      } else {
        return this.appendChild(newChild);
      }
      return newChild;
    }

    replaceChild(newChild, oldChild) {
      const idx = this.childNodes.indexOf(oldChild);
      if (idx >= 0) {
        if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
        oldChild.parentNode = null;
        newChild.parentNode = this;
        this.childNodes[idx] = newChild;
      }
      return oldChild;
    }

    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }

    replaceWith(...nodes) {
      const parent = this.parentNode;
      if (!parent) return;
      const idx = parent.childNodes.indexOf(this);
      if (idx < 0) return;
      this.parentNode = null;
      parent.childNodes.splice(idx, 1);
      let insertIdx = idx;
      for (const node of nodes) {
        const child = typeof node === 'string' ? new Text(node) : node;
        if (child.parentNode) child.parentNode.removeChild(child);
        child.parentNode = parent;
        parent.childNodes.splice(insertIdx++, 0, child);
      }
    }

    append(...nodes) {
      for (const node of nodes) {
        this.appendChild(typeof node === 'string' ? new Text(node) : node);
      }
    }

    prepend(...nodes) {
      const first = this.firstChild;
      for (const node of nodes) {
        const child = typeof node === 'string' ? new Text(node) : node;
        if (first) this.insertBefore(child, first);
        else this.appendChild(child);
      }
    }

    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }

    get nextSibling() {
      if (!this.parentNode) return null;
      const s = this.parentNode.childNodes;
      return s[s.indexOf(this) + 1] || null;
    }

    get previousSibling() {
      if (!this.parentNode) return null;
      const s = this.parentNode.childNodes;
      const i = s.indexOf(this);
      return i > 0 ? s[i - 1] : null;
    }

    get parentElement() {
      const p = this.parentNode;
      return p && p.nodeType === ELEMENT_NODE ? p : null;
    }

    get ownerDocument() { return _document; }

    get isConnected() {
      let n = this;
      while (n.parentNode) n = n.parentNode;
      return n === _document || n === _document.documentElement;
    }

    contains(node) {
      if (node === this) return true;
      for (const child of this.childNodes) {
        if (child === node || child.contains(node)) return true;
      }
      return false;
    }

    hasChildNodes() { return this.childNodes.length > 0; }

    cloneNode(deep) {
      // Subclasses override this
      const clone = new this.constructor(this.nodeType, this.nodeName);
      if (deep) {
        for (const child of this.childNodes) {
          clone.appendChild(child.cloneNode(true));
        }
      }
      return clone;
    }

    get textContent() {
      return this.childNodes.map(c => {
        if (c.nodeType === TEXT_NODE) return c.data;
        return c.textContent || '';
      }).join('');
    }

    set textContent(val) {
      this.childNodes.forEach(c => { c.parentNode = null; });
      this.childNodes = [];
      if (val != null && val !== '') {
        this.appendChild(new Text(String(val)));
      }
    }

    // Element-only traversal (overridden by Element subclass)
    get children() { return this.childNodes.filter(c => c.nodeType === ELEMENT_NODE); }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
    get childElementCount() { return this.children.length; }
  }

  // Static constants on Node
  Node.ELEMENT_NODE = ELEMENT_NODE;
  Node.TEXT_NODE = TEXT_NODE;
  Node.COMMENT_NODE = COMMENT_NODE;
  Node.DOCUMENT_NODE = DOCUMENT_NODE;
  Node.DOCUMENT_FRAGMENT_NODE = DOCUMENT_FRAGMENT_NODE;

  // --- Text ---
  class Text extends Node {
    constructor(data) {
      super(TEXT_NODE, '#text');
      this.data = data != null ? String(data) : '';
    }

    get nodeValue() { return this.data; }
    set nodeValue(v) { this.data = v != null ? String(v) : ''; }
    get textContent() { return this.data; }
    set textContent(v) { this.data = v != null ? String(v) : ''; }
    get wholeText() { return this.data; }
    get length() { return this.data.length; }

    cloneNode() { return new Text(this.data); }
  }

  // --- Comment ---
  class Comment extends Node {
    constructor(data) {
      super(COMMENT_NODE, '#comment');
      this.data = data != null ? String(data) : '';
    }

    get nodeValue() { return this.data; }
    set nodeValue(v) { this.data = v != null ? String(v) : ''; }
    get textContent() { return this.data; }
    set textContent(v) { this.data = v != null ? String(v) : ''; }

    cloneNode() { return new Comment(this.data); }
  }

  // --- DocumentFragment ---
  class DocumentFragment extends Node {
    constructor() {
      super(DOCUMENT_FRAGMENT_NODE, '#document-fragment');
    }

    get innerHTML() {
      return this.childNodes.map(c => serializeNode(c)).join('');
    }

    set innerHTML(html) {
      this.childNodes.forEach(c => { c.parentNode = null; });
      this.childNodes = [];
      if (html) parseHTMLInto(this, html);
    }

    cloneNode(deep) {
      const frag = new DocumentFragment();
      if (deep) {
        for (const c of this.childNodes) frag.appendChild(c.cloneNode(true));
      }
      return frag;
    }

    // Query methods (delegate to basic selector matching)
    querySelector(sel) { return querySelect(this, sel); }
    querySelectorAll(sel) { const r = []; querySelectAll(this, sel, r); return r; }
    getElementById(id) { return findById(this, id); }
  }

  // --- Element ---
  class Element extends Node {
    constructor(tagName) {
      super(ELEMENT_NODE, tagName ? tagName.toUpperCase() : '');
      this.tagName = this.nodeName;
      this.localName = tagName ? tagName.toLowerCase() : '';
      this.attributes = {};
      this._classList = new ClassList(this);
      this._styleMap = new StyleMap(this);
      this._datasetMap = new DatasetMap(this);
    }

    // --- Attributes ---
    getAttribute(name) {
      return this.attributes[name] !== undefined ? this.attributes[name] : null;
    }

    setAttribute(name, value) {
      this.attributes[name] = String(value);
      // Sync dataset when data-* attributes change
      if (name.startsWith('data-')) {
        this._datasetMap._syncFromAttributes();
      }
    }

    removeAttribute(name) {
      delete this.attributes[name];
    }

    hasAttribute(name) {
      return name in this.attributes;
    }

    toggleAttribute(name, force) {
      if (force !== undefined) {
        if (force) { this.setAttribute(name, ''); return true; }
        this.removeAttribute(name); return false;
      }
      if (this.hasAttribute(name)) { this.removeAttribute(name); return false; }
      this.setAttribute(name, ''); return true;
    }

    // --- ID, className, classList ---
    get id() { return this.attributes.id || ''; }
    set id(val) { if (val) this.attributes.id = val; else delete this.attributes.id; }

    get className() { return this.attributes['class'] || ''; }
    set className(val) {
      if (val) this.attributes['class'] = val;
      else delete this.attributes['class'];
    }

    get classList() { return this._classList; }

    // --- Style ---
    get style() { return this._styleMap; }
    set style(val) {
      if (typeof val === 'string') {
        this._styleMap.cssText = val;
      } else if (val && typeof val === 'object') {
        this._styleMap._styles.clear();
        for (const [k, v] of Object.entries(val)) {
          if (v != null && v !== '') this._styleMap._styles.set(k, String(v));
        }
        this._styleMap._syncAttribute();
      }
    }

    // --- Dataset ---
    get dataset() { return this._datasetMap; }

    // --- Content ---
    get innerHTML() {
      return this.childNodes.map(c => serializeNode(c)).join('');
    }

    set innerHTML(html) {
      this.childNodes.forEach(c => { c.parentNode = null; });
      this.childNodes = [];
      if (html) parseHTMLInto(this, html);
    }

    get outerHTML() { return serializeElement(this); }

    get textContent() {
      return this.childNodes.map(c => {
        if (c.nodeType === TEXT_NODE) return c.data;
        if (c.nodeType === ELEMENT_NODE) return c.textContent;
        return '';
      }).join('');
    }

    set textContent(val) {
      this.childNodes.forEach(c => { c.parentNode = null; });
      this.childNodes = [];
      if (val != null && val !== '') {
        this.appendChild(new Text(String(val)));
      }
    }

    // --- Element-only traversal ---
    get children() { return this.childNodes.filter(c => c.nodeType === ELEMENT_NODE); }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
    get childElementCount() { return this.children.length; }

    get nextElementSibling() {
      if (!this.parentNode) return null;
      const s = this.parentNode.childNodes;
      let found = false;
      for (const c of s) {
        if (found && c.nodeType === ELEMENT_NODE) return c;
        if (c === this) found = true;
      }
      return null;
    }

    get previousElementSibling() {
      if (!this.parentNode) return null;
      const s = this.parentNode.childNodes;
      let prev = null;
      for (const c of s) {
        if (c === this) return prev;
        if (c.nodeType === ELEMENT_NODE) prev = c;
      }
      return null;
    }

    // --- Query (basic for Phase 1, full selector engine in Phase 3) ---
    querySelector(sel) { return querySelect(this, sel); }
    querySelectorAll(sel) { const r = []; querySelectAll(this, sel, r); return r; }
    getElementsByTagName(tag) {
      const results = [];
      const upper = tag.toUpperCase();
      function walk(node) {
        for (const c of node.childNodes) {
          if (c.nodeType === ELEMENT_NODE && (upper === '*' || c.tagName === upper)) results.push(c);
          if (c.childNodes) walk(c);
        }
      }
      walk(this);
      return results;
    }
    getElementsByClassName(cls) {
      const results = [];
      function walk(node) {
        for (const c of node.childNodes) {
          if (c.nodeType === ELEMENT_NODE && c._classList && c._classList.contains(cls)) results.push(c);
          if (c.childNodes) walk(c);
        }
      }
      walk(this);
      return results;
    }

    matches(sel) { return matchesSimpleSelector(this, sel); }
    closest(sel) {
      let el = this;
      while (el) {
        if (el.nodeType === ELEMENT_NODE && matchesSimpleSelector(el, sel)) return el;
        el = el.parentNode;
      }
      return null;
    }

    // --- Interaction stubs ---
    click() {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
      this.dispatchEvent(ev);
    }
    focus() {
      if (_document) _document.activeElement = this;
    }
    blur() {
      if (_document && _document.activeElement === this) {
        _document.activeElement = _document.body;
      }
    }
    scrollIntoView() {}

    // --- Layout stubs ---
    getBoundingClientRect() {
      return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0, x: 0, y: 0 };
    }
    getAnimations() { return []; }

    get offsetWidth() { return 0; }
    get offsetHeight() { return 0; }
    get offsetTop() { return 0; }
    get offsetLeft() { return 0; }
    get clientWidth() { return 0; }
    get clientHeight() { return 0; }
    get scrollTop() { return 0; }
    set scrollTop(_) {}
    get scrollLeft() { return 0; }
    set scrollLeft(_) {}
    get scrollWidth() { return 0; }
    get scrollHeight() { return 0; }

    // --- Clone ---
    cloneNode(deep) {
      const clone = _createElement(this.localName);
      // Copy attributes
      for (const [k, v] of Object.entries(this.attributes)) {
        clone.attributes[k] = v;
      }
      // Copy style
      for (const [k, v] of this._styleMap._styles) {
        clone._styleMap._styles.set(k, v);
      }
      if (deep) {
        for (const child of this.childNodes) {
          clone.appendChild(child.cloneNode(true));
        }
      }
      return clone;
    }
  }

  // --- HTMLElement ---
  class HTMLElement extends Element {
    constructor(tagName) { super(tagName); }

    get hidden() { return this.hasAttribute('hidden'); }
    set hidden(val) { val ? this.setAttribute('hidden', '') : this.removeAttribute('hidden'); }

    get tabIndex() { return parseInt(this.getAttribute('tabindex') || '-1', 10); }
    set tabIndex(val) { this.setAttribute('tabindex', String(val)); }

    get title() { return this.getAttribute('title') || ''; }
    set title(val) { this.setAttribute('title', val); }

    get lang() { return this.getAttribute('lang') || ''; }
    set lang(val) { this.setAttribute('lang', val); }

    get dir() { return this.getAttribute('dir') || ''; }
    set dir(val) { this.setAttribute('dir', val); }

    get contentEditable() { return this.getAttribute('contenteditable') || 'inherit'; }
    set contentEditable(val) { this.setAttribute('contenteditable', val); }
  }

  // --- Specific HTML Element types ---
  class HTMLInputElement extends HTMLElement {
    constructor(tag) {
      super(tag || 'input');
      this._value = '';
      this._checked = false;
    }
    get value() { return this._value; }
    set value(v) { this._value = String(v); }
    get checked() { return this._checked; }
    set checked(v) { this._checked = !!v; }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }
    get type() { return this.getAttribute('type') || 'text'; }
    set type(v) { this.setAttribute('type', v); }
    get name() { return this.getAttribute('name') || ''; }
    set name(v) { this.setAttribute('name', v); }
    get placeholder() { return this.getAttribute('placeholder') || ''; }
    set placeholder(v) { this.setAttribute('placeholder', v); }
    get readOnly() { return this.hasAttribute('readonly'); }
    set readOnly(v) { v ? this.setAttribute('readonly', '') : this.removeAttribute('readonly'); }
    select() {}
    setSelectionRange() {}
  }

  class HTMLTextAreaElement extends HTMLElement {
    constructor(tag) {
      super(tag || 'textarea');
      this._value = '';
    }
    get value() { return this._value; }
    set value(v) { this._value = String(v); }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }
    get name() { return this.getAttribute('name') || ''; }
    set name(v) { this.setAttribute('name', v); }
    get placeholder() { return this.getAttribute('placeholder') || ''; }
    set placeholder(v) { this.setAttribute('placeholder', v); }
    get rows() { return parseInt(this.getAttribute('rows') || '2', 10); }
    set rows(v) { this.setAttribute('rows', String(v)); }
    get cols() { return parseInt(this.getAttribute('cols') || '20', 10); }
    set cols(v) { this.setAttribute('cols', String(v)); }
  }

  class HTMLSelectElement extends HTMLElement {
    constructor(tag) {
      super(tag || 'select');
      this._value = '';
      this._selectedIndex = -1;
    }
    get value() { return this._value; }
    set value(v) { this._value = String(v); }
    get selectedIndex() { return this._selectedIndex; }
    set selectedIndex(v) { this._selectedIndex = v; }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }
    get name() { return this.getAttribute('name') || ''; }
    set name(v) { this.setAttribute('name', v); }
    get options() { return this.querySelectorAll('option'); }
  }

  class HTMLOptionElement extends HTMLElement {
    constructor(tag) { super(tag || 'option'); this._selected = false; }
    get value() { return this.getAttribute('value') || this.textContent; }
    set value(v) { this.setAttribute('value', v); }
    get selected() { return this._selected; }
    set selected(v) { this._selected = !!v; }
    get text() { return this.textContent; }
    set text(v) { this.textContent = v; }
    get label() { return this.getAttribute('label') || this.textContent; }
    set label(v) { this.setAttribute('label', v); }
  }

  class HTMLButtonElement extends HTMLElement {
    constructor(tag) { super(tag || 'button'); }
    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(v) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }
    get type() { return this.getAttribute('type') || 'submit'; }
    set type(v) { this.setAttribute('type', v); }
    get name() { return this.getAttribute('name') || ''; }
    set name(v) { this.setAttribute('name', v); }
    get value() { return this.getAttribute('value') || ''; }
    set value(v) { this.setAttribute('value', v); }
  }

  class HTMLFormElement extends HTMLElement {
    constructor(tag) { super(tag || 'form'); }
    get elements() { return this.querySelectorAll('input,select,textarea,button'); }
    submit() {}
    reset() {}
    get action() { return this.getAttribute('action') || ''; }
    set action(v) { this.setAttribute('action', v); }
    get method() { return this.getAttribute('method') || 'get'; }
    set method(v) { this.setAttribute('method', v); }
  }

  class HTMLAnchorElement extends HTMLElement {
    constructor(tag) { super(tag || 'a'); }
    get href() { return this.getAttribute('href') || ''; }
    set href(v) { this.setAttribute('href', v); }
    get target() { return this.getAttribute('target') || ''; }
    set target(v) { this.setAttribute('target', v); }
    get rel() { return this.getAttribute('rel') || ''; }
    set rel(v) { this.setAttribute('rel', v); }
  }

  class HTMLImageElement extends HTMLElement {
    constructor(tag) { super(tag || 'img'); }
    get src() { return this.getAttribute('src') || ''; }
    set src(v) { this.setAttribute('src', v); }
    get alt() { return this.getAttribute('alt') || ''; }
    set alt(v) { this.setAttribute('alt', v); }
    get width() { return parseInt(this.getAttribute('width') || '0', 10); }
    set width(v) { this.setAttribute('width', String(v)); }
    get height() { return parseInt(this.getAttribute('height') || '0', 10); }
    set height(v) { this.setAttribute('height', String(v)); }
    get naturalWidth() { return 0; }
    get naturalHeight() { return 0; }
  }

  class HTMLDialogElement extends HTMLElement {
    constructor(tag) { super(tag || 'dialog'); this._open = false; this.returnValue = ''; }
    get open() { return this._open; }
    set open(v) { this._open = !!v; }
    showModal() { this._open = true; this.setAttribute('open', ''); }
    close(returnValue) {
      this._open = false;
      this.removeAttribute('open');
      if (returnValue !== undefined) this.returnValue = String(returnValue);
      this.dispatchEvent(new Event('close'));
    }
    show() { this.showModal(); }
  }

  class HTMLLabelElement extends HTMLElement {
    constructor(tag) { super(tag || 'label'); }
    get htmlFor() { return this.getAttribute('for') || ''; }
    set htmlFor(v) { this.setAttribute('for', v); }
  }

  class HTMLTemplateElement extends HTMLElement {
    constructor(tag) { super(tag || 'template'); this._content = new DocumentFragment(); }
    get content() { return this._content; }
  }

  class HTMLDivElement extends HTMLElement { constructor(tag) { super(tag || 'div'); } }
  class HTMLSpanElement extends HTMLElement { constructor(tag) { super(tag || 'span'); } }
  class HTMLStyleElement extends HTMLElement { constructor(tag) { super(tag || 'style'); } }
  class HTMLHeadElement extends HTMLElement { constructor(tag) { super(tag || 'head'); } }
  class HTMLBodyElement extends HTMLElement { constructor(tag) { super(tag || 'body'); } }
  class HTMLHtmlElement extends HTMLElement { constructor(tag) { super(tag || 'html'); } }

  // --- TAG_MAP dispatch table ---
  const TAG_MAP = {
    input: HTMLInputElement,
    textarea: HTMLTextAreaElement,
    select: HTMLSelectElement,
    option: HTMLOptionElement,
    button: HTMLButtonElement,
    form: HTMLFormElement,
    a: HTMLAnchorElement,
    img: HTMLImageElement,
    dialog: HTMLDialogElement,
    label: HTMLLabelElement,
    template: HTMLTemplateElement,
    div: HTMLDivElement,
    span: HTMLSpanElement,
    style: HTMLStyleElement,
    head: HTMLHeadElement,
    body: HTMLBodyElement,
    html: HTMLHtmlElement,
  };

  function _createElement(tagName) {
    const lower = tagName.toLowerCase();
    const Cls = TAG_MAP[lower] || HTMLElement;
    return new Cls(lower);
  }

  // --- DOMException ---
  class DOMException extends Error {
    constructor(message, name) {
      super(message);
      this.name = name || 'Error';
      this.code = 0;
    }
  }

  // --- Event classes ---
  class Event {
    constructor(type, options) {
      this.type = type;
      this.bubbles = options?.bubbles ?? false;
      this.cancelable = options?.cancelable ?? false;
      this.composed = options?.composed ?? false;
      this.defaultPrevented = false;
      this.target = null;
      this.currentTarget = null;
      this.eventPhase = 0;
      this.timeStamp = Date.now();
      this.isTrusted = false;
      this._stopProp = false;
      this._stopImmediate = false;
    }
    preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    stopPropagation() { this._stopProp = true; }
    stopImmediatePropagation() { this._stopProp = true; this._stopImmediate = true; }
  }
  Event.NONE = 0;
  Event.CAPTURING_PHASE = 1;
  Event.AT_TARGET = 2;
  Event.BUBBLING_PHASE = 3;

  class CustomEvent extends Event {
    constructor(type, options) {
      super(type, options);
      this.detail = options?.detail !== undefined ? options.detail : null;
    }
  }

  class MouseEvent extends Event {
    constructor(type, options) {
      super(type, options);
      this.button = options?.button ?? 0;
      this.buttons = options?.buttons ?? 0;
      this.clientX = options?.clientX ?? 0;
      this.clientY = options?.clientY ?? 0;
      this.screenX = options?.screenX ?? 0;
      this.screenY = options?.screenY ?? 0;
      this.altKey = options?.altKey ?? false;
      this.ctrlKey = options?.ctrlKey ?? false;
      this.metaKey = options?.metaKey ?? false;
      this.shiftKey = options?.shiftKey ?? false;
      this.relatedTarget = options?.relatedTarget ?? null;
    }
  }

  class KeyboardEvent extends Event {
    constructor(type, options) {
      super(type, options);
      this.key = options?.key ?? '';
      this.code = options?.code ?? '';
      this.location = options?.location ?? 0;
      this.altKey = options?.altKey ?? false;
      this.ctrlKey = options?.ctrlKey ?? false;
      this.metaKey = options?.metaKey ?? false;
      this.shiftKey = options?.shiftKey ?? false;
      this.repeat = options?.repeat ?? false;
      this.isComposing = options?.isComposing ?? false;
    }
  }

  class FocusEvent extends Event {
    constructor(type, options) {
      super(type, options);
      this.relatedTarget = options?.relatedTarget ?? null;
    }
  }

  class InputEvent extends Event {
    constructor(type, options) {
      super(type, options);
      this.data = options?.data ?? null;
      this.inputType = options?.inputType ?? '';
      this.isComposing = options?.isComposing ?? false;
    }
  }

  // --- Serialization ---
  function serializeStyle(styleMap) {
    return styleMap.cssText;
  }

  function serializeAttributes(el) {
    let result = '';
    for (const [name, value] of Object.entries(el.attributes)) {
      if (name === 'style') continue; // handled separately
      if (name.startsWith('on') && name.length > 2) continue;
      if (value === 'true' || value === true) {
        result += ' ' + name;
      } else if (value === 'false' || value === false || value == null) {
        continue;
      } else {
        result += ' ' + name + '="' + escapeAttrValue(value) + '"';
      }
    }
    const styleStr = serializeStyle(el._styleMap);
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
    if (node.nodeType === ELEMENT_NODE) return serializeElement(node);
    if (node.nodeType === TEXT_NODE) return escapeHtml(node.data);
    if (node.nodeType === COMMENT_NODE) return '<!--' + node.data + '-->';
    if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
      return node.childNodes.map(c => serializeNode(c)).join('');
    }
    return '';
  }

  // --- Basic selector matching (Phase 1: supports tag, .class, #id, [attr], [attr="val"]) ---
  // Phase 3 will replace this with a full selector engine.
  function matchesSimpleSelector(el, selector) {
    if (!selector || el.nodeType !== ELEMENT_NODE) return false;
    // Handle comma-separated selectors (respecting parentheses)
    const groups = splitSelectorByComma(selector);
    if (groups.length > 1) {
      return groups.some(s => matchesSimpleSelector(el, s.trim()));
    }

    // Tokenize selector into compound selectors and combinators
    const tokens = tokenizeCombinators(selector.trim());
    if (tokens.length === 1) return matchesSingle(el, tokens[0]);

    // Walk tokens from right to left: last token must match el,
    // then walk combinators backwards
    let idx = tokens.length - 1;
    if (!matchesSingle(el, tokens[idx])) return false;
    idx--;
    let current = el;

    while (idx >= 0) {
      const combinator = tokens[idx];
      idx--;
      if (idx < 0) return false;
      const compound = tokens[idx];
      idx--;

      if (combinator === ' ') {
        // Descendant: any ancestor
        let ancestor = current.parentNode;
        let found = false;
        while (ancestor && ancestor.nodeType === ELEMENT_NODE) {
          if (matchesSingle(ancestor, compound)) { found = true; current = ancestor; break; }
          ancestor = ancestor.parentNode;
        }
        if (!found) return false;
      } else if (combinator === '>') {
        // Child: immediate parent
        const parent = current.parentNode;
        if (!parent || parent.nodeType !== ELEMENT_NODE || !matchesSingle(parent, compound)) return false;
        current = parent;
      } else if (combinator === '+') {
        // Adjacent sibling: immediately preceding element sibling
        const prev = current.previousElementSibling;
        if (!prev || !matchesSingle(prev, compound)) return false;
        current = prev;
      } else if (combinator === '~') {
        // General sibling: any preceding element sibling
        let sib = current.previousElementSibling;
        let found = false;
        while (sib) {
          if (matchesSingle(sib, compound)) { found = true; current = sib; break; }
          sib = sib.previousElementSibling;
        }
        if (!found) return false;
      } else {
        return false;
      }
    }
    return true;
  }

  // Split selector by commas, respecting parentheses (for :not(), :has(), etc.)
  function splitSelectorByComma(sel) {
    const groups = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < sel.length; i++) {
      if (sel[i] === '(') depth++;
      else if (sel[i] === ')') depth--;
      else if (sel[i] === ',' && depth === 0) {
        groups.push(sel.slice(start, i));
        start = i + 1;
      }
    }
    groups.push(sel.slice(start));
    return groups;
  }

  // Tokenize a single selector group into [compound, combinator, compound, ...]
  // Combinators: ' ', '>', '+', '~'
  function tokenizeCombinators(sel) {
    const tokens = [];
    let i = 0;
    const len = sel.length;

    while (i < len) {
      // Skip whitespace
      while (i < len && sel[i] === ' ') i++;
      if (i >= len) break;

      // Check for combinator
      if (tokens.length > 0 && (sel[i] === '>' || sel[i] === '+' || sel[i] === '~')) {
        tokens.push(sel[i]);
        i++;
        continue;
      }

      // If we already have a compound and next is also a compound, insert descendant combinator
      if (tokens.length > 0 && tokens[tokens.length - 1] !== ' ' &&
          tokens[tokens.length - 1] !== '>' && tokens[tokens.length - 1] !== '+' &&
          tokens[tokens.length - 1] !== '~') {
        tokens.push(' ');
      }

      // Parse compound selector
      let start = i;
      while (i < len) {
        if (sel[i] === ' ' || sel[i] === '>' || sel[i] === '+' || sel[i] === '~') break;
        if (sel[i] === '(') {
          // Skip parenthesized content
          let depth = 1;
          i++;
          while (i < len && depth > 0) {
            if (sel[i] === '(') depth++;
            else if (sel[i] === ')') depth--;
            i++;
          }
        } else if (sel[i] === '[') {
          // Skip bracketed content
          i++;
          while (i < len && sel[i] !== ']') i++;
          if (i < len) i++;
        } else {
          i++;
        }
      }
      if (i > start) tokens.push(sel.slice(start, i));
    }
    return tokens;
  }

  function matchesSingle(el, sel) {
    if (!sel) return false;
    // Compound selector: split by conditions but keep together
    // e.g., "div.active[disabled]" → tag=div, class=active, attr=disabled
    // Simple approach: parse sequentially
    let i = 0;
    const len = sel.length;
    let tagMatch = true;
    let pos = 0;

    // Check if starts with tag name
    if (sel[0] !== '.' && sel[0] !== '#' && sel[0] !== '[' && sel[0] !== ':' && sel[0] !== '*') {
      // Tag name
      let end = 0;
      while (end < len && sel[end] !== '.' && sel[end] !== '#' && sel[end] !== '[' && sel[end] !== ':') end++;
      const tag = sel.slice(0, end);
      if (tag !== '*' && el.localName !== tag.toLowerCase()) return false;
      pos = end;
    } else if (sel[0] === '*') {
      pos = 1;
    }

    while (pos < len) {
      if (sel[pos] === '.') {
        // Class selector
        let end = pos + 1;
        while (end < len && sel[end] !== '.' && sel[end] !== '#' && sel[end] !== '[' && sel[end] !== ':') end++;
        const cls = sel.slice(pos + 1, end);
        if (!el._classList.contains(cls)) return false;
        pos = end;
      } else if (sel[pos] === '#') {
        // ID selector
        let end = pos + 1;
        while (end < len && sel[end] !== '.' && sel[end] !== '#' && sel[end] !== '[' && sel[end] !== ':') end++;
        const id = sel.slice(pos + 1, end);
        if ((el.attributes.id || '') !== id) return false;
        pos = end;
      } else if (sel[pos] === '[') {
        // Attribute selector
        const close = sel.indexOf(']', pos);
        if (close < 0) return false;
        const inside = sel.slice(pos + 1, close);
        if (!matchAttr(el, inside)) return false;
        pos = close + 1;
      } else if (sel[pos] === ':') {
        // Pseudo-class
        let end = pos + 1;
        if (sel[end] === ':') return false; // pseudo-element — not supported
        // Handle :not(...)
        if (sel.slice(pos, pos + 5) === ':not(') {
          const closeP = findCloseParen(sel, pos + 4);
          if (closeP < 0) return false;
          const inner = sel.slice(pos + 5, closeP);
          if (matchesSingle(el, inner)) return false;
          pos = closeP + 1;
        } else if (sel.slice(pos, pos + 5) === ':has(') {
          const closeP = findCloseParen(sel, pos + 4);
          if (closeP < 0) return false;
          const inner = sel.slice(pos + 5, closeP);
          // :has() matches if any descendant matches the inner selector
          const found = querySelect(el, inner);
          if (!found) return false;
          pos = closeP + 1;
        } else if (sel.slice(pos, pos + 11) === ':nth-child(') {
          const closeP = findCloseParen(sel, pos + 10);
          if (closeP < 0) return false;
          const expr = sel.slice(pos + 11, closeP).trim();
          if (!el.parentNode) return false;
          const siblings = el.parentNode.children;
          const idx = siblings.indexOf(el) + 1; // 1-based
          if (!matchNthExpr(expr, idx)) return false;
          pos = closeP + 1;
        } else if (sel.slice(pos, pos + 16) === ':nth-last-child(') {
          const closeP = findCloseParen(sel, pos + 15);
          if (closeP < 0) return false;
          const expr = sel.slice(pos + 16, closeP).trim();
          if (!el.parentNode) return false;
          const siblings = el.parentNode.children;
          const idx = siblings.length - siblings.indexOf(el); // 1-based from end
          if (!matchNthExpr(expr, idx)) return false;
          pos = closeP + 1;
        } else if (sel.slice(pos, pos + 12) === ':first-child') {
          if (!el.parentNode) return false;
          const siblings = el.parentNode.children;
          if (siblings[0] !== el) return false;
          pos += 12;
        } else if (sel.slice(pos, pos + 11) === ':last-child') {
          if (!el.parentNode) return false;
          const siblings = el.parentNode.children;
          if (siblings[siblings.length - 1] !== el) return false;
          pos += 11;
        } else if (sel.slice(pos, pos + 11) === ':only-child') {
          if (!el.parentNode) return false;
          const siblings = el.parentNode.children;
          if (siblings.length !== 1) return false;
          pos += 11;
        } else if (sel.slice(pos, pos + 6) === ':empty') {
          if (el.childNodes.length > 0) return false;
          pos += 6;
        } else if (sel.slice(pos, pos + 8) === ':checked') {
          if (!el.checked) return false;
          pos += 8;
        } else if (sel.slice(pos, pos + 9) === ':disabled') {
          if (!el.disabled) return false;
          pos += 9;
        } else if (sel.slice(pos, pos + 8) === ':enabled') {
          if (el.disabled) return false;
          pos += 8;
        } else if (sel.slice(pos, pos + 6) === ':focus') {
          if (!_document || _document.activeElement !== el) return false;
          pos += 6;
        } else {
          return false; // Unsupported pseudo-class
        }
      } else {
        pos++;
      }
    }
    return true;
  }

  // Find the matching closing parenthesis from an open paren at `openPos`
  function findCloseParen(sel, openPos) {
    let depth = 1;
    for (let i = openPos + 1; i < sel.length; i++) {
      if (sel[i] === '(') depth++;
      else if (sel[i] === ')') { depth--; if (depth === 0) return i; }
    }
    return -1;
  }

  // Match an nth-child expression (e.g., "2", "odd", "even", "2n+1", "3n", "-n+3")
  function matchNthExpr(expr, idx) {
    if (expr === 'odd') return idx % 2 === 1;
    if (expr === 'even') return idx % 2 === 0;
    // Parse An+B
    const m = expr.match(/^([+-]?\d*)?n([+-]\d+)?$|^([+-]?\d+)$/);
    if (!m) return false;
    if (m[3] !== undefined) return idx === parseInt(m[3], 10);
    let a = m[1] === undefined || m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : parseInt(m[1], 10);
    let b = m[2] ? parseInt(m[2], 10) : 0;
    if (a === 0) return idx === b;
    return (idx - b) % a === 0 && (idx - b) / a >= 0;
  }

  function matchAttr(el, attrSel) {
    // Supports: name, name="val", name^="val", name$="val", name*="val", name~="val"
    const m = attrSel.match(/^([^\^$*~|=]+)(?:([~^$*|]?)=["']?([^"']*)["']?)?$/);
    if (!m) return false;
    const [, name, op, val] = m;
    const actual = el.getAttribute(name.trim());
    if (op === undefined && val === undefined) return actual !== null;
    if (actual === null) return false;
    if (!op || op === '') return actual === val;
    if (op === '^') return actual.startsWith(val);
    if (op === '$') return actual.endsWith(val);
    if (op === '*') return actual.includes(val);
    if (op === '~') return actual.split(/\s+/).includes(val);
    if (op === '|') return actual === val || actual.startsWith(val + '-');
    return false;
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

  function findById(root, id) {
    for (const child of root.childNodes) {
      if (child.nodeType === ELEMENT_NODE && child.attributes.id === id) return child;
      if (child.childNodes) {
        const found = findById(child, id);
        if (found) return found;
      }
    }
    return null;
  }

  // --- innerHTML stack-based parser ---
  function parseHTMLInto(parent, html) {
    const len = html.length;
    let i = 0;

    while (i < len) {
      if (html[i] === '<') {
        // Comment
        if (html.slice(i, i + 4) === '<!--') {
          const end = html.indexOf('-->', i + 4);
          if (end >= 0) {
            parent.appendChild(new Comment(html.slice(i + 4, end)));
            i = end + 3;
            continue;
          }
        }

        // Closing tag
        if (html[i + 1] === '/') {
          const end = html.indexOf('>', i + 2);
          if (end >= 0) i = end + 1;
          return; // Return to parent context
        }

        // Opening tag
        const tagEnd = findTagEnd(html, i + 1);
        if (tagEnd < 0) { i++; continue; }

        const tagContent = html.slice(i + 1, tagEnd);
        const selfClose = tagContent.endsWith('/') || html[tagEnd - 1] === '/';
        const cleanContent = selfClose ? tagContent.replace(/\/$/, '').trim() : tagContent;

        // Parse tag name and attributes
        const spaceIdx = cleanContent.search(/[\s/]/);
        const tagName = spaceIdx < 0 ? cleanContent : cleanContent.slice(0, spaceIdx);
        const attrStr = spaceIdx < 0 ? '' : cleanContent.slice(spaceIdx);

        if (!tagName) { i = tagEnd + 1; continue; }

        const el = _createElement(tagName);
        parseAttributes(el, attrStr);
        parent.appendChild(el);

        i = tagEnd + 1;

        // Self-closing or void element — no children
        if (selfClose || VOID_ELEMENTS.has(el.tagName)) {
          continue;
        }

        // Raw text elements (script, style)
        if (RAW_TEXT_ELEMENTS.has(el.tagName)) {
          const closeTag = '</' + tagName.toLowerCase() + '>';
          const closeIdx = html.toLowerCase().indexOf(closeTag, i);
          if (closeIdx >= 0) {
            const rawText = html.slice(i, closeIdx);
            if (rawText) el.appendChild(new Text(rawText));
            i = closeIdx + closeTag.length;
          }
          continue;
        }

        // Parse children recursively
        i = parseChildren(el, html, i);
      } else {
        // Text content
        const nextTag = html.indexOf('<', i);
        const textEnd = nextTag < 0 ? len : nextTag;
        const text = html.slice(i, textEnd);
        if (text) {
          parent.appendChild(new Text(decodeEntities(text)));
        }
        i = textEnd;
      }
    }
  }

  function parseChildren(parent, html, start) {
    const len = html.length;
    let i = start;

    while (i < len) {
      if (html[i] === '<') {
        // Comment
        if (html.slice(i, i + 4) === '<!--') {
          const end = html.indexOf('-->', i + 4);
          if (end >= 0) {
            parent.appendChild(new Comment(html.slice(i + 4, end)));
            i = end + 3;
            continue;
          }
        }

        // Closing tag — check if it matches this element
        if (html[i + 1] === '/') {
          const end = html.indexOf('>', i + 2);
          if (end >= 0) {
            return end + 1; // Return position after closing tag
          }
          return i;
        }

        // Opening tag — child element
        const tagEnd = findTagEnd(html, i + 1);
        if (tagEnd < 0) { i++; continue; }

        const tagContent = html.slice(i + 1, tagEnd);
        const selfClose = tagContent.endsWith('/') || html[tagEnd - 1] === '/';
        const cleanContent = selfClose ? tagContent.replace(/\/$/, '').trim() : tagContent;

        const spaceIdx = cleanContent.search(/[\s/]/);
        const tagName = spaceIdx < 0 ? cleanContent : cleanContent.slice(0, spaceIdx);
        const attrStr = spaceIdx < 0 ? '' : cleanContent.slice(spaceIdx);

        if (!tagName) { i = tagEnd + 1; continue; }

        const el = _createElement(tagName);
        parseAttributes(el, attrStr);
        parent.appendChild(el);

        i = tagEnd + 1;

        if (selfClose || VOID_ELEMENTS.has(el.tagName)) {
          continue;
        }

        if (RAW_TEXT_ELEMENTS.has(el.tagName)) {
          const closeTag = '</' + tagName.toLowerCase() + '>';
          const closeIdx = html.toLowerCase().indexOf(closeTag, i);
          if (closeIdx >= 0) {
            const rawText = html.slice(i, closeIdx);
            if (rawText) el.appendChild(new Text(rawText));
            i = closeIdx + closeTag.length;
          }
          continue;
        }

        i = parseChildren(el, html, i);
      } else {
        // Text content
        const nextTag = html.indexOf('<', i);
        const textEnd = nextTag < 0 ? len : nextTag;
        const text = html.slice(i, textEnd);
        if (text) {
          parent.appendChild(new Text(decodeEntities(text)));
        }
        i = textEnd;
      }
    }
    return i;
  }

  function findTagEnd(html, start) {
    // Find the closing > of a tag, respecting quotes
    let inSingle = false, inDouble = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (ch === '"' && !inSingle) inDouble = !inDouble;
      else if (ch === "'" && !inDouble) inSingle = !inSingle;
      else if (ch === '>' && !inSingle && !inDouble) return i;
    }
    return -1;
  }

  function parseAttributes(el, attrStr) {
    if (!attrStr) return;
    const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
    let m;
    while ((m = re.exec(attrStr)) !== null) {
      const name = m[1];
      const value = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
      el.setAttribute(name, decodeEntities(value));
    }
  }

  // --- FormData ---
  class FormData {
    constructor(formElement) {
      this._data = [];
      if (formElement && formElement.nodeType === ELEMENT_NODE) {
        const controls = formElement.querySelectorAll('input,select,textarea');
        for (const ctrl of controls) {
          const name = ctrl.getAttribute('name') || ctrl.name;
          if (!name) continue;
          if (ctrl.tagName === 'INPUT') {
            const type = (ctrl.type || 'text').toLowerCase();
            if (type === 'checkbox' || type === 'radio') {
              if (ctrl.checked) this._data.push([name, ctrl.value || 'on']);
            } else {
              this._data.push([name, ctrl.value || '']);
            }
          } else {
            this._data.push([name, ctrl.value || '']);
          }
        }
      }
    }

    get(name) {
      const entry = this._data.find(([k]) => k === name);
      return entry ? entry[1] : null;
    }

    getAll(name) {
      return this._data.filter(([k]) => k === name).map(([, v]) => v);
    }

    set(name, value) {
      const idx = this._data.findIndex(([k]) => k === name);
      if (idx >= 0) this._data[idx] = [name, String(value)];
      else this._data.push([name, String(value)]);
    }

    append(name, value) {
      this._data.push([name, String(value)]);
    }

    has(name) {
      return this._data.some(([k]) => k === name);
    }

    delete(name) {
      this._data = this._data.filter(([k]) => k !== name);
    }

    entries() { return this._data[Symbol.iterator](); }
    keys() { return this._data.map(([k]) => k)[Symbol.iterator](); }
    values() { return this._data.map(([, v]) => v)[Symbol.iterator](); }
    forEach(cb, thisArg) { this._data.forEach(([k, v]) => cb.call(thisArg, v, k, this)); }
    [Symbol.iterator]() { return this.entries(); }
  }

  // --- Observer stubs ---
  class MutationObserver { constructor() {} observe() {} disconnect() {} takeRecords() { return []; } }
  class ResizeObserver { constructor() {} observe() {} unobserve() {} disconnect() {} }
  class IntersectionObserver { constructor() {} observe() {} unobserve() {} disconnect() {} }

  // --- CSSStyleSheet stub ---
  class CSSStyleSheet { constructor() { this.cssRules = []; } insertRule() {} deleteRule() {} }

  // --- Document ---
  let _document;

  class Document extends EventTarget {
    constructor() {
      super();
      this.nodeType = DOCUMENT_NODE;
      this.nodeName = '#document';
      this.documentElement = new HTMLHtmlElement('html');
      this.head = new HTMLHeadElement('head');
      this.body = new HTMLBodyElement('body');
      this.documentElement.childNodes = [this.head, this.body];
      this.head.parentNode = this.documentElement;
      this.body.parentNode = this.documentElement;
      this.documentElement.parentNode = this;
      this.activeElement = this.body;
      this.cookie = '';
      this.adoptedStyleSheets = [];
      this.childNodes = [this.documentElement];
    }

    createElement(tagName) { return _createElement(tagName); }
    createTextNode(text) { return new Text(text); }
    createComment(data) { return new Comment(data || ''); }
    createDocumentFragment() { return new DocumentFragment(); }
    createElementNS(_ns, tagName) { return _createElement(tagName); }

    createEvent(type) {
      if (type === 'MouseEvent' || type === 'MouseEvents') return new MouseEvent('');
      if (type === 'KeyboardEvent') return new KeyboardEvent('');
      if (type === 'CustomEvent') return new CustomEvent('');
      return new Event('');
    }

    getElementById(id) {
      return findById(this.documentElement, id);
    }

    querySelector(sel) {
      return querySelect(this.documentElement, sel);
    }

    querySelectorAll(sel) {
      const results = [];
      querySelectAll(this.documentElement, sel, results);
      return results;
    }

    getElementsByTagName(tag) {
      return this.documentElement.getElementsByTagName(tag);
    }

    getElementsByClassName(cls) {
      return this.documentElement.getElementsByClassName(cls);
    }

    // TreeWalker stub — full impl in Phase 3
    createTreeWalker(root, whatToShow, filter) {
      return new TreeWalker(root, whatToShow, filter);
    }

    get ownerDocument() { return null; }
    contains(node) {
      return this.documentElement.contains(node);
    }
  }

  // --- TreeWalker (basic impl) ---
  const NodeFilter = {
    SHOW_ALL: 0xFFFFFFFF,
    SHOW_ELEMENT: 0x1,
    SHOW_TEXT: 0x4,
    SHOW_COMMENT: 0x80,
    FILTER_ACCEPT: 1,
    FILTER_REJECT: 2,
    FILTER_SKIP: 3,
  };

  class TreeWalker {
    constructor(root, whatToShow, filter) {
      this.root = root;
      this.whatToShow = whatToShow || NodeFilter.SHOW_ALL;
      this.filter = filter || null;
      this.currentNode = root;
    }

    _acceptNode(node) {
      // Check whatToShow
      const typeBit = (1 << (node.nodeType - 1));
      if (!(this.whatToShow & typeBit)) return NodeFilter.FILTER_SKIP;
      // Check filter
      if (this.filter) {
        if (typeof this.filter === 'function') return this.filter(node);
        if (typeof this.filter.acceptNode === 'function') return this.filter.acceptNode(node);
      }
      return NodeFilter.FILTER_ACCEPT;
    }

    nextNode() {
      let node = this.currentNode;
      // First try children
      if (node.childNodes && node.childNodes.length > 0) {
        node = node.childNodes[0];
        while (node) {
          const result = this._acceptNode(node);
          if (result === NodeFilter.FILTER_ACCEPT) {
            this.currentNode = node;
            return node;
          }
          // If rejected, skip children; if skipped, try children
          if (result === NodeFilter.FILTER_SKIP && node.childNodes && node.childNodes.length > 0) {
            node = node.childNodes[0];
            continue;
          }
          // Try next sibling
          node = this._nextSkipping(node);
        }
        return null;
      }
      // No children — try sibling/uncle
      node = this._nextSkipping(node);
      while (node) {
        const result = this._acceptNode(node);
        if (result === NodeFilter.FILTER_ACCEPT) {
          this.currentNode = node;
          return node;
        }
        if (result === NodeFilter.FILTER_SKIP && node.childNodes && node.childNodes.length > 0) {
          node = node.childNodes[0];
          continue;
        }
        node = this._nextSkipping(node);
      }
      return null;
    }

    _nextSkipping(node) {
      // Next sibling, or parent's next sibling, etc.
      while (node && node !== this.root) {
        if (node.nextSibling) return node.nextSibling;
        node = node.parentNode;
      }
      return null;
    }

    previousNode() {
      // Basic impl — walk backwards
      let node = this.currentNode;
      if (node === this.root) return null;
      // Try previous sibling's deepest last child
      if (node.previousSibling) {
        node = node.previousSibling;
        while (node.lastChild) node = node.lastChild;
        const result = this._acceptNode(node);
        if (result === NodeFilter.FILTER_ACCEPT) {
          this.currentNode = node;
          return node;
        }
      }
      // Try parent
      if (node.parentNode && node.parentNode !== this.root) {
        const result = this._acceptNode(node.parentNode);
        if (result === NodeFilter.FILTER_ACCEPT) {
          this.currentNode = node.parentNode;
          return node.parentNode;
        }
      }
      return null;
    }

    firstChild() {
      const node = this.currentNode;
      if (!node.childNodes) return null;
      for (const child of node.childNodes) {
        if (this._acceptNode(child) === NodeFilter.FILTER_ACCEPT) {
          this.currentNode = child;
          return child;
        }
      }
      return null;
    }

    lastChild() {
      const node = this.currentNode;
      if (!node.childNodes) return null;
      for (let i = node.childNodes.length - 1; i >= 0; i--) {
        const child = node.childNodes[i];
        if (this._acceptNode(child) === NodeFilter.FILTER_ACCEPT) {
          this.currentNode = child;
          return child;
        }
      }
      return null;
    }

    nextSibling() {
      let node = this.currentNode;
      while (node && node !== this.root) {
        const sib = node.nextSibling;
        if (sib) {
          if (this._acceptNode(sib) === NodeFilter.FILTER_ACCEPT) {
            this.currentNode = sib;
            return sib;
          }
          node = sib;
        } else {
          return null;
        }
      }
      return null;
    }

    parentNode() {
      let node = this.currentNode;
      while (node && node !== this.root) {
        node = node.parentNode;
        if (node && node !== this.root && this._acceptNode(node) === NodeFilter.FILTER_ACCEPT) {
          this.currentNode = node;
          return node;
        }
      }
      return null;
    }
  }

  // --- MemoryStorage (localStorage/sessionStorage) ---
  class MemoryStorage {
    constructor() { this._data = new Map(); }
    getItem(key) { return this._data.has(key) ? this._data.get(key) : null; }
    setItem(key, value) { this._data.set(key, String(value)); }
    removeItem(key) { this._data.delete(key); }
    clear() { this._data.clear(); }
    key(index) {
      const keys = [...this._data.keys()];
      return index < keys.length ? keys[index] : null;
    }
    get length() { return this._data.size; }
  }

  // --- Create document and install globals ---
  _document = new Document();

  // Window globals
  globalThis.document = _document;
  globalThis.window = globalThis;

  // Constructors
  Object.assign(globalThis, {
    Node, Element, EventTarget, Event, CustomEvent, DOMException,
    MouseEvent, KeyboardEvent, FocusEvent, InputEvent,
    HTMLElement, HTMLDivElement, HTMLSpanElement,
    HTMLInputElement, HTMLTextAreaElement, HTMLSelectElement,
    HTMLOptionElement, HTMLButtonElement, HTMLFormElement,
    HTMLAnchorElement, HTMLImageElement, HTMLDialogElement,
    HTMLLabelElement, HTMLTemplateElement, HTMLStyleElement,
    HTMLHeadElement, HTMLBodyElement, HTMLHtmlElement,
    Text, Comment, DocumentFragment,
    Document, NodeFilter, TreeWalker,
    FormData, CSSStyleSheet,
    MutationObserver, ResizeObserver, IntersectionObserver,
  });

  // Window stubs
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

  globalThis.navigator = {
    userAgent: 'VertzTest/1.0',
    language: 'en-US',
    languages: ['en-US'],
    platform: 'test',
    onLine: true,
  };

  globalThis.history = {
    _entries: [{ state: null, title: '', url: '/' }],
    _index: 0,
    get length() { return this._entries.length; },
    get state() { return this._entries[this._index]?.state || null; },
    pushState(state, title, url) {
      this._entries.splice(this._index + 1);
      this._entries.push({ state, title, url: String(url) });
      this._index = this._entries.length - 1;
      if (url) {
        const parsed = new URL(String(url), globalThis.location.href);
        globalThis.location.pathname = parsed.pathname;
        globalThis.location.search = parsed.search;
        globalThis.location.hash = parsed.hash;
        globalThis.location.href = parsed.href;
      }
    },
    replaceState(state, title, url) {
      this._entries[this._index] = { state, title, url: String(url) };
      if (url) {
        const parsed = new URL(String(url), globalThis.location.href);
        globalThis.location.pathname = parsed.pathname;
        globalThis.location.search = parsed.search;
        globalThis.location.hash = parsed.hash;
        globalThis.location.href = parsed.href;
      }
    },
    back() {},
    forward() {},
    go() {},
  };

  globalThis.requestAnimationFrame = function(cb) { return setTimeout(cb, 0); };
  globalThis.cancelAnimationFrame = function(id) { clearTimeout(id); };

  let _computedStyleWarned = false;
  globalThis.getComputedStyle = function(el) {
    if (!_computedStyleWarned) {
      _computedStyleWarned = true;
      // Tier 2 stub warning (suppressible via __VERTZ_DOM_QUIET)
      if (!globalThis.__VERTZ_DOM_QUIET) {
        // Use console.warn if available
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[vertz:dom] getComputedStyle() returns inline styles only in test mode');
        }
      }
    }
    if (el && el._styleMap) return el._styleMap;
    return new StyleMap({ attributes: {} });
  };

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

  globalThis.scrollTo = function() {};
  globalThis.scroll = function() {};
  globalThis.innerWidth = 1024;
  globalThis.innerHeight = 768;

  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();

  globalThis.NodeList = Array;
  globalThis.HTMLCollection = Array;

  // Ensure CSS injection function exists (used by module loader)
  if (typeof globalThis.__vertz_inject_css !== 'function') {
    const _injectedCSS = new Set();
    globalThis.__vertz_inject_css = function(css, filename) {
      _injectedCSS.add(css);
    };
    globalThis.__vertz_get_injected_css = function() {
      return [..._injectedCSS];
    };
  }
})();
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::js_runtime::{VertzJsRuntime, VertzRuntimeOptions};

    /// Helper: create a runtime with the DOM shim loaded (not via snapshot, directly).
    fn create_runtime_with_dom() -> VertzJsRuntime {
        let mut rt = VertzJsRuntime::new(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();
        rt.execute_script_void("[dom-shim]", TEST_DOM_SHIM_JS)
            .unwrap();
        rt
    }

    /// Helper: evaluate JS and return JSON value.
    fn eval_js(rt: &mut VertzJsRuntime, code: &str) -> serde_json::Value {
        rt.execute_script("<test>", code).unwrap()
    }

    // ===== Core DOM: createElement + instanceof =====

    #[test]
    fn test_create_element_returns_correct_types() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const input = document.createElement('input');
            const form = document.createElement('form');
            const div = document.createElement('div');
            const unknown = document.createElement('my-widget');
            JSON.stringify({
                inputIsInput: input instanceof HTMLInputElement,
                inputIsHTML: input instanceof HTMLElement,
                inputIsElement: input instanceof Element,
                inputIsNode: input instanceof Node,
                inputIsEventTarget: input instanceof EventTarget,
                formIsForm: form instanceof HTMLFormElement,
                divIsDiv: div instanceof HTMLDivElement,
                unknownIsHTML: unknown instanceof HTMLElement,
                unknownTag: unknown.tagName,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["inputIsInput"], true);
        assert_eq!(v["inputIsHTML"], true);
        assert_eq!(v["inputIsElement"], true);
        assert_eq!(v["inputIsNode"], true);
        assert_eq!(v["inputIsEventTarget"], true);
        assert_eq!(v["formIsForm"], true);
        assert_eq!(v["divIsDiv"], true);
        assert_eq!(v["unknownIsHTML"], true);
        assert_eq!(v["unknownTag"], "MY-WIDGET");
    }

    #[test]
    fn test_element_tag_and_node_type() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('button');
            JSON.stringify({
                tagName: el.tagName,
                localName: el.localName,
                nodeType: el.nodeType,
                nodeName: el.nodeName,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["tagName"], "BUTTON");
        assert_eq!(v["localName"], "button");
        assert_eq!(v["nodeType"], 1);
        assert_eq!(v["nodeName"], "BUTTON");
    }

    // ===== Tree operations =====

    #[test]
    fn test_append_child_updates_parent() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            const child = document.createElement('span');
            parent.appendChild(child);
            JSON.stringify({
                childParent: child.parentNode === parent,
                parentHasChild: parent.childNodes.length === 1,
                firstChild: parent.firstChild === child,
                lastChild: parent.lastChild === child,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["childParent"], true);
        assert_eq!(v["parentHasChild"], true);
        assert_eq!(v["firstChild"], true);
        assert_eq!(v["lastChild"], true);
    }

    #[test]
    fn test_remove_child() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            const child = document.createElement('span');
            parent.appendChild(child);
            parent.removeChild(child);
            JSON.stringify({
                noParent: child.parentNode === null,
                empty: parent.childNodes.length === 0,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["noParent"], true);
        assert_eq!(v["empty"], true);
    }

    #[test]
    fn test_insert_before() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            const a = document.createElement('span');
            const b = document.createElement('span');
            const c = document.createElement('span');
            parent.appendChild(a);
            parent.appendChild(c);
            parent.insertBefore(b, c);
            JSON.stringify({
                order: parent.childNodes.map(n => n === a ? 'a' : n === b ? 'b' : 'c'),
                bParent: b.parentNode === parent,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["order"], serde_json::json!(["a", "b", "c"]));
        assert_eq!(v["bParent"], true);
    }

    #[test]
    fn test_insert_before_fragment_order() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            const existing = document.createElement('span');
            existing.textContent = 'existing';
            parent.appendChild(existing);

            const frag = document.createDocumentFragment();
            const a = document.createElement('span');
            a.textContent = 'A';
            const b = document.createElement('span');
            b.textContent = 'B';
            const c = document.createElement('span');
            c.textContent = 'C';
            frag.appendChild(a);
            frag.appendChild(b);
            frag.appendChild(c);

            parent.insertBefore(frag, existing);
            parent.childNodes.map(n => n.textContent).join(',')
        "#,
        );
        // Fragment children must be inserted in order BEFORE the reference
        assert_eq!(result, serde_json::json!("A,B,C,existing"));
    }

    #[test]
    fn test_remove_child_non_child_throws() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            const notChild = document.createElement('span');
            let error = null;
            try {
                parent.removeChild(notChild);
            } catch (e) {
                error = { name: e.name, message: e.message };
            }
            JSON.stringify(error)
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["name"], "NotFoundError");
    }

    #[test]
    fn test_text_content_excludes_comments() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = 'hello<!--comment-->world';
            div.textContent
        "#,
        );
        assert_eq!(result, serde_json::json!("helloworld"));
    }

    #[test]
    fn test_add_event_listener_deduplication() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            let count = 0;
            const handler = () => { count++; };
            el.addEventListener('click', handler);
            el.addEventListener('click', handler); // duplicate — should be ignored
            el.dispatchEvent(new Event('click'));
            count
        "#,
        );
        assert_eq!(result, serde_json::json!(1));
    }

    #[test]
    fn test_replace_child() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            const old = document.createElement('span');
            const new_ = document.createElement('p');
            parent.appendChild(old);
            parent.replaceChild(new_, old);
            JSON.stringify({
                childCount: parent.childNodes.length,
                hasNew: parent.firstChild === new_,
                oldNoParent: old.parentNode === null,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["childCount"], 1);
        assert_eq!(v["hasNew"], true);
        assert_eq!(v["oldNoParent"], true);
    }

    #[test]
    fn test_sibling_links() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            const a = document.createElement('span');
            const b = document.createElement('span');
            const c = document.createElement('span');
            parent.appendChild(a);
            parent.appendChild(b);
            parent.appendChild(c);
            JSON.stringify({
                aNext: a.nextSibling === b,
                bNext: b.nextSibling === c,
                cNext: c.nextSibling === null,
                aPrev: a.previousSibling === null,
                bPrev: b.previousSibling === a,
                cPrev: c.previousSibling === b,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["aNext"], true);
        assert_eq!(v["bNext"], true);
        assert_eq!(v["cNext"], true);
        assert_eq!(v["aPrev"], true);
        assert_eq!(v["bPrev"], true);
        assert_eq!(v["cPrev"], true);
    }

    #[test]
    fn test_children_filters_text_nodes() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            parent.appendChild(document.createTextNode('hello'));
            parent.appendChild(document.createElement('span'));
            parent.appendChild(document.createTextNode('world'));
            parent.appendChild(document.createElement('p'));
            JSON.stringify({
                childNodes: parent.childNodes.length,
                children: parent.children.length,
                firstElement: parent.firstElementChild.tagName,
                lastElement: parent.lastElementChild.tagName,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["childNodes"], 4);
        assert_eq!(v["children"], 2);
        assert_eq!(v["firstElement"], "SPAN");
        assert_eq!(v["lastElement"], "P");
    }

    #[test]
    fn test_re_append_moves_child() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const p1 = document.createElement('div');
            const p2 = document.createElement('div');
            const child = document.createElement('span');
            p1.appendChild(child);
            p2.appendChild(child);
            JSON.stringify({
                p1Empty: p1.childNodes.length === 0,
                p2Has: p2.childNodes.length === 1,
                parent: child.parentNode === p2,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["p1Empty"], true);
        assert_eq!(v["p2Has"], true);
        assert_eq!(v["parent"], true);
    }

    #[test]
    fn test_contains() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const a = document.createElement('div');
            const b = document.createElement('span');
            const c = document.createElement('p');
            a.appendChild(b);
            b.appendChild(c);
            JSON.stringify({
                self: a.contains(a),
                child: a.contains(b),
                grandchild: a.contains(c),
                notContained: c.contains(a),
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["self"], true);
        assert_eq!(v["child"], true);
        assert_eq!(v["grandchild"], true);
        assert_eq!(v["notContained"], false);
    }

    #[test]
    fn test_node_constants() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            "Node.ELEMENT_NODE === 1 && Node.TEXT_NODE === 3 && Node.DOCUMENT_NODE === 9",
        );
        assert_eq!(result, serde_json::json!(true));
    }

    // ===== Attributes =====

    #[test]
    fn test_set_get_attribute() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            el.setAttribute('data-foo', 'bar');
            JSON.stringify({
                val: el.getAttribute('data-foo'),
                has: el.hasAttribute('data-foo'),
                missing: el.getAttribute('nonexistent'),
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["val"], "bar");
        assert_eq!(v["has"], true);
        assert!(v["missing"].is_null());
    }

    #[test]
    fn test_remove_attribute() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            el.setAttribute('foo', 'bar');
            el.removeAttribute('foo');
            el.hasAttribute('foo')
        "#,
        );
        assert_eq!(result, serde_json::json!(false));
    }

    #[test]
    fn test_toggle_attribute() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            const added = el.toggleAttribute('disabled');
            const removed = el.toggleAttribute('disabled');
            JSON.stringify({ added, removed, has: el.hasAttribute('disabled') })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["added"], true);
        assert_eq!(v["removed"], false);
        assert_eq!(v["has"], false);
    }

    #[test]
    fn test_class_list() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            el.classList.add('a', 'b');
            const hasA = el.classList.contains('a');
            const hasB = el.classList.contains('b');
            const className = el.className;
            el.classList.remove('a');
            const afterRemove = el.classList.contains('a');
            el.classList.toggle('c');
            const hasC = el.classList.contains('c');
            el.classList.toggle('c');
            const afterToggle = el.classList.contains('c');
            JSON.stringify({ hasA, hasB, className, afterRemove, hasC, afterToggle, length: el.classList.length })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["hasA"], true);
        assert_eq!(v["hasB"], true);
        assert_eq!(v["className"], "a b");
        assert_eq!(v["afterRemove"], false);
        assert_eq!(v["hasC"], true);
        assert_eq!(v["afterToggle"], false);
        assert_eq!(v["length"], 1); // only "b" remains
    }

    #[test]
    fn test_id_getter_setter() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            el.id = 'test';
            JSON.stringify({ id: el.id, attr: el.getAttribute('id') })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["id"], "test");
        assert_eq!(v["attr"], "test");
    }

    // ===== Style (class-based, no Proxy) =====

    #[test]
    fn test_style_map() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            el.style.color = 'red';
            el.style.fontSize = '12px';
            const stable = el.style === el.style;
            JSON.stringify({
                color: el.style.color,
                fontSize: el.style.fontSize,
                stable,
                cssText: el.style.cssText,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["color"], "red");
        assert_eq!(v["fontSize"], "12px");
        assert_eq!(v["stable"], true);
        // cssText should contain both properties
        let css = v["cssText"].as_str().unwrap();
        assert!(
            css.contains("color: red"),
            "cssText should have color: {}",
            css
        );
        assert!(
            css.contains("font-size: 12px"),
            "cssText should have font-size: {}",
            css
        );
    }

    #[test]
    fn test_style_set_remove_property() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            el.style.setProperty('background-color', 'blue');
            const val = el.style.getPropertyValue('background-color');
            el.style.removeProperty('background-color');
            const after = el.style.getPropertyValue('background-color');
            JSON.stringify({ val, after })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["val"], "blue");
        assert_eq!(v["after"], "");
    }

    // ===== Dataset =====

    #[test]
    fn test_dataset() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            el.dataset._set('testId', 'foo');
            const fromAttr = el.getAttribute('data-test-id');
            el.setAttribute('data-another', 'bar');
            el.dataset._syncFromAttributes();
            const fromDataset = el.dataset._get('another');
            JSON.stringify({ fromAttr, fromDataset })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["fromAttr"], "foo");
        assert_eq!(v["fromDataset"], "bar");
    }

    // ===== Text content =====

    #[test]
    fn test_text_content() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            const span = document.createElement('span');
            span.textContent = 'hello';
            const p = document.createElement('p');
            p.textContent = ' world';
            div.appendChild(span);
            div.appendChild(p);
            const text = div.textContent;
            div.textContent = 'replaced';
            JSON.stringify({
                text,
                replaced: div.textContent,
                childCount: div.childNodes.length,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["text"], "hello world");
        assert_eq!(v["replaced"], "replaced");
        assert_eq!(v["childCount"], 1);
    }

    // ===== innerHTML =====

    #[test]
    fn test_inner_html_parse_basic() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<span class="title">Hello</span>';
            const span = div.firstChild;
            JSON.stringify({
                tag: span.tagName,
                cls: span.getAttribute('class'),
                text: span.textContent,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["tag"], "SPAN");
        assert_eq!(v["cls"], "title");
        assert_eq!(v["text"], "Hello");
    }

    #[test]
    fn test_inner_html_nested() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<div class="card"><span>text</span></div>';
            const card = div.firstChild;
            JSON.stringify({
                cardTag: card.tagName,
                cardClass: card.getAttribute('class'),
                spanTag: card.firstChild.tagName,
                spanText: card.firstChild.textContent,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["cardTag"], "DIV");
        assert_eq!(v["cardClass"], "card");
        assert_eq!(v["spanTag"], "SPAN");
        assert_eq!(v["spanText"], "text");
    }

    #[test]
    fn test_inner_html_clear() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<span>text</span>';
            div.innerHTML = '';
            div.childNodes.length
        "#,
        );
        assert_eq!(result, serde_json::json!(0));
    }

    #[test]
    fn test_inner_html_void_elements() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<br><input type="text"><hr>';
            JSON.stringify({
                count: div.childNodes.length,
                tags: div.children.map(c => c.tagName),
                inputType: div.children[1].type,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["count"], 3);
        assert_eq!(v["tags"], serde_json::json!(["BR", "INPUT", "HR"]));
        assert_eq!(v["inputType"], "text");
    }

    #[test]
    fn test_inner_html_entities() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<p>&amp;&lt;&gt;&quot;&#39;</p>';
            div.firstChild.textContent
        "#,
        );
        assert_eq!(result, serde_json::json!("&<>\"'"));
    }

    #[test]
    fn test_inner_html_script_raw_text() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<script type="application/json">{"a":1,"b":[2]}</script>';
            div.firstChild.textContent
        "#,
        );
        assert_eq!(result, serde_json::json!("{\"a\":1,\"b\":[2]}"));
    }

    #[test]
    fn test_inner_html_to_query_selector_roundtrip() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<h2 class="title">My Task</h2><span data-testid="status">open</span>';
            JSON.stringify({
                title: div.querySelector('.title').textContent,
                status: div.querySelector('[data-testid="status"]').textContent,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["title"], "My Task");
        assert_eq!(v["status"], "open");
    }

    // ===== Input element properties =====

    #[test]
    fn test_input_properties() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const input = document.createElement('input');
            input.value = 'hello';
            input.checked = true;
            input.disabled = true;
            input.type = 'checkbox';
            input.name = 'field';
            JSON.stringify({
                value: input.value,
                checked: input.checked,
                disabled: input.disabled,
                hasDisabled: input.hasAttribute('disabled'),
                type: input.type,
                name: input.name,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["value"], "hello");
        assert_eq!(v["checked"], true);
        assert_eq!(v["disabled"], true);
        assert_eq!(v["hasDisabled"], true);
        assert_eq!(v["type"], "checkbox");
        assert_eq!(v["name"], "field");
    }

    // ===== Dialog element =====

    #[test]
    fn test_dialog_element() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const dialog = document.createElement('dialog');
            dialog.showModal();
            const afterShow = dialog.open;
            dialog.close('result');
            JSON.stringify({
                afterShow,
                afterClose: dialog.open,
                returnValue: dialog.returnValue,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["afterShow"], true);
        assert_eq!(v["afterClose"], false);
        assert_eq!(v["returnValue"], "result");
    }

    // ===== Template element =====

    #[test]
    fn test_template_content() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const template = document.createElement('template');
            template.content instanceof DocumentFragment
        "#,
        );
        assert_eq!(result, serde_json::json!(true));
    }

    // ===== cloneNode =====

    #[test]
    fn test_clone_node_deep() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<span>child</span>';
            const clone = div.cloneNode(true);
            clone.querySelector('span').textContent = 'changed';
            JSON.stringify({
                original: div.querySelector('span').textContent,
                cloned: clone.querySelector('span').textContent,
                different: div !== clone,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["original"], "child");
        assert_eq!(v["cloned"], "changed");
        assert_eq!(v["different"], true);
    }

    // ===== Document =====

    #[test]
    fn test_document_structure() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            JSON.stringify({
                bodyTag: document.body.tagName,
                headTag: document.head.tagName,
                docElTag: document.documentElement.tagName,
                docType: document.nodeType,
                hasCreateElement: typeof document.createElement === 'function',
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["bodyTag"], "BODY");
        assert_eq!(v["headTag"], "HEAD");
        assert_eq!(v["docElTag"], "HTML");
        assert_eq!(v["docType"], 9);
        assert_eq!(v["hasCreateElement"], true);
    }

    #[test]
    fn test_document_get_element_by_id() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            el.id = 'test-el';
            document.body.appendChild(el);
            const found = document.getElementById('test-el');
            found === el
        "#,
        );
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_document_query_selector() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            document.body.innerHTML = '<div class="card"><span>Hello</span></div>';
            const span = document.querySelector('span');
            span.textContent
        "#,
        );
        assert_eq!(result, serde_json::json!("Hello"));
    }

    // ===== FormData =====

    #[test]
    fn test_form_data_from_form() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const form = document.createElement('form');
            const input = document.createElement('input');
            input.name = 'title';
            input.value = 'New Task';
            form.appendChild(input);
            const fd = new FormData(form);
            JSON.stringify({
                title: fd.get('title'),
                has: fd.has('title'),
                missing: fd.get('nonexistent'),
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["title"], "New Task");
        assert_eq!(v["has"], true);
        assert!(v["missing"].is_null());
    }

    // ===== TreeWalker =====

    #[test]
    fn test_tree_walker_elements() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<p>Hello <strong>World</strong></p>';
            const walker = document.createTreeWalker(div, NodeFilter.SHOW_ELEMENT);
            const tags = [];
            while (walker.nextNode()) tags.push(walker.currentNode.tagName);
            JSON.stringify(tags)
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v, serde_json::json!(["P", "STRONG"]));
    }

    #[test]
    fn test_tree_walker_text() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<p>Hello <strong>World</strong></p>';
            const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
            const texts = [];
            while (walker.nextNode()) texts.push(walker.currentNode.data);
            JSON.stringify(texts)
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v, serde_json::json!(["Hello ", "World"]));
    }

    // ===== Event dispatch (basic — Phase 1) =====

    #[test]
    fn test_basic_event_dispatch() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('button');
            let called = false;
            el.addEventListener('click', () => { called = true; });
            el.dispatchEvent(new Event('click'));
            called
        "#,
        );
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_click_method() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const button = document.createElement('button');
            let eventType = null;
            let isMouse = false;
            button.addEventListener('click', (e) => {
                eventType = e.type;
                isMouse = e instanceof MouseEvent;
            });
            button.click();
            JSON.stringify({ eventType, isMouse })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["eventType"], "click");
        assert_eq!(v["isMouse"], true);
    }

    #[test]
    fn test_once_option() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            let count = 0;
            el.addEventListener('click', () => { count++; }, { once: true });
            el.dispatchEvent(new Event('click'));
            el.dispatchEvent(new Event('click'));
            count
        "#,
        );
        assert_eq!(result, serde_json::json!(1));
    }

    // ===== Event dispatch — Phase 2: capture/target/bubble =====

    #[test]
    fn test_event_bubbles_through_ancestors() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const grandparent = document.createElement('div');
            const parent = document.createElement('div');
            const child = document.createElement('span');
            grandparent.appendChild(parent);
            parent.appendChild(child);

            const log = [];
            grandparent.addEventListener('click', () => log.push('grandparent-bubble'));
            parent.addEventListener('click', () => log.push('parent-bubble'));
            child.addEventListener('click', () => log.push('child-target'));
            child.dispatchEvent(new Event('click', { bubbles: true }));
            JSON.stringify(log)
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(
            v,
            serde_json::json!(["child-target", "parent-bubble", "grandparent-bubble"])
        );
    }

    #[test]
    fn test_event_no_bubble_when_bubbles_false() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            const child = document.createElement('span');
            parent.appendChild(child);

            let parentCalled = false;
            parent.addEventListener('click', () => { parentCalled = true; });
            child.dispatchEvent(new Event('click', { bubbles: false }));
            parentCalled
        "#,
        );
        assert_eq!(result, serde_json::json!(false));
    }

    #[test]
    fn test_event_capture_phase() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            const child = document.createElement('span');
            parent.appendChild(child);

            const log = [];
            parent.addEventListener('click', () => log.push('parent-capture'), true);
            parent.addEventListener('click', () => log.push('parent-bubble'));
            child.addEventListener('click', () => log.push('child-target'));
            child.dispatchEvent(new Event('click', { bubbles: true }));
            JSON.stringify(log)
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(
            v,
            serde_json::json!(["parent-capture", "child-target", "parent-bubble"])
        );
    }

    #[test]
    fn test_event_at_target_fires_both_capture_and_bubble_listeners() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            const log = [];
            el.addEventListener('click', () => log.push('capture'), true);
            el.addEventListener('click', () => log.push('bubble'), false);
            el.dispatchEvent(new Event('click', { bubbles: true }));
            JSON.stringify(log)
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        // At-target phase: ALL listeners fire in registration order, regardless of capture flag
        assert_eq!(v, serde_json::json!(["capture", "bubble"]));
    }

    #[test]
    fn test_stop_propagation_halts_bubbling() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const grandparent = document.createElement('div');
            const parent = document.createElement('div');
            const child = document.createElement('span');
            grandparent.appendChild(parent);
            parent.appendChild(child);

            const log = [];
            grandparent.addEventListener('click', () => log.push('grandparent'));
            parent.addEventListener('click', (e) => {
                log.push('parent');
                e.stopPropagation();
            });
            child.addEventListener('click', () => log.push('child'));
            child.dispatchEvent(new Event('click', { bubbles: true }));
            JSON.stringify(log)
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v, serde_json::json!(["child", "parent"]));
    }

    #[test]
    fn test_stop_immediate_propagation() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            const log = [];
            el.addEventListener('click', (e) => {
                log.push('first');
                e.stopImmediatePropagation();
            });
            el.addEventListener('click', () => log.push('second'));
            el.dispatchEvent(new Event('click'));
            JSON.stringify(log)
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v, serde_json::json!(["first"]));
    }

    #[test]
    fn test_stop_propagation_in_capture_phase() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            const child = document.createElement('span');
            parent.appendChild(child);

            const log = [];
            parent.addEventListener('click', (e) => {
                log.push('parent-capture');
                e.stopPropagation();
            }, true);
            child.addEventListener('click', () => log.push('child-target'));
            parent.addEventListener('click', () => log.push('parent-bubble'));
            child.dispatchEvent(new Event('click', { bubbles: true }));
            JSON.stringify(log)
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        // Only capture listener fires; target and bubble never reached
        assert_eq!(v, serde_json::json!(["parent-capture"]));
    }

    #[test]
    fn test_event_phase_values() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            const child = document.createElement('span');
            parent.appendChild(child);

            const phases = [];
            parent.addEventListener('click', (e) => phases.push(e.eventPhase), true);
            child.addEventListener('click', (e) => phases.push(e.eventPhase));
            parent.addEventListener('click', (e) => phases.push(e.eventPhase));
            child.dispatchEvent(new Event('click', { bubbles: true }));
            JSON.stringify(phases)
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        // 1 = CAPTURING_PHASE, 2 = AT_TARGET, 3 = BUBBLING_PHASE
        assert_eq!(v, serde_json::json!([1, 2, 3]));
    }

    #[test]
    fn test_current_target_set_correctly() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            parent.id = 'parent';
            const child = document.createElement('span');
            child.id = 'child';
            parent.appendChild(child);

            const targets = [];
            parent.addEventListener('click', (e) => targets.push(e.currentTarget.id), true);
            child.addEventListener('click', (e) => targets.push(e.currentTarget.id));
            parent.addEventListener('click', (e) => targets.push(e.currentTarget.id));
            child.dispatchEvent(new Event('click', { bubbles: true }));
            JSON.stringify(targets)
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v, serde_json::json!(["parent", "child", "parent"]));
    }

    #[test]
    fn test_prevent_default() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('button');
            el.addEventListener('click', (e) => e.preventDefault());
            const result = el.dispatchEvent(new Event('click', { cancelable: true }));
            JSON.stringify({ returnValue: result, defaultPrevented: true })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["returnValue"], false);
    }

    #[test]
    fn test_prevent_default_non_cancelable() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('button');
            el.addEventListener('click', (e) => e.preventDefault());
            const result = el.dispatchEvent(new Event('click', { cancelable: false }));
            result
        "#,
        );
        // Non-cancelable events can't be prevented
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_listener_snapshot_semantics() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            const log = [];
            el.addEventListener('click', () => {
                log.push('first');
                // Adding a listener during dispatch should NOT fire in this dispatch
                el.addEventListener('click', () => log.push('added-during'));
            });
            el.dispatchEvent(new Event('click'));
            JSON.stringify(log)
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v, serde_json::json!(["first"]));
    }

    #[test]
    fn test_click_method_bubbles() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            const child = document.createElement('button');
            parent.appendChild(child);

            let parentCalled = false;
            parent.addEventListener('click', () => { parentCalled = true; });
            child.click();
            parentCalled
        "#,
        );
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_custom_event_detail() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            let received = null;
            el.addEventListener('my-event', (e) => { received = e.detail; });
            el.dispatchEvent(new CustomEvent('my-event', { detail: { foo: 42 } }));
            JSON.stringify(received)
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["foo"], 42);
    }

    #[test]
    fn test_focus_blur_events() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const input = document.createElement('input');
            document.body.appendChild(input);
            input.focus();
            const afterFocus = document.activeElement === input;
            input.blur();
            const afterBlur = document.activeElement === document.body;
            JSON.stringify({ afterFocus, afterBlur })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["afterFocus"], true);
        assert_eq!(v["afterBlur"], true);
    }

    #[test]
    fn test_remove_event_listener() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            let count = 0;
            const handler = () => { count++; };
            el.addEventListener('click', handler);
            el.dispatchEvent(new Event('click'));
            el.removeEventListener('click', handler);
            el.dispatchEvent(new Event('click'));
            count
        "#,
        );
        assert_eq!(result, serde_json::json!(1));
    }

    #[test]
    fn test_remove_capture_listener_only() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            const log = [];
            const handler = () => log.push('fired');
            el.addEventListener('click', handler, true);  // capture
            el.addEventListener('click', handler, false);  // bubble
            // Remove only the capture one
            el.removeEventListener('click', handler, true);
            el.dispatchEvent(new Event('click'));
            log.length
        "#,
        );
        // Bubble listener should still be there
        assert_eq!(result, serde_json::json!(1));
    }

    // ===== Selector Engine — Phase 3: combinators + pseudo-classes =====

    #[test]
    fn test_child_combinator() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<ul><li><span>deep</span></li><li>direct</li></ul>';
            // "ul > li" should match direct children of ul
            const items = div.querySelectorAll('ul > li');
            // "ul > span" should NOT match (span is grandchild)
            const spans = div.querySelectorAll('ul > span');
            JSON.stringify({ items: items.length, spans: spans.length })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["items"], 2);
        assert_eq!(v["spans"], 0);
    }

    #[test]
    fn test_adjacent_sibling_combinator() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<h1>Title</h1><p>First</p><p>Second</p>';
            // "h1 + p" matches the p immediately after h1
            const match = div.querySelector('h1 + p');
            JSON.stringify({ text: match?.textContent, found: !!match })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["text"], "First");
        assert_eq!(v["found"], true);
    }

    #[test]
    fn test_general_sibling_combinator() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<h1>Title</h1><p>First</p><p>Second</p><span>Not</span>';
            // "h1 ~ p" matches all p siblings after h1
            const matches = div.querySelectorAll('h1 ~ p');
            JSON.stringify({ count: matches.length, texts: matches.map(m => m.textContent) })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["count"], 2);
        assert_eq!(v["texts"], serde_json::json!(["First", "Second"]));
    }

    #[test]
    fn test_nth_child_number() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const ul = document.createElement('ul');
            ul.innerHTML = '<li>1</li><li>2</li><li>3</li>';
            const second = ul.querySelector('li:nth-child(2)');
            second.textContent
        "#,
        );
        assert_eq!(result, serde_json::json!("2"));
    }

    #[test]
    fn test_nth_child_odd_even() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const ul = document.createElement('ul');
            ul.innerHTML = '<li>1</li><li>2</li><li>3</li><li>4</li>';
            const odd = ul.querySelectorAll('li:nth-child(odd)').map(e => e.textContent);
            const even = ul.querySelectorAll('li:nth-child(even)').map(e => e.textContent);
            JSON.stringify({ odd, even })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["odd"], serde_json::json!(["1", "3"]));
        assert_eq!(v["even"], serde_json::json!(["2", "4"]));
    }

    #[test]
    fn test_nth_child_formula() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const ul = document.createElement('ul');
            ul.innerHTML = '<li>1</li><li>2</li><li>3</li><li>4</li><li>5</li><li>6</li>';
            // 3n selects 3rd, 6th
            const every3 = ul.querySelectorAll('li:nth-child(3n)').map(e => e.textContent);
            // 2n+1 = odd
            const odd = ul.querySelectorAll('li:nth-child(2n+1)').map(e => e.textContent);
            JSON.stringify({ every3, odd })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["every3"], serde_json::json!(["3", "6"]));
        assert_eq!(v["odd"], serde_json::json!(["1", "3", "5"]));
    }

    #[test]
    fn test_has_pseudo_class() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<div class="a"><span>yes</span></div><div class="b">no</div>';
            // "div:has(span)" matches divs that contain a span descendant
            const match = div.querySelector('div:has(span)');
            match.getAttribute('class')
        "#,
        );
        assert_eq!(result, serde_json::json!("a"));
    }

    #[test]
    fn test_only_child() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<ul><li>only</li></ul>';
            const li = div.querySelector('li:only-child');
            JSON.stringify({ found: !!li, text: li?.textContent })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["found"], true);
        assert_eq!(v["text"], "only");
    }

    #[test]
    fn test_empty_pseudo_class() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<span></span><span>text</span>';
            const empties = div.querySelectorAll('span:empty');
            empties.length
        "#,
        );
        assert_eq!(result, serde_json::json!(1));
    }

    #[test]
    fn test_checked_pseudo_class() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            const cb1 = document.createElement('input');
            cb1.type = 'checkbox';
            cb1.checked = true;
            const cb2 = document.createElement('input');
            cb2.type = 'checkbox';
            cb2.checked = false;
            div.appendChild(cb1);
            div.appendChild(cb2);
            div.querySelectorAll('input:checked').length
        "#,
        );
        assert_eq!(result, serde_json::json!(1));
    }

    #[test]
    fn test_complex_selector_chain() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const div = document.createElement('div');
            div.innerHTML = '<div class="list"><ul><li class="active">A</li><li>B</li></ul></div>';
            // Complex: descendant + child + class
            const el = div.querySelector('.list > ul > li.active');
            el?.textContent
        "#,
        );
        assert_eq!(result, serde_json::json!("A"));
    }

    #[test]
    fn test_matches_with_combinators() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const parent = document.createElement('div');
            parent.className = 'container';
            const child = document.createElement('span');
            child.className = 'item';
            parent.appendChild(child);
            JSON.stringify({
                descendant: child.matches('.container span'),
                child: child.matches('.container > span'),
                wrongParent: child.matches('.other > span'),
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["descendant"], true);
        assert_eq!(v["child"], true);
        assert_eq!(v["wrongParent"], false);
    }

    // ===== __VERTZ_DOM_MODE guard =====

    #[test]
    fn test_dom_mode_flag() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(&mut rt, "globalThis.__VERTZ_DOM_MODE");
        assert_eq!(result, serde_json::json!("test"));
    }

    // ===== History =====

    #[test]
    fn test_history_push_state() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            history.pushState({}, '', '/tasks/123');
            location.pathname
        "#,
        );
        assert_eq!(result, serde_json::json!("/tasks/123"));
    }

    // ===== Hydration-style test pattern =====

    #[test]
    fn test_body_inner_html_hydration_pattern() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            document.body.innerHTML = '<div data-v-id="Counter" data-v-key="c1"><script type="application/json">{"initial":0}</script><button>0</button></div>';
            const island = document.querySelector('[data-v-id="Counter"]');
            const btn = island.querySelector('button');
            const script = island.querySelector('script[type="application/json"]');
            JSON.stringify({
                islandExists: island !== null,
                btnText: btn.textContent,
                scriptText: script.textContent,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["islandExists"], true);
        assert_eq!(v["btnText"], "0");
        assert_eq!(v["scriptText"], "{\"initial\":0}");
    }

    // ===== Closest =====

    #[test]
    fn test_closest() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            document.body.innerHTML = '<div class="card"><span class="title">Hello</span></div>';
            const span = document.querySelector('.title');
            const card = span.closest('.card');
            const self = span.closest('.title');
            const missing = span.closest('.nonexistent');
            JSON.stringify({
                cardTag: card ? card.tagName : null,
                selfTag: self ? self.tagName : null,
                missing: missing,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["cardTag"], "DIV");
        assert_eq!(v["selfTag"], "SPAN");
        assert!(v["missing"].is_null());
    }

    // ===== MemoryStorage =====

    #[test]
    fn test_local_storage() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            localStorage.setItem('key', 'value');
            const val = localStorage.getItem('key');
            const len = localStorage.length;
            localStorage.removeItem('key');
            JSON.stringify({ val, len, after: localStorage.length })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["val"], "value");
        assert_eq!(v["len"], 1);
        assert_eq!(v["after"], 0);
    }

    #[test]
    fn test_storage_key_method() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            localStorage.clear();
            localStorage.setItem('a', '1');
            localStorage.setItem('b', '2');
            JSON.stringify({
                key0: localStorage.key(0),
                key1: localStorage.key(1),
                key2: localStorage.key(2),
                length: localStorage.length,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["key0"], "a");
        assert_eq!(v["key1"], "b");
        assert!(v["key2"].is_null());
        assert_eq!(v["length"], 2);
    }

    #[test]
    fn test_storage_clear() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            sessionStorage.setItem('x', '1');
            sessionStorage.setItem('y', '2');
            sessionStorage.clear();
            sessionStorage.length
        "#,
        );
        assert_eq!(result, serde_json::json!(0));
    }

    // ===== Phase 4: Window + Document remaining APIs =====

    #[test]
    fn test_location_search_hash() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            history.pushState({}, '', '/tasks?status=open#section1');
            JSON.stringify({
                pathname: location.pathname,
                search: location.search,
                hash: location.hash,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["pathname"], "/tasks");
        assert_eq!(v["search"], "?status=open");
        assert_eq!(v["hash"], "#section1");
    }

    #[test]
    fn test_replace_state() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            history.pushState({}, '', '/page1');
            history.replaceState({ replaced: true }, '', '/page2');
            JSON.stringify({
                pathname: location.pathname,
                length: history.length,
                state: history.state,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["pathname"], "/page2");
        // replaceState doesn't add an entry
        assert_eq!(v["length"], 2); // initial + pushState (replaceState replaced the last one)
        assert_eq!(v["state"]["replaced"], true);
    }

    #[test]
    fn test_observer_stubs_exist() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const mo = new MutationObserver(() => {});
            const ro = new ResizeObserver(() => {});
            const io = new IntersectionObserver(() => {});
            // All should be callable no-ops
            mo.observe(document.body);
            mo.disconnect();
            ro.observe(document.body);
            ro.unobserve(document.body);
            ro.disconnect();
            io.observe(document.body);
            io.unobserve(document.body);
            io.disconnect();
            JSON.stringify({
                moRecords: mo.takeRecords().length,
                hasMO: typeof MutationObserver === 'function',
                hasRO: typeof ResizeObserver === 'function',
                hasIO: typeof IntersectionObserver === 'function',
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["moRecords"], 0);
        assert_eq!(v["hasMO"], true);
        assert_eq!(v["hasRO"], true);
        assert_eq!(v["hasIO"], true);
    }

    #[test]
    fn test_request_animation_frame() {
        // Uses snapshot runtime because rAF delegates to setTimeout (from bootstrap JS)
        let mut rt = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();
        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let result = tokio_rt.block_on(async {
            rt.execute_script_void(
                "<test>",
                r#"
                globalThis.__rafFired = false;
                requestAnimationFrame(() => { globalThis.__rafFired = true; });
                "#,
            )
            .unwrap();
            rt.run_event_loop().await.unwrap();
            rt.execute_script("<collect>", "globalThis.__rafFired")
                .unwrap()
        });
        assert_eq!(result, serde_json::json!(true));
    }

    #[test]
    fn test_cancel_animation_frame() {
        // Uses snapshot runtime because cancelAnimationFrame delegates to clearTimeout
        let mut rt = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();
        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let result = tokio_rt.block_on(async {
            rt.execute_script_void(
                "<test>",
                r#"
                globalThis.__rafFired = false;
                const id = requestAnimationFrame(() => { globalThis.__rafFired = true; });
                cancelAnimationFrame(id);
                // Give time for the cancelled callback to NOT fire
                setTimeout(() => {}, 10);
                "#,
            )
            .unwrap();
            rt.run_event_loop().await.unwrap();
            rt.execute_script("<collect>", "globalThis.__rafFired")
                .unwrap()
        });
        assert_eq!(result, serde_json::json!(false));
    }

    #[test]
    fn test_get_computed_style() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const el = document.createElement('div');
            el.style.setProperty('color', 'red');
            el.style.setProperty('font-size', '16px');
            const cs = getComputedStyle(el);
            JSON.stringify({
                color: cs.getPropertyValue('color'),
                fontSize: cs.getPropertyValue('font-size'),
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["color"], "red");
        assert_eq!(v["fontSize"], "16px");
    }

    #[test]
    fn test_match_media() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            const mql = matchMedia('(prefers-color-scheme: dark)');
            JSON.stringify({ matches: mql.matches, media: mql.media })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["matches"], false);
        assert_eq!(v["media"], "(prefers-color-scheme: dark)");
    }

    #[test]
    fn test_window_dimensions() {
        let mut rt = create_runtime_with_dom();
        let result = eval_js(
            &mut rt,
            r#"
            JSON.stringify({
                width: innerWidth,
                height: innerHeight,
                isWindow: window === globalThis,
            })
        "#,
        );
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["width"], 1024);
        assert_eq!(v["height"], 768);
        assert_eq!(v["isWindow"], true);
    }

    // ===== Phase 5: Snapshot integration validation =====

    #[test]
    fn test_dom_shim_in_snapshot() {
        // Verify the DOM shim works when restored from V8 snapshot
        // (uses new_for_test which restores from snapshot)
        let mut rt = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();

        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                div.innerHTML = '<span class="test">hello</span>';
                const span = div.querySelector('.test');
                JSON.stringify({
                    domMode: globalThis.__VERTZ_DOM_MODE,
                    tag: span.tagName,
                    text: span.textContent,
                    hasDocument: typeof document !== 'undefined',
                    hasWindow: typeof window !== 'undefined',
                    bodyTag: document.body.tagName,
                })
            "#,
            )
            .unwrap();
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v["domMode"], "test");
        assert_eq!(v["tag"], "SPAN");
        assert_eq!(v["text"], "hello");
        assert_eq!(v["hasDocument"], true);
        assert_eq!(v["hasWindow"], true);
        assert_eq!(v["bodyTag"], "BODY");
    }

    #[test]
    fn test_snapshot_event_dispatch() {
        // Verify event dispatch works after snapshot restore
        let mut rt = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();

        let result = rt
            .execute_script(
                "<test>",
                r#"
                const parent = document.createElement('div');
                const child = document.createElement('button');
                parent.appendChild(child);
                const log = [];
                parent.addEventListener('click', () => log.push('parent'), true);
                child.addEventListener('click', () => log.push('child'));
                parent.addEventListener('click', () => log.push('parent-bubble'));
                child.dispatchEvent(new Event('click', { bubbles: true }));
                JSON.stringify(log)
            "#,
            )
            .unwrap();
        let v: serde_json::Value = serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(v, serde_json::json!(["parent", "child", "parent-bubble"]));
    }

    #[test]
    fn test_snapshot_selectors() {
        // Verify enhanced selectors work after snapshot restore
        let mut rt = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();

        let result = rt
            .execute_script(
                "<test>",
                r#"
                const div = document.createElement('div');
                div.innerHTML = '<ul><li>1</li><li>2</li><li>3</li></ul>';
                const second = div.querySelector('ul > li:nth-child(2)');
                second.textContent
            "#,
            )
            .unwrap();
        assert_eq!(result, serde_json::json!("2"));
    }

    #[test]
    fn test_snapshot_harness_and_dom_coexist() {
        // Verify test harness (describe/it/expect) and DOM both work from snapshot
        let mut rt = VertzJsRuntime::new_for_test(VertzRuntimeOptions {
            capture_output: true,
            ..Default::default()
        })
        .unwrap();

        let tokio_rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();

        let result = tokio_rt.block_on(async {
            rt.execute_script_void(
                "<test-file>",
                r#"
                describe('DOM + harness', () => {
                    it('creates elements', () => {
                        const el = document.createElement('div');
                        el.textContent = 'hello';
                        expect(el.textContent).toBe('hello');
                    });
                    it('queries selectors', () => {
                        const div = document.createElement('div');
                        div.innerHTML = '<span class="x">found</span>';
                        expect(div.querySelector('.x').textContent).toBe('found');
                    });
                    it('dispatches events', () => {
                        const el = document.createElement('button');
                        let clicked = false;
                        el.addEventListener('click', () => { clicked = true; });
                        el.click();
                        expect(clicked).toBe(true);
                    });
                });
                "#,
            )
            .unwrap();

            rt.execute_script_void(
                "<run>",
                "globalThis.__vertz_run_tests().then(r => globalThis.__test_results = r)",
            )
            .unwrap();

            rt.run_event_loop().await.unwrap();
            rt.execute_script("<collect>", "JSON.stringify(globalThis.__test_results)")
                .unwrap()
        });

        let results: Vec<serde_json::Value> =
            serde_json::from_str(result.as_str().unwrap()).unwrap();
        assert_eq!(results.len(), 3);
        for (i, result) in results.iter().enumerate() {
            assert_eq!(
                result["status"], "pass",
                "Test {} should pass, got: {:?}",
                i, result
            );
        }
    }
}
