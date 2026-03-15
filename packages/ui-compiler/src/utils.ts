import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { ComponentInfo } from './types';

const VALID_IDENTIFIER_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/** Quote a property name if it's not a valid JS identifier (e.g. hyphenated names). */
export function quoteIfNeeded(name: string): string {
  return VALID_IDENTIFIER_RE.test(name) ? name : JSON.stringify(name);
}

/** Find the function body Block node for a component using body position range. */
export function findBodyNode(sourceFile: SourceFile, component: ComponentInfo): Node | null {
  const allBlocks = sourceFile.getDescendantsOfKind(SyntaxKind.Block);
  for (const block of allBlocks) {
    if (block.getStart() === component.bodyStart && block.getEnd() === component.bodyEnd) {
      return block;
    }
  }
  return null;
}
