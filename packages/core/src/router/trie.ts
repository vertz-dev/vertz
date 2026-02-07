export type RouteHandler = (...args: any[]) => any;

export interface MatchResult {
  handler: RouteHandler;
  params: Record<string, string>;
}

interface TrieNode {
  staticChildren: Map<string, TrieNode>;
  paramChild: { name: string; node: TrieNode } | null;
  wildcardChild: TrieNode | null;
  handlers: Map<string, RouteHandler>;
}

function createNode(): TrieNode {
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

export class Trie {
  private root = createNode();

  add(method: string, path: string, handler: RouteHandler): void {
    const segments = splitPath(path);
    let node = this.root;

    for (const segment of segments) {
      node = this.resolveChild(node, segment);
    }

    node.handlers.set(method, handler);
  }

  match(method: string, path: string): MatchResult | null {
    const segments = splitPath(path);
    return this.matchNode(this.root, segments, 0, method, {});
  }

  getAllowedMethods(path: string): string[] {
    const segments = splitPath(path);
    const node = this.findNode(this.root, segments, 0);
    if (!node) return [];
    return Array.from(node.handlers.keys());
  }

  private resolveChild(node: TrieNode, segment: string): TrieNode {
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

    if (!node.staticChildren.has(segment)) {
      node.staticChildren.set(segment, createNode());
    }
    return node.staticChildren.get(segment)!;
  }

  private findNode(node: TrieNode, segments: string[], index: number): TrieNode | null {
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
    node: TrieNode,
    segments: string[],
    index: number,
    method: string,
    params: Record<string, string>,
  ): MatchResult | null {
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
