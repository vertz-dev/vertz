/**
 * Base Node class for SSR — matches the browser's Node interface minimally
 */
export class SSRNode {
  /** Node type constants — match browser's Node interface */
  static readonly ELEMENT_NODE = 1;
  static readonly TEXT_NODE = 3;
  static readonly COMMENT_NODE = 8;
  static readonly DOCUMENT_FRAGMENT_NODE = 11;

  /** Instance nodeType — subclasses override */
  readonly nodeType: number = 0;

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
