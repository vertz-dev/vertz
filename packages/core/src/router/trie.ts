export interface MatchResult<T = unknown> {
  handler: T;
  params: Record<string, string>;
}

interface TrieNode<T> {
  staticChildren: Map<string, TrieNode<T>>;
  paramChild: { name: string; node: TrieNode<T> } | null;
  wildcardChild: TrieNode<T> | null;
  handlers: Map<string, T>;
}

function createNode<T>(): TrieNode<T> {
  return {
    staticChildren: new Map(),
    paramChild: null,
    wildcardChild: null,
    handlers: new Map(),
  };
}

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

export class Trie<T = unknown> {
  private root = createNode<T>();

  add(method: string, path: string, handler: T): void {
    const segments = splitPath(path);
    let node = this.root;

    for (const segment of segments) {
      node = this.resolveChild(node, segment);
    }

    node.handlers.set(method, handler);
  }

  match(method: string, path: string): MatchResult<T> | null {
    const segments = splitPath(path);
    return this.matchNode(this.root, segments, 0, method, {});
  }

  getAllowedMethods(path: string): string[] {
    const segments = splitPath(path);
    const node = this.findNode(this.root, segments, 0);
    if (!node) return [];
    return Array.from(node.handlers.keys());
  }

  private resolveChild(node: TrieNode<T>, segment: string): TrieNode<T> {
    if (segment === '*') {
      node.wildcardChild ??= createNode();
      return node.wildcardChild;
    }

    if (segment.startsWith(':')) {
      const name = segment.slice(1);
      if (!node.paramChild) {
        node.paramChild = { name, node: createNode() };
      } else if (node.paramChild.name !== name) {
        throw new Error(
          `Param name mismatch: existing ":${node.paramChild.name}" conflicts with ":${name}"`,
        );
      }
      return node.paramChild.node;
    }

    let child = node.staticChildren.get(segment);
    if (!child) {
      child = createNode();
      node.staticChildren.set(segment, child);
    }
    return child;
  }

  private findNode(node: TrieNode<T>, segments: string[], index: number): TrieNode<T> | null {
    if (index === segments.length) return node;

    const segment = segments[index];

    const staticChild = node.staticChildren.get(segment);
    if (staticChild) {
      const result = this.findNode(staticChild, segments, index + 1);
      if (result) return result;
    }

    if (node.paramChild) {
      const result = this.findNode(node.paramChild.node, segments, index + 1);
      if (result) return result;
    }

    if (node.wildcardChild) return node.wildcardChild;

    return null;
  }

  private matchNode(
    node: TrieNode<T>,
    segments: string[],
    index: number,
    method: string,
    params: Record<string, string>,
  ): MatchResult<T> | null {
    if (index === segments.length) {
      const handler = node.handlers.get(method);
      if (!handler) return null;
      return { handler, params: { ...params } };
    }

    const segment = segments[index];

    const staticChild = node.staticChildren.get(segment);
    if (staticChild) {
      const result = this.matchNode(staticChild, segments, index + 1, method, params);
      if (result) return result;
    }

    if (node.paramChild) {
      const result = this.matchNode(node.paramChild.node, segments, index + 1, method, {
        ...params,
        [node.paramChild.name]: segment,
      });
      if (result) return result;
    }

    if (node.wildcardChild) {
      const handler = node.wildcardChild.handlers.get(method);
      if (handler) {
        const rest = segments.slice(index).join('/');
        return { handler, params: { ...params, '*': rest } };
      }
    }

    return null;
  }
}
