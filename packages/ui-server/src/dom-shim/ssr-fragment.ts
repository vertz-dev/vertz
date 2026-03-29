import { SSRComment } from './ssr-comment';
import type { SSRElement } from './ssr-element';
import { SSRNode } from './ssr-node';
import { SSRTextNode } from './ssr-text-node';

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
    if (child instanceof SSRTextNode) {
      this.children.push(child.text);
      this.childNodes.push(child);
      child.parentNode = this;
    } else if (child instanceof SSRDocumentFragment) {
      // Flatten fragment children — mirrors real DOM behavior where
      // fragment.appendChild(otherFragment) moves children, not the fragment.
      // Use childNodes (not children) as source of truth since insertBefore
      // may have added nodes only to childNodes in the child fragment.
      for (const fc of child.childNodes) {
        if (fc instanceof SSRComment) this.children.push(fc);
        else if (fc instanceof SSRTextNode) this.children.push(fc.text);
        else this.children.push(fc as SSRElement);
        this.childNodes.push(fc);
        fc.parentNode = this;
      }
    } else if (child instanceof SSRComment) {
      this.children.push(child);
      this.childNodes.push(child);
      child.parentNode = this;
    } else {
      this.children.push(child);
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
    // Find insertion index via childNodes before mutation
    const refIdx = referenceNode ? this.childNodes.indexOf(referenceNode) : -1;

    if (newNode instanceof SSRDocumentFragment) {
      // Flatten fragment children — mirrors real DOM behavior
      const fragmentChildren: (SSRElement | SSRComment | string)[] = [];
      for (const fc of newNode.childNodes) {
        if (fc instanceof SSRComment) fragmentChildren.push(fc);
        else if (fc instanceof SSRTextNode) fragmentChildren.push(fc.text);
        else fragmentChildren.push(fc as SSRElement);
      }
      if (!referenceNode || refIdx === -1) {
        this.children.push(...fragmentChildren);
        this.childNodes.push(...newNode.childNodes);
      } else {
        this.children.splice(refIdx, 0, ...fragmentChildren);
        this.childNodes.splice(refIdx, 0, ...newNode.childNodes);
      }
      for (const fc of newNode.childNodes) {
        fc.parentNode = this;
      }
    } else {
      // Map SSRNode subclasses to the children array type.
      // The only concrete subclass that reaches the else branch (not SSRComment,
      // not SSRTextNode, not SSRDocumentFragment) is SSRElement.
      let child: SSRElement | SSRComment | string | null = null;
      if (newNode instanceof SSRComment) {
        child = newNode;
      } else if (newNode instanceof SSRTextNode) {
        child = newNode.text;
      } else {
        // SSRElement — direct cast is safe here since all other
        // SSRNode subclasses are handled above or in the fragment branch.
        child = newNode as SSRElement;
      }

      if (!referenceNode || refIdx === -1) {
        if (child != null) this.children.push(child);
        this.childNodes.push(newNode);
      } else {
        if (child != null) this.children.splice(refIdx, 0, child);
        this.childNodes.splice(refIdx, 0, newNode);
      }
      newNode.parentNode = this;
    }

    return newNode;
  }
}
