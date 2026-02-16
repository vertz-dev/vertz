import { SSRNode } from './ssr-node';
import { SSRTextNode } from './ssr-text-node';
/**
 * SSR document fragment
 */
export class SSRDocumentFragment extends SSRNode {
  children = [];
  appendChild(child) {
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
//# sourceMappingURL=ssr-fragment.js.map
