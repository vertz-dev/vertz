import type { RenderAdapter, RenderElement, RenderNode, RenderText } from '@vertz/ui/internals';
import { NativeElement, NativeTextNode } from './native-element';

/**
 * Create a native render adapter that produces NativeElement/NativeTextNode
 * instances instead of DOM nodes.
 *
 * This is the bridge between @vertz/ui's compiler output and the native
 * scene graph. Set it via `setAdapter(createNativeAdapter())` to make
 * Vertz components render into the native tree.
 */
export function createNativeAdapter(): RenderAdapter {
  return {
    createElement(tag: string): RenderElement {
      return new NativeElement(tag);
    },

    createElementNS(_ns: string, tag: string): RenderElement {
      // Namespaces (SVG, MathML) are irrelevant for native rendering.
      // Create a regular NativeElement; the renderer maps tags to draw calls.
      return new NativeElement(tag);
    },

    createTextNode(text: string): RenderText {
      return new NativeTextNode(text);
    },

    createComment(_text: string): RenderNode {
      // Comments are used as placeholders by the framework (conditional rendering).
      // In native, they're invisible nodes that participate in the tree.
      return new NativeElement('__comment');
    },

    createDocumentFragment(): RenderNode {
      return new NativeElement('__fragment');
    },

    isNode(value: unknown): value is RenderNode {
      return value instanceof NativeElement || value instanceof NativeTextNode;
    },
  };
}
