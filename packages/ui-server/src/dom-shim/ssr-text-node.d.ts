import { SSRNode } from './ssr-node';
/**
 * SSR text node
 */
export declare class SSRTextNode extends SSRNode {
  text: string;
  constructor(text: string);
  get data(): string;
  set data(value: string);
}
//# sourceMappingURL=ssr-text-node.d.ts.map
