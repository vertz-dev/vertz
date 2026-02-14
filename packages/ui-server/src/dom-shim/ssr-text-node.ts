import { SSRNode } from './ssr-node';

/**
 * SSR text node
 */
export class SSRTextNode extends SSRNode {
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
