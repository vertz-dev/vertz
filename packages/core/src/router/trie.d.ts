export interface MatchResult<T = unknown> {
  handler: T;
  params: Record<string, string>;
}
export declare class Trie<T = unknown> {
  private root;
  add(method: string, path: string, handler: T): void;
  match(method: string, path: string): MatchResult<T> | null;
  getAllowedMethods(path: string): string[];
  private resolveChild;
  private findNode;
  private matchNode;
}
//# sourceMappingURL=trie.d.ts.map
