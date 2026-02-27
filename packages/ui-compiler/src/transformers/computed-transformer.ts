import type MagicString from 'magic-string';
import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { ComponentInfo, VariableInfo } from '../types';
import { findBodyNode } from '../utils';

/**
 * Transform `const x = expr` → `const x = computed(() => expr)` when classified as computed.
 * Also handles destructuring: `const { a, b } = expr` → individual computed declarations.
 */
export class ComputedTransformer {
  transform(
    source: MagicString,
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
  ): void {
    const computeds = new Set(variables.filter((v) => v.kind === 'computed').map((v) => v.name));
    if (computeds.size === 0) return;

    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return;

    // Build lookup maps for destructuredFrom bindings
    const destructuredFromMap = new Map<string, string>();
    const syntheticVarInfo = new Map<string, VariableInfo>();
    for (const v of variables) {
      if (v.destructuredFrom) {
        destructuredFromMap.set(v.name, v.destructuredFrom);
      }
      if (v.name.startsWith('__') && v.signalProperties) {
        syntheticVarInfo.set(v.name, v);
      }
    }

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

          // Check if this is a destructured signal API (any element has destructuredFrom)
          const firstBindingName = elements[0]?.getName();
          const syntheticName = firstBindingName
            ? destructuredFromMap.get(firstBindingName)
            : undefined;

          if (syntheticName) {
            // Signal API destructuring: emit synthetic var + individual bindings
            const initText = source.slice(init.getStart(), init.getEnd());
            const synthetic = syntheticVarInfo.get(syntheticName);
            const signalProps = synthetic?.signalProperties ?? new Set<string>();

            const lines: string[] = [];
            lines.push(`const ${syntheticName} = ${initText}`);
            for (const el of elements) {
              const bindingName = el.getName();
              const propName = el.getPropertyNameNode()?.getText() ?? bindingName;
              if (computeds.has(bindingName) && signalProps.has(propName)) {
                lines.push(
                  `const ${bindingName} = computed(() => ${syntheticName}.${propName}.value)`,
                );
              } else {
                lines.push(`const ${bindingName} = ${syntheticName}.${propName}`);
              }
            }
            source.overwrite(stmt.getStart(), stmt.getEnd(), `${lines.join(';\n')};`);
            continue;
          }

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

function transformComputedReads(source: MagicString, bodyNode: Node, computeds: Set<string>): void {
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
