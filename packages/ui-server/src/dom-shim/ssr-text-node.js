import { SSRNode } from './ssr-node';
/**
 * SSR text node
 */
export class SSRTextNode extends SSRNode {
  text;
  constructor(text) {
    super();
    this.text = text;
  }
  // Alias for compatibility with browser Text nodes
  get data() {
    return this.text;
  }
  set data(value) {
    this.text = value;
  }
}
//# sourceMappingURL=ssr-text-node.js.map
