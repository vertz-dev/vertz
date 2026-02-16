import { SSRDocumentFragment } from './ssr-fragment';
import { SSRNode } from './ssr-node';
import { SSRTextNode } from './ssr-text-node';

/**
 * Proxy-based CSSStyleDeclaration shim
 */
// biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
function createStyleProxy(element) {
  const styles = {};
  return new Proxy(styles, {
    set(_target, prop, value) {
      if (typeof prop === 'string') {
        // Store the value
        styles[prop] = value;
        // Update the style attribute on the element (convert camelCase to kebab-case)
        const pairs = Object.entries(styles).map(([k, v]) => {
          const key = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
          return `${key}: ${v}`;
        });
        element.attrs.style = pairs.join('; ');
      }
      return true;
    },
    get(_target, prop) {
      if (typeof prop === 'string') {
        return styles[prop] ?? '';
      }
      return undefined;
    },
  });
}
/**
 * A VNode-based element that supports basic DOM-like operations.
 */
export class SSRElement extends SSRNode {
  tag;
  attrs = {};
  children = [];
  _classList = new Set();
  _textContent = null;
  _innerHTML = null;
  // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
  style;
  constructor(tag) {
    super();
    this.tag = tag;
    this.style = createStyleProxy(this);
  }
  setAttribute(name, value) {
    if (name === 'class') {
      this._classList = new Set(value.split(/\s+/).filter(Boolean));
    }
    this.attrs[name] = value;
  }
  getAttribute(name) {
    return this.attrs[name] ?? null;
  }
  removeAttribute(name) {
    delete this.attrs[name];
    if (name === 'class') {
      this._classList.clear();
    }
  }
  appendChild(child) {
    if (child instanceof SSRTextNode) {
      this.children.push(child.text);
      this.childNodes.push(child);
      child.parentNode = this;
    } else if (child instanceof SSRDocumentFragment) {
      // Flatten fragment children
      for (const fragmentChild of child.childNodes) {
        if (fragmentChild instanceof SSRTextNode) {
          this.children.push(fragmentChild.text);
        } else if (fragmentChild instanceof SSRElement) {
          this.children.push(fragmentChild);
        }
        this.childNodes.push(fragmentChild);
        fragmentChild.parentNode = this;
      }
    } else {
      this.children.push(child);
      this.childNodes.push(child);
      child.parentNode = this;
    }
  }
  // Override to sync children array
  removeChild(child) {
    const result = super.removeChild(child);
    // Also remove from children array
    if (child instanceof SSRTextNode) {
      const textIndex = this.children.indexOf(child.text);
      if (textIndex !== -1) {
        this.children.splice(textIndex, 1);
      }
    } else if (child instanceof SSRElement) {
      const index = this.children.indexOf(child);
      if (index !== -1) {
        this.children.splice(index, 1);
      }
    }
    return result;
  }
  get classList() {
    const self = this;
    return {
      add(cls) {
        self._classList.add(cls);
        self.attrs.class = [...self._classList].join(' ');
      },
      remove(cls) {
        self._classList.delete(cls);
        const val = [...self._classList].join(' ');
        if (val) {
          self.attrs.class = val;
        } else {
          delete self.attrs.class;
        }
      },
    };
  }
  set className(value) {
    this._classList = new Set(value.split(/\s+/).filter(Boolean));
    if (value) {
      this.attrs.class = value;
    } else {
      delete this.attrs.class;
    }
  }
  get className() {
    return this.attrs.class ?? '';
  }
  set textContent(value) {
    this._textContent = value;
    this.children = value ? [value] : [];
    this.childNodes = [];
  }
  get textContent() {
    return this._textContent;
  }
  set innerHTML(value) {
    this._innerHTML = value;
    // Clear children when innerHTML is set
    this.children = value ? [value] : [];
    this.childNodes = [];
  }
  get innerHTML() {
    return this._innerHTML ?? '';
  }
  // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
  addEventListener(_event, _handler) {
    // No-op in SSR — event handlers are client-side only
  }
  // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
  removeEventListener(_event, _handler) {
    // No-op in SSR — event handlers are client-side only
  }
  /** Convert to a VNode tree for @vertz/ui-server */
  toVNode() {
    return {
      tag: this.tag,
      attrs: { ...this.attrs },
      children: this.children.map((child) => {
        if (typeof child === 'string') return child;
        return child.toVNode();
      }),
    };
  }
}
//# sourceMappingURL=ssr-element.js.map
