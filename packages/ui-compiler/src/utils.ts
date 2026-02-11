import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { ComponentInfo } from './types';

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
