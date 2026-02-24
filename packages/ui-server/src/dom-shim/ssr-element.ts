import type { VNode } from '../types';
import { SSRDocumentFragment } from './ssr-fragment';
import { SSRNode } from './ssr-node';
import { SSRTextNode } from './ssr-text-node';

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
  children: (SSRElement | string)[] = [];
  _classList: Set<string> = new Set();
  _textContent: string | null = null;
  _innerHTML: string | null = null;
  // biome-ignore lint/suspicious/noExplicitAny: SSR DOM shim requires dynamic typing
  style: { display: string; [key: string]: any };

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

  // Override insertBefore to sync children array (used by __list and __conditional during SSR)
  insertBefore(newNode: SSRNode, referenceNode: SSRNode | null): SSRNode {
    const result = super.insertBefore(newNode, referenceNode);

    if (newNode instanceof SSRDocumentFragment) {
      const fragmentChildren: (SSRElement | string)[] = [];
      for (const fc of newNode.childNodes) {
        if (fc instanceof SSRTextNode) fragmentChildren.push(fc.text);
        else if (fc instanceof SSRElement) fragmentChildren.push(fc);
      }
      if (!referenceNode) {
        this.children.push(...fragmentChildren);
      } else {
        const refIdx = this._findChildIndex(referenceNode);
        if (refIdx !== -1) {
          this.children.splice(refIdx, 0, ...fragmentChildren);
        } else {
          this.children.push(...fragmentChildren);
        }
      }
    } else {
      const child =
        newNode instanceof SSRTextNode
          ? newNode.text
          : newNode instanceof SSRElement
            ? newNode
            : null;
      if (child != null) {
        if (!referenceNode) {
          this.children.push(child);
        } else {
          const refIdx = this._findChildIndex(referenceNode);
          if (refIdx !== -1) {
            this.children.splice(refIdx, 0, child);
          } else {
            this.children.push(child);
          }
        }
      }
    }
    return result;
  }

  // Override replaceChild to sync children array
  replaceChild(newNode: SSRNode, oldNode: SSRNode): SSRNode {
    const result = super.replaceChild(newNode, oldNode);
    const oldIdx = this._findChildIndex(oldNode);
    if (oldIdx !== -1) {
      const newChild =
        newNode instanceof SSRTextNode
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

  /** Find a node's index in the children array (handles text/element types). */
  private _findChildIndex(node: SSRNode): number {
    if (node instanceof SSRTextNode) {
      return this.children.indexOf(node.text);
    }
    if (node instanceof SSRElement) {
      return this.children.indexOf(node);
    }
    return -1;
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
        if (typeof child === 'string') return child;
        if (typeof child.toVNode === 'function') return child.toVNode();
        // Fallback: stringify non-SSRElement children (e.g. plain objects)
        return String(child);
      }),
    };
  }
}
