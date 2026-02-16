import type { VNode } from '../types';
import { SSRDocumentFragment } from './ssr-fragment';
import { SSRNode } from './ssr-node';
import { SSRTextNode } from './ssr-text-node';
/**
 * A VNode-based element that supports basic DOM-like operations.
 */
export declare class SSRElement extends SSRNode {
  tag: string;
  attrs: Record<string, string>;
  children: (SSRElement | string)[];
  _classList: Set<string>;
  _textContent: string | null;
  _innerHTML: string | null;
  style: Record<string, any>;
  constructor(tag: string);
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  appendChild(child: SSRElement | SSRTextNode | SSRDocumentFragment): void;
  removeChild(child: SSRNode): SSRNode;
  get classList(): {
    add: (cls: string) => void;
    remove: (cls: string) => void;
  };
  set className(value: string);
  get className(): string;
  set textContent(value: string | null);
  get textContent(): string | null;
  set innerHTML(value: string);
  get innerHTML(): string;
  addEventListener(_event: string, _handler: any): void;
  removeEventListener(_event: string, _handler: any): void;
  /** Convert to a VNode tree for @vertz/ui-server */
  toVNode(): VNode;
}
//# sourceMappingURL=ssr-element.d.ts.map
