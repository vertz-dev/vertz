import type MagicString from 'magic-string';
import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import { ComponentAnalyzer } from '../analyzers/component-analyzer';
import type { ComponentInfo } from '../types';
import { findBodyNode } from '../utils';

/**
 * Marks interactive components with `data-v-id` hydration markers.
 *
 * A component is "interactive" if it contains `let` variable declarations
 * (reactive state) in its body. Static components (only `const` or no state)
 * are skipped and ship zero JS.
 *
 * For interactive components, the root JSX element's opening tag is augmented
 * with `data-v-id="ComponentName"`.
 */
export class HydrationTransformer {
  transform(s: MagicString, sourceFile: SourceFile): void {
    const componentAnalyzer = new ComponentAnalyzer();
    const components = componentAnalyzer.analyze(sourceFile);

    for (const component of components) {
      if (this._isInteractive(sourceFile, component)) {
        this._addHydrationMarker(s, sourceFile, component);
      }
    }
  }

  /**
   * Determine whether a component is interactive by checking for `let`
   * declarations in the component body.
   */
  private _isInteractive(sourceFile: SourceFile, component: ComponentInfo): boolean {
    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return false;

    // Check for let declarations in the component body
    for (const stmt of bodyNode.getChildSyntaxList()?.getChildren() ?? []) {
      if (!stmt.isKind(SyntaxKind.VariableStatement)) continue;
      const declList = stmt.getChildrenOfKind(SyntaxKind.VariableDeclarationList)[0];
      if (!declList) continue;

      if (declList.getText().startsWith('let ')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find the root JSX element in the component's return statement
   * and inject `data-v-id` attribute into its opening tag.
   */
  private _addHydrationMarker(
    s: MagicString,
    sourceFile: SourceFile,
    component: ComponentInfo,
  ): void {
    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return;

    // Find the return statement's JSX element
    const returnStmts = bodyNode.getDescendantsOfKind(SyntaxKind.ReturnStatement);
    for (const ret of returnStmts) {
      const expr = ret.getExpression();
      if (!expr) continue;

      const rootJsx = this._findRootJsx(expr);
      if (rootJsx) {
        this._injectAttribute(s, rootJsx, component.name);
        return;
      }
    }

    // Handle arrow functions with expression body (no return statement)
    const arrowBodies = sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction);
    for (const arrow of arrowBodies) {
      const body = arrow.getBody();
      if (body.getStart() === component.bodyStart && body.getEnd() === component.bodyEnd) {
        // Expression body arrow
        const rootJsx = this._findRootJsx(body);
        if (rootJsx) {
          this._injectAttribute(s, rootJsx, component.name);
          return;
        }
      }
    }
  }

  private _findRootJsx(node: Node): Node | null {
    if (node.isKind(SyntaxKind.JsxElement) || node.isKind(SyntaxKind.JsxSelfClosingElement)) {
      return node;
    }

    if (node.isKind(SyntaxKind.ParenthesizedExpression)) {
      const inner = node.getExpression();
      return this._findRootJsx(inner);
    }

    for (const child of node.getChildren()) {
      const found = this._findRootJsx(child);
      if (found) return found;
    }

    return null;
  }

  private _injectAttribute(s: MagicString, jsxNode: Node, componentName: string): void {
    if (jsxNode.isKind(SyntaxKind.JsxSelfClosingElement)) {
      // <div /> -> <div data-v-id="Name" />
      const tagName = jsxNode.getChildrenOfKind(SyntaxKind.Identifier)[0];
      if (tagName) {
        const insertPos = tagName.getEnd();
        s.appendLeft(insertPos, ` data-v-id="${componentName}"`);
      }
    } else if (jsxNode.isKind(SyntaxKind.JsxElement)) {
      // <div> -> <div data-v-id="Name">
      const openingElement = jsxNode.getChildrenOfKind(SyntaxKind.JsxOpeningElement)[0];
      if (openingElement) {
        // Find the tag name identifier in the opening element
        const tagName = openingElement.getChildrenOfKind(SyntaxKind.Identifier)[0];
        if (tagName) {
          const insertPos = tagName.getEnd();
          s.appendLeft(insertPos, ` data-v-id="${componentName}"`);
        }
      }
    }
  }
}
