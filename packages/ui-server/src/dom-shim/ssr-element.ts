import { __styleStr } from '@vertz/ui/internals';
import { rawHtml, type VNode } from '../types';
import { SSRComment } from './ssr-comment';
import { SSRDocumentFragment } from './ssr-fragment';
import { SSRNode } from './ssr-node';
import { SSRTextNode } from './ssr-text-node';

/**
 * Convert camelCase to kebab-case: "testValue" → "test-value"
 */
function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/**
 * Convert kebab-case to camelCase: "test-value" → "testValue"
 */
function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Proxy-based DOMStringMap shim for el.dataset
 */
function createDatasetProxy(element: SSRElement): DOMStringMap {
  return new Proxy({} as DOMStringMap, {
    set(_target, prop, value) {
      if (typeof prop === 'string') {
        element.setAttribute(`data-${camelToKebab(prop)}`, String(value));
      }
      return true;
    },
    get(_target, prop) {
      if (typeof prop === 'string') {
        return element.getAttribute(`data-${camelToKebab(prop)}`) ?? undefined;
      }
      return undefined;
    },
    has(_target, prop) {
      if (typeof prop === 'string') {
        return element.getAttribute(`data-${camelToKebab(prop)}`) !== null;
      }
      return false;
    },
    deleteProperty(_target, prop) {
      if (typeof prop === 'string') {
        element.removeAttribute(`data-${camelToKebab(prop)}`);
      }
      return true;
    },
    ownKeys() {
      return Object.keys(element.attrs)
        .filter((k) => k.startsWith('data-'))
        .map((k) => kebabToCamel(k.slice(5)));
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === 'string') {
        const val = element.getAttribute(`data-${camelToKebab(prop)}`);
        if (val !== null) {
          return { configurable: true, enumerable: true, value: val };
        }
      }
      return undefined;
    },
  });
}

/**
 * Proxy-based CSSStyleDeclaration shim
 */
// biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
function createStyleProxy(element: SSRElement): { display: string; [key: string]: any } {
  const styles: Record<string, string> = {};

  // The Proxy's get handler returns '' for any missing property, so `display`
  // always exists at runtime. The cast is safe — it just tells TS about the
  // Proxy's dynamic behavior.
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
  }) as { display: string; [key: string]: string };
}

/**
 * A VNode-based element that supports basic DOM-like operations.
 */
export class SSRElement extends SSRNode {
  tag: string;
  attrs: Record<string, string> = {};
  children: (SSRElement | SSRComment | string)[] = [];
  _classList: Set<string> = new Set();
  _textContent: string | null = null;
  _innerHTML: string | null = null;
  // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
  style: { display: string; [key: string]: any };
  dataset: DOMStringMap;

  constructor(tag: string) {
    super();
    this.tag = tag;
    this.style = createStyleProxy(this);
    this.dataset = createDatasetProxy(this);
  }

  // biome-ignore lint/suspicious/noExplicitAny: accepts string or style object
  setAttribute(name: string, value: string | Record<string, any>): void {
    if (name === 'style' && typeof value === 'object' && value !== null) {
      // Convert object to CSS string and populate the style proxy's internal map
      this.attrs.style = __styleStr(value as Record<string, string | number>);
      for (const [k, v] of Object.entries(value)) {
        if (v != null) this.style[k] = String(v);
      }
      return;
    }
    // Map className → class (JSX convention → DOM attribute)
    const attrName = name === 'className' ? 'class' : name;
    if (attrName === 'class') {
      this._classList = new Set((value as string).split(/\s+/).filter(Boolean));
    }
    this.attrs[attrName] = value as string;
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

  appendChild(child: SSRElement | SSRTextNode | SSRComment | SSRDocumentFragment): void {
    if (child instanceof SSRComment) {
      this.children.push(child);
      this.childNodes.push(child);
      child.parentNode = this;
    } else if (child instanceof SSRTextNode) {
      this.children.push(child.text);
      this.childNodes.push(child);
      child.parentNode = this;
    } else if (child instanceof SSRDocumentFragment) {
      // Flatten fragment children
      for (const fragmentChild of child.childNodes) {
        if (fragmentChild instanceof SSRComment) {
          this.children.push(fragmentChild);
        } else if (fragmentChild instanceof SSRTextNode) {
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

  // Override insertBefore to sync children array (used by __list and __conditional during SSR)
  insertBefore(newNode: SSRNode, referenceNode: SSRNode | null): SSRNode {
    // Capture reference index BEFORE super modifies childNodes
    const refIdx = referenceNode ? this._findChildIndex(referenceNode) : -1;
    const result = super.insertBefore(newNode, referenceNode);

    if (newNode instanceof SSRDocumentFragment) {
      const fragmentChildren: (SSRElement | SSRComment | string)[] = [];
      for (const fc of newNode.childNodes) {
        if (fc instanceof SSRComment) fragmentChildren.push(fc);
        else if (fc instanceof SSRTextNode) fragmentChildren.push(fc.text);
        else if (fc instanceof SSRElement) fragmentChildren.push(fc);
      }
      if (!referenceNode || refIdx === -1) {
        this.children.push(...fragmentChildren);
      } else {
        this.children.splice(refIdx, 0, ...fragmentChildren);
      }
    } else {
      const child: SSRElement | SSRComment | string | null =
        newNode instanceof SSRComment
          ? newNode
          : newNode instanceof SSRTextNode
            ? newNode.text
            : newNode instanceof SSRElement
              ? newNode
              : null;
      if (child != null) {
        if (!referenceNode || refIdx === -1) {
          this.children.push(child);
        } else {
          this.children.splice(refIdx, 0, child);
        }
      }
    }
    return result;
  }

  // Override replaceChild to sync children array
  replaceChild(newNode: SSRNode, oldNode: SSRNode): SSRNode {
    // Capture old index BEFORE super modifies childNodes
    const oldIdx = this._findChildIndex(oldNode);
    const result = super.replaceChild(newNode, oldNode);
    if (oldIdx !== -1) {
      const newChild: SSRElement | SSRComment | string | null =
        newNode instanceof SSRComment
          ? newNode
          : newNode instanceof SSRTextNode
            ? newNode.text
            : newNode instanceof SSRElement
              ? newNode
              : null;
      if (newChild != null) {
        this.children[oldIdx] = newChild;
      } else {
        this.children.splice(oldIdx, 1);
      }
    }
    return result;
  }

  /** Find a node's index in the children array via childNodes identity lookup. */
  private _findChildIndex(node: SSRNode): number {
    // Use childNodes (which stores actual node references) for identity-based
    // lookup. The children and childNodes arrays are maintained in parallel,
    // so the index is the same. This avoids the bug where indexOf(node.text)
    // returns the wrong index when multiple text nodes have identical content.
    return this.childNodes.indexOf(node);
  }

  // Override to sync children array
  removeChild(child: SSRNode): SSRNode {
    // Find the index BEFORE super.removeChild() modifies childNodes,
    // since _findChildIndex uses childNodes for identity lookup.
    const idx = this._findChildIndex(child);
    const result = super.removeChild(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
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

  // ---------------------------------------------------------------------------
  // Reflecting IDL properties — setting these mirrors to HTML attributes
  // so they appear in SSR output via toVNode(). Browsers do this natively;
  // the SSR shim must replicate it for properties that theme components set
  // directly (e.g. el.placeholder = "...", el.type = "...").
  // ---------------------------------------------------------------------------

  get placeholder(): string {
    return this.attrs.placeholder ?? '';
  }
  set placeholder(value: string) {
    this.attrs.placeholder = value;
  }

  get type(): string {
    return this.attrs.type ?? '';
  }
  set type(value: string) {
    this.attrs.type = value;
  }

  get name(): string {
    return this.attrs.name ?? '';
  }
  set name(value: string) {
    this.attrs.name = value;
  }

  get value(): string {
    return this.attrs.value ?? '';
  }
  set value(value: string) {
    this.attrs.value = value;
  }

  get src(): string {
    return this.attrs.src ?? '';
  }
  set src(value: string) {
    this.attrs.src = value;
  }

  get alt(): string {
    return this.attrs.alt ?? '';
  }
  set alt(value: string) {
    this.attrs.alt = value;
  }

  get htmlFor(): string {
    return this.attrs.for ?? '';
  }
  set htmlFor(value: string) {
    this.attrs.for = value;
  }

  get disabled(): boolean {
    return 'disabled' in this.attrs;
  }
  set disabled(value: boolean) {
    if (value) {
      this.attrs.disabled = '';
    } else {
      delete this.attrs.disabled;
    }
  }

  get checked(): boolean {
    return 'checked' in this.attrs;
  }
  set checked(value: boolean) {
    if (value) {
      this.attrs.checked = '';
    } else {
      delete this.attrs.checked;
    }
  }

  get rows(): number {
    return Number(this.attrs.rows) || 0;
  }
  set rows(value: number) {
    this.attrs.rows = String(value);
  }

  get scope(): string {
    return this.attrs.scope ?? '';
  }
  set scope(value: string) {
    this.attrs.scope = value;
  }

  get href(): string {
    return this.attrs.href ?? '';
  }
  set href(value: string) {
    this.attrs.href = value;
  }

  // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
  addEventListener(_event: string, _handler: any): void {
    // No-op in SSR — event handlers are client-side only
  }

  // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
  removeEventListener(_event: string, _handler: any): void {
    // No-op in SSR — event handlers are client-side only
  }

  /** Convert to a VNode tree for @vertz/ui-server */
  toVNode(): VNode {
    return {
      tag: this.tag,
      attrs: { ...this.attrs },
      children: this.children.map((child) => {
        // innerHTML content is trusted markup — emit as raw HTML to avoid escaping
        if (typeof child === 'string') {
          return this._innerHTML != null ? rawHtml(child) : child;
        }
        if (child instanceof SSRComment) return rawHtml(`<!--${child.text}-->`);
        if (typeof child.toVNode === 'function') return child.toVNode();
        // Fallback: stringify non-SSRElement children (e.g. plain objects)
        return String(child);
      }),
    };
  }
}
