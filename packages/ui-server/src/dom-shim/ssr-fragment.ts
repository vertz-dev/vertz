import { SSRComment } from './ssr-comment';
import type { SSRElement } from './ssr-element';
import { SSRNode } from './ssr-node';
import { SSRTextNode } from './ssr-text-node';

/**
 * Convert an SSRNode to the children array entry type.
 * SSRTextNode → string, SSRComment → SSRComment, everything else → SSRElement.
 */
function toChildEntry(node: SSRNode): SSRElement | SSRComment | string {
  if (node instanceof SSRComment) return node;
  if (node instanceof SSRTextNode) return node.text;
  return node as SSRElement;
}

/**
 * SSR document fragment.
 *
 * Maintains both `children` (used by toVNode for serialization) and
 * `childNodes` (used by SSRElement.appendChild for fragment flattening)
 * in sync. All mutation methods must update both arrays.
 */
export class SSRDocumentFragment extends SSRNode {
  override nodeType = 11; // DOCUMENT_FRAGMENT_NODE
  children: (SSRElement | SSRComment | string)[] = [];

  appendChild(child: SSRElement | SSRTextNode | SSRComment | SSRDocumentFragment): void {
    if (child instanceof SSRDocumentFragment) {
      // Flatten fragment children — mirrors real DOM behavior where
      // fragment.appendChild(otherFragment) moves children, not the fragment.
      // Use childNodes (not children) as source of truth since insertBefore
      // may have added nodes only to childNodes in the child fragment.
      for (const fc of child.childNodes) {
        this.children.push(toChildEntry(fc));
        this.childNodes.push(fc);
        fc.parentNode = this;
      }
    } else {
      this.children.push(toChildEntry(child));
      this.childNodes.push(child);
      child.parentNode = this;
    }
  }

  /**
   * Override insertBefore to keep `children` in sync with `childNodes`.
   * The base SSRNode.insertBefore only updates `childNodes`, which causes
   * comment markers to be lost when fragments are serialized via toVNode
   * (which reads `children`).
   */
  override insertBefore(newNode: SSRNode, referenceNode: SSRNode | null): SSRNode {
    if (!referenceNode) {
      // Append to end — matches base class behavior
      if (newNode instanceof SSRDocumentFragment) {
        for (const fc of newNode.childNodes) {
          this.children.push(toChildEntry(fc));
          this.childNodes.push(fc);
          fc.parentNode = this;
        }
      } else {
        this.children.push(toChildEntry(newNode));
        this.childNodes.push(newNode);
        newNode.parentNode = this;
      }
      return newNode;
    }

    const refIdx = this.childNodes.indexOf(referenceNode);
    if (refIdx === -1) {
      // Reference not found — do nothing (matches base SSRNode behavior)
      return newNode;
    }

    if (newNode instanceof SSRDocumentFragment) {
      // Flatten fragment children at the reference position
      const entries: (SSRElement | SSRComment | string)[] = [];
      for (const fc of newNode.childNodes) {
        entries.push(toChildEntry(fc));
        fc.parentNode = this;
      }
      this.children.splice(refIdx, 0, ...entries);
      this.childNodes.splice(refIdx, 0, ...newNode.childNodes);
    } else {
      this.children.splice(refIdx, 0, toChildEntry(newNode));
      this.childNodes.splice(refIdx, 0, newNode);
      newNode.parentNode = this;
    }

    return newNode;
  }

  /**
   * Override removeChild to keep `children` in sync with `childNodes`.
   */
  override removeChild(child: SSRNode): SSRNode {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
    }
    return super.removeChild(child);
  }

  /**
   * Override replaceChild to keep `children` in sync with `childNodes`.
   */
  override replaceChild(newNode: SSRNode, oldNode: SSRNode): SSRNode {
    const idx = this.childNodes.indexOf(oldNode);
    const result = super.replaceChild(newNode, oldNode);
    if (idx !== -1) {
      if (newNode instanceof SSRDocumentFragment) {
        // Replace single entry with flattened fragment children
        const entries: (SSRElement | SSRComment | string)[] = [];
        for (const fc of newNode.childNodes) {
          entries.push(toChildEntry(fc));
        }
        this.children.splice(idx, 1, ...entries);
      } else {
        this.children[idx] = toChildEntry(newNode);
      }
    }
    return result;
  }
}
