/**
 * Minimal DOM shim for SSR.
 * 
 * Provides document.createElement, .createTextNode, .appendChild, etc.
 * that produce VNode-compatible objects. This allows existing @vertz/ui
 * components to work in SSR without modification.
 * 
 * IMPORTANT: This must be imported before any component code.
 */

import type { VNode } from '@vertz/ui-server';

/** Base Node class for SSR — matches the browser's Node interface minimally */
class SSRNode {
  childNodes: SSRNode[] = [];
  parentNode: SSRNode | null = null;
  
  get firstChild(): SSRNode | null {
    return this.childNodes[0] ?? null;
  }
  
  get nextSibling(): SSRNode | null {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] ?? null;
  }
  
  removeChild(child: SSRNode): SSRNode {
    const index = this.childNodes.indexOf(child);
    if (index !== -1) {
      this.childNodes.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }
  
  insertBefore(newNode: SSRNode, referenceNode: SSRNode | null): SSRNode {
    if (!referenceNode) {
      // Append to end
      this.childNodes.push(newNode);
      newNode.parentNode = this;
    } else {
      const index = this.childNodes.indexOf(referenceNode);
      if (index !== -1) {
        this.childNodes.splice(index, 0, newNode);
        newNode.parentNode = this;
      }
    }
    return newNode;
  }
  
  replaceChild(newNode: SSRNode, oldNode: SSRNode): SSRNode {
    const index = this.childNodes.indexOf(oldNode);
    if (index !== -1) {
      this.childNodes[index] = newNode;
      newNode.parentNode = this;
      oldNode.parentNode = null;
    }
    return oldNode;
  }
}

/** Proxy-based CSSStyleDeclaration shim */
function createStyleProxy(element: SSRElement): Record<string, any> {
  const styles: Record<string, string> = {};
  
  return new Proxy(styles, {
    set(_target, prop, value) {
      if (typeof prop === 'string') {
        // Convert camelCase to kebab-case
        const kebab = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
        styles[prop] = value;
        // Update the style attribute on the element
        const pairs = Object.entries(styles)
          .map(([k, v]) => {
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

/** A VNode-based element that supports basic DOM-like operations. */
class SSRElement extends SSRNode {
  tag: string;
  attrs: Record<string, string> = {};
  children: (SSRElement | string)[] = [];
  _classList: Set<string> = new Set();
  _textContent: string | null = null;
  _innerHTML: string | null = null;
  style: Record<string, any>;
  
  constructor(tag: string) {
    super();
    this.tag = tag;
    this.style = createStyleProxy(this);
  }
  
  setAttribute(name: string, value: string): void {
    if (name === 'class') {
      this._classList = new Set(value.split(/\s+/).filter(Boolean));
    }
    this.attrs[name] = value;
  }
  
  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
  
  removeAttribute(name: string): void {
    delete this.attrs[name];
    if (name === 'class') {
      this._classList.clear();
    }
  }
  
  appendChild(child: SSRElement | SSRTextNode | SSRDocumentFragment): void {
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
  removeChild(child: SSRNode): SSRNode {
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
  
  get classList(): { add: (cls: string) => void; remove: (cls: string) => void } {
    const self = this;
    return {
      add(cls: string) {
        self._classList.add(cls);
        self.attrs.class = [...self._classList].join(' ');
      },
      remove(cls: string) {
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
  
  set className(value: string) {
    this._classList = new Set(value.split(/\s+/).filter(Boolean));
    if (value) {
      this.attrs.class = value;
    } else {
      delete this.attrs.class;
    }
  }
  
  get className(): string {
    return this.attrs.class ?? '';
  }
  
  set textContent(value: string | null) {
    this._textContent = value;
    this.children = value ? [value] : [];
    this.childNodes = [];
  }
  
  get textContent(): string | null {
    return this._textContent;
  }
  
  set innerHTML(value: string) {
    this._innerHTML = value;
    // Clear children when innerHTML is set
    this.children = value ? [value] : [];
    this.childNodes = [];
  }
  
  get innerHTML(): string {
    return this._innerHTML ?? '';
  }
  
  addEventListener(_event: string, _handler: any): void {
    // No-op in SSR — event handlers are client-side only
  }
  
  removeEventListener(_event: string, _handler: any): void {
    // No-op in SSR — event handlers are client-side only
  }
  
  /** Convert to a VNode tree for @vertz/ui-server */
  toVNode(): VNode {
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

/** SSR text node */
class SSRTextNode extends SSRNode {
  text: string;
  constructor(text: string) {
    super();
    this.text = text;
  }
  
  // Alias for compatibility with browser Text nodes
  get data(): string {
    return this.text;
  }
  
  set data(value: string) {
    this.text = value;
  }
}

/** SSR document fragment */
class SSRDocumentFragment extends SSRNode {
  children: (SSRElement | string)[] = [];
  
  appendChild(child: SSRElement | SSRTextNode | SSRDocumentFragment): void {
    if (child instanceof SSRTextNode) {
      this.children.push(child.text);
      this.childNodes.push(child);
      child.parentNode = this;
    } else if (child instanceof SSRDocumentFragment) {
      this.children.push(...child.children);
      this.childNodes.push(...child.childNodes);
      for (const fragmentChild of child.childNodes) {
        fragmentChild.parentNode = this;
      }
    } else {
      this.children.push(child);
      this.childNodes.push(child);
      child.parentNode = this;
    }
  }
}

/** Create and install the DOM shim */
export function installDomShim(): void {
  // In a real browser, the document will have a proper doctype and won't be Happy-DOM
  // Check for Happy-DOM or other test environments by looking for __SSR_URL__ global
  // If __SSR_URL__ is set, we ALWAYS want to install our shim, even if document exists
  const isSSRContext = typeof (globalThis as any).__SSR_URL__ !== 'undefined';
  
  if (typeof document !== 'undefined' && !isSSRContext) {
    return; // Already in a real browser, don't override
  }
  
  const fakeDocument = {
    createElement(tag: string): SSRElement {
      return new SSRElement(tag);
    },
    createTextNode(text: string): SSRTextNode {
      return new SSRTextNode(text);
    },
    createComment(text: string): SSRTextNode {
      // Comments are rendered as text nodes in SSR (they're stripped anyway)
      return new SSRTextNode(`<!-- ${text} -->`);
    },
    createDocumentFragment(): SSRDocumentFragment {
      return new SSRDocumentFragment();
    },
    // Stub for document properties that may be accessed
    head: new SSRElement('head'),
    body: new SSRElement('body'),
    // Note: do NOT include startViewTransition — code checks 'in' operator
  };
  
  (globalThis as any).document = fakeDocument;
  
  // Provide a minimal window shim if not present
  if (typeof window === 'undefined') {
    (globalThis as any).window = {
      location: { pathname: (globalThis as any).__SSR_URL__ || '/' },
      addEventListener: () => {},
      removeEventListener: () => {},
      history: {
        pushState: () => {},
        replaceState: () => {},
      },
    };
  } else {
    // CRITICAL FIX: Update window.location.pathname even if window already exists
    // This handles module caching where router.ts was already loaded but we're
    // rendering a different URL
    (globalThis as any).window.location = {
      ...((globalThis as any).window.location || {}),
      pathname: (globalThis as any).__SSR_URL__ || '/',
    };
  }
  
  // Provide global DOM constructors for instanceof checks
  (globalThis as any).Node = SSRNode;
  (globalThis as any).HTMLElement = SSRElement;
  (globalThis as any).HTMLAnchorElement = SSRElement;
  (globalThis as any).HTMLDivElement = SSRElement;
  (globalThis as any).HTMLInputElement = SSRElement;
  (globalThis as any).HTMLButtonElement = SSRElement;
  (globalThis as any).HTMLSelectElement = SSRElement;
  (globalThis as any).HTMLTextAreaElement = SSRElement;
  (globalThis as any).DocumentFragment = SSRDocumentFragment;
  (globalThis as any).MouseEvent = class MockMouseEvent {};
  (globalThis as any).Event = class MockEvent {};
}

/** Remove the DOM shim */
export function removeDomShim(): void {
  const globals = [
    'document', 'window', 'Node', 'HTMLElement', 'HTMLAnchorElement', 'HTMLDivElement',
    'HTMLInputElement', 'HTMLButtonElement', 'HTMLSelectElement', 'HTMLTextAreaElement',
    'DocumentFragment', 'MouseEvent', 'Event',
  ];
  for (const g of globals) {
    delete (globalThis as any)[g];
  }
}

/** Convert an SSRElement to a VNode */
export function toVNode(element: any): VNode {
  if (element instanceof SSRElement) {
    return element.toVNode();
  }
  if (element instanceof SSRDocumentFragment) {
    return {
      tag: 'fragment',
      attrs: {},
      children: element.children.map((child) => {
        if (typeof child === 'string') return child;
        return child.toVNode();
      }),
    };
  }
  // Already a VNode
  if (typeof element === 'object' && 'tag' in element) {
    return element as VNode;
  }
  return { tag: 'span', attrs: {}, children: [String(element)] };
}

export { SSRElement, SSRTextNode, SSRDocumentFragment };
