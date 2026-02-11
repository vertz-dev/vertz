import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { ComponentInfo, MutationInfo, VariableInfo } from '../types';
import { findBodyNode } from '../utils';

/** Set of known array/object mutation methods. */
const MUTATION_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
]);

/**
 * Detect in-place mutations on signal variables.
 * These need special treatment: peek() + notify() pattern.
 */
export class MutationAnalyzer {
  analyze(
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
  ): MutationInfo[] {
    const signalNames = new Set(variables.filter((v) => v.kind === 'signal').map((v) => v.name));

    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return [];

    const mutations: MutationInfo[] = [];

    bodyNode.forEachDescendant((node) => {
      // Method calls: items.push(), items.splice(), etc.
      if (node.isKind(SyntaxKind.CallExpression)) {
        const expr = node.getExpression();
        if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
          const objName = getRootIdentifier(expr.getExpression());
          const methodName = expr.getName();
          if (objName && signalNames.has(objName) && MUTATION_METHODS.has(methodName)) {
            mutations.push({
              variableName: objName,
              kind: 'method-call',
              start: node.getStart(),
              end: node.getEnd(),
            });
          }

          // Object.assign(user, ...)
          const obj = expr.getExpression();
          const method = expr.getName();
          if (
            obj.isKind(SyntaxKind.Identifier) &&
            obj.getText() === 'Object' &&
            method === 'assign'
          ) {
            const args = node.getArguments();
            const firstArg = args[0];
            if (firstArg) {
              if (firstArg.isKind(SyntaxKind.Identifier) && signalNames.has(firstArg.getText())) {
                mutations.push({
                  variableName: firstArg.getText(),
                  kind: 'object-assign',
                  start: node.getStart(),
                  end: node.getEnd(),
                });
              }
            }
          }
        }
      }

      // Property assignment: user.name = "Bob"
      if (node.isKind(SyntaxKind.BinaryExpression)) {
        const left = node.getLeft();
        const opKind = node.getOperatorToken().getKind();
        if (
          opKind === SyntaxKind.EqualsToken ||
          opKind === SyntaxKind.PlusEqualsToken ||
          opKind === SyntaxKind.MinusEqualsToken
        ) {
          if (left.isKind(SyntaxKind.PropertyAccessExpression)) {
            const rootName = getRootIdentifier(left.getExpression());
            if (rootName && signalNames.has(rootName)) {
              mutations.push({
                variableName: rootName,
                kind: 'property-assignment',
                start: node.getStart(),
                end: node.getEnd(),
              });
            }
          }
          if (left.isKind(SyntaxKind.ElementAccessExpression)) {
            const rootName = getRootIdentifier(left.getExpression());
            if (rootName && signalNames.has(rootName)) {
              mutations.push({
                variableName: rootName,
                kind: 'index-assignment',
                start: node.getStart(),
                end: node.getEnd(),
              });
            }
          }
        }
      }

      // Delete expression: delete config.debug
      if (node.isKind(SyntaxKind.DeleteExpression)) {
        const expr = node.getExpression();
        if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
          const rootName = getRootIdentifier(expr.getExpression());
          if (rootName && signalNames.has(rootName)) {
            mutations.push({
              variableName: rootName,
              kind: 'delete',
              start: node.getStart(),
              end: node.getEnd(),
            });
          }
        }
      }
    });

    return mutations;
  }
}

function getRootIdentifier(node: Node): string | null {
  if (node.isKind(SyntaxKind.Identifier)) return node.getText();
  if (node.isKind(SyntaxKind.PropertyAccessExpression)) {
    return getRootIdentifier(node.getExpression());
  }
  return null;
}
