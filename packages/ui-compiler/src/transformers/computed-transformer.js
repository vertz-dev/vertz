import { SyntaxKind } from 'ts-morph';
import { findBodyNode } from '../utils';
/**
 * Transform `const x = expr` → `const x = computed(() => expr)` when classified as computed.
 * Also handles destructuring: `const { a, b } = expr` → individual computed declarations.
 */
export class ComputedTransformer {
  transform(source, sourceFile, component, variables) {
    const computeds = new Set(variables.filter((v) => v.kind === 'computed').map((v) => v.name));
    if (computeds.size === 0) return;
    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return;
    // IMPORTANT: Transform reads FIRST, then wrap declarations.
    // This ensures `.value` appended at the end of an initializer expression
    // comes before the closing `)` of `computed(() => ...)`.
    transformComputedReads(source, bodyNode, computeds);
    // Transform declarations
    for (const stmt of bodyNode.getChildSyntaxList()?.getChildren() ?? []) {
      if (!stmt.isKind(SyntaxKind.VariableStatement)) continue;
      const declList = stmt.getChildrenOfKind(SyntaxKind.VariableDeclarationList)[0];
      if (!declList) continue;
      for (const decl of declList.getDeclarations()) {
        const nameNode = decl.getNameNode();
        const init = decl.getInitializer();
        if (!init) continue;
        // Handle destructuring: const { name, age } = user
        if (nameNode.isKind(SyntaxKind.ObjectBindingPattern)) {
          const elements = nameNode.getElements();
          const computedElements = elements.filter((el) => computeds.has(el.getName()));
          if (computedElements.length > 0) {
            // For destructuring, use source.slice to pick up any .value transforms
            const initText = source.slice(init.getStart(), init.getEnd());
            const replacements = elements.map((el) => {
              const bindingName = el.getName();
              const propName = el.getPropertyNameNode()?.getText() ?? bindingName;
              if (computeds.has(bindingName)) {
                return `const ${bindingName} = computed(() => ${initText}.${propName})`;
              }
              return `const ${bindingName} = ${initText}.${propName}`;
            });
            source.overwrite(stmt.getStart(), stmt.getEnd(), `${replacements.join(';\n')};`);
          }
          continue;
        }
        // Regular computed: const total = expr → const total = computed(() => expr)
        const name = decl.getName();
        if (!computeds.has(name)) continue;
        source.appendLeft(init.getStart(), 'computed(() => ');
        source.appendRight(init.getEnd(), ')');
      }
    }
  }
}
function transformComputedReads(source, bodyNode, computeds) {
  bodyNode.forEachDescendant((node) => {
    if (!node.isKind(SyntaxKind.Identifier)) return;
    const name = node.getText();
    if (!computeds.has(name)) return;
    const parent = node.getParent();
    if (!parent) return;
    // Skip the name in a variable declaration
    if (parent.isKind(SyntaxKind.VariableDeclaration) && parent.getNameNode() === node) {
      return;
    }
    // Skip property access name (right side)
    if (parent.isKind(SyntaxKind.PropertyAccessExpression) && parent.getNameNode() === node) {
      return;
    }
    // Skip property name in object literals: { total: val }
    if (parent.isKind(SyntaxKind.PropertyAssignment) && parent.getNameNode() === node) {
      return;
    }
    // Skip shorthand property assignment: { total }
    if (parent.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
      return;
    }
    // Skip binding elements
    if (parent.isKind(SyntaxKind.BindingElement)) {
      return;
    }
    source.overwrite(node.getStart(), node.getEnd(), `${name}.value`);
  });
}
//# sourceMappingURL=computed-transformer.js.map
