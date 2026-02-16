import { SyntaxKind } from 'ts-morph';
/** Find the function body Block node for a component using body position range. */
export function findBodyNode(sourceFile, component) {
  const allBlocks = sourceFile.getDescendantsOfKind(SyntaxKind.Block);
  for (const block of allBlocks) {
    if (block.getStart() === component.bodyStart && block.getEnd() === component.bodyEnd) {
      return block;
    }
  }
  return null;
}
//# sourceMappingURL=utils.js.map
