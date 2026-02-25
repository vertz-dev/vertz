import { SSRNode } from './ssr-node';

/**
 * SSR comment node — serialized as `<!-- text -->` in HTML output.
 *
 * Used by __conditional to emit anchor comment nodes that the client-side
 * hydration cursor can claim during mount.
 */
export class SSRComment extends SSRNode {
  text: string;

  constructor(text: string) {
    super();
    this.text = text;
  }

  get data(): string {
    return this.text;
  }

  set data(value: string) {
    this.text = value;
  }
}
