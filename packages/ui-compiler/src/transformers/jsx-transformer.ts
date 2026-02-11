import type MagicString from 'magic-string';
import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { ComponentInfo, JsxExpressionInfo, VariableInfo } from '../types';
import { findBodyNode } from '../utils';

let varCounter = 0;

function genVar(): string {
  return `__el${varCounter++}`;
}

function resetVarCounter(): void {
  varCounter = 0;
}

/**
 * Transform JSX into DOM helper calls.
 * Reactive expressions are wrapped in functions, static expressions are passed directly.
 *
 * IMPORTANT: This transformer reads expression text from MagicString (via source.slice())
 * so that it picks up .value transforms from the signal/computed transformers.
 */
export class JsxTransformer {
  transform(
    source: MagicString,
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
    jsxExpressions: JsxExpressionInfo[],
  ): void {
    resetVarCounter();

    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return;

    const reactiveNames = new Set(
      variables.filter((v) => v.kind === 'signal' || v.kind === 'computed').map((v) => v.name),
    );
    const jsxMap = new Map(jsxExpressions.map((e) => [e.start, e]));

    // Find return statements with JSX
    const returnStmts = bodyNode.getDescendantsOfKind(SyntaxKind.ReturnStatement);
    for (const ret of returnStmts) {
      const expr = ret.getExpression();
      if (!expr) continue;
      if (isJsx(expr)) {
        const transformed = transformJsxNode(expr, reactiveNames, jsxMap, source);
        source.overwrite(expr.getStart(), expr.getEnd(), transformed);
      }
    }
  }
}

function isJsx(node: Node): boolean {
  return (
    node.isKind(SyntaxKind.JsxElement) ||
    node.isKind(SyntaxKind.JsxSelfClosingElement) ||
    node.isKind(SyntaxKind.JsxFragment) ||
    (node.isKind(SyntaxKind.ParenthesizedExpression) && isJsx(node.getExpression()))
  );
}

function transformJsxNode(
  node: Node,
  reactiveNames: Set<string>,
  jsxMap: Map<number, JsxExpressionInfo>,
  source: MagicString,
): string {
  if (node.isKind(SyntaxKind.ParenthesizedExpression)) {
    return transformJsxNode(node.getExpression(), reactiveNames, jsxMap, source);
  }
  if (node.isKind(SyntaxKind.JsxElement)) {
    return transformJsxElement(node, reactiveNames, jsxMap, source);
  }
  if (node.isKind(SyntaxKind.JsxSelfClosingElement)) {
    return transformSelfClosingElement(node, reactiveNames, jsxMap, source);
  }
  if (node.isKind(SyntaxKind.JsxFragment)) {
    return transformFragment(node, reactiveNames, jsxMap, source);
  }
  if (node.isKind(SyntaxKind.JsxText)) {
    const text = node.getText().trim();
    if (!text) return '';
    return `document.createTextNode(${JSON.stringify(text)})`;
  }
  return node.getText();
}

function transformJsxElement(
  node: Node,
  reactiveNames: Set<string>,
  jsxMap: Map<number, JsxExpressionInfo>,
  source: MagicString,
): string {
  const openingElement = node.getFirstChildByKind(SyntaxKind.JsxOpeningElement);
  if (!openingElement) return node.getText();

  const tagName = openingElement.getTagNameNode().getText();
  const isComponent = /^[A-Z]/.test(tagName);

  if (isComponent) {
    const propsObj = buildPropsObject(openingElement, jsxMap, source);
    return `${tagName}(${propsObj})`;
  }

  const elVar = genVar();
  const statements: string[] = [];
  statements.push(`const ${elVar} = __element(${JSON.stringify(tagName)})`);

  // Process attributes
  const attrs = openingElement.getAttributes();
  for (const attr of attrs) {
    if (!attr.isKind(SyntaxKind.JsxAttribute)) continue;
    const attrStmt = processAttribute(attr, elVar, jsxMap, source);
    if (attrStmt) statements.push(attrStmt);
  }

  // Process children
  const children = getJsxChildren(node);
  for (const child of children) {
    const childCode = transformChild(child, reactiveNames, jsxMap, elVar, source);
    if (childCode) statements.push(childCode);
  }

  return `(() => {\n${statements.map((s) => `  ${s};`).join('\n')}\n  return ${elVar};\n})()`;
}

function transformSelfClosingElement(
  node: Node,
  _reactiveNames: Set<string>,
  jsxMap: Map<number, JsxExpressionInfo>,
  source: MagicString,
): string {
  if (!node.isKind(SyntaxKind.JsxSelfClosingElement)) return node.getText();

  const tagName = node.getTagNameNode().getText();
  const isComponent = /^[A-Z]/.test(tagName);

  if (isComponent) {
    const propsObj = buildPropsObject(node, jsxMap, source);
    return `${tagName}(${propsObj})`;
  }

  const elVar = genVar();
  const statements: string[] = [];
  statements.push(`const ${elVar} = __element(${JSON.stringify(tagName)})`);

  const attrs = node.getAttributes();
  for (const attr of attrs) {
    if (!attr.isKind(SyntaxKind.JsxAttribute)) continue;
    const attrStmt = processAttribute(attr, elVar, jsxMap, source);
    if (attrStmt) statements.push(attrStmt);
  }

  return `(() => {\n${statements.map((s) => `  ${s};`).join('\n')}\n  return ${elVar};\n})()`;
}

function transformFragment(
  node: Node,
  reactiveNames: Set<string>,
  jsxMap: Map<number, JsxExpressionInfo>,
  source: MagicString,
): string {
  const fragVar = genVar();
  const statements: string[] = [];
  statements.push(`const ${fragVar} = document.createDocumentFragment()`);

  const children = getJsxChildren(node);
  for (const child of children) {
    const childCode = transformChild(child, reactiveNames, jsxMap, fragVar, source);
    if (childCode) statements.push(childCode);
  }

  return `(() => {\n${statements.map((s) => `  ${s};`).join('\n')}\n  return ${fragVar};\n})()`;
}

function processAttribute(
  attr: Node,
  elVar: string,
  jsxMap: Map<number, JsxExpressionInfo>,
  source: MagicString,
): string | null {
  if (!attr.isKind(SyntaxKind.JsxAttribute)) return null;
  const attrName = attr.getNameNode().getText();
  const init = attr.getInitializer();
  if (!init) return null;

  // Event handlers: onClick → __on(el, "click", handler)
  if (attrName.startsWith('on') && attrName.length > 2) {
    const eventName = attrName[2]?.toLowerCase() + attrName.slice(3);
    if (init.isKind(SyntaxKind.JsxExpression)) {
      const exprNode = init.getExpression();
      // Read from MagicString to pick up transforms
      const handlerText = exprNode ? source.slice(exprNode.getStart(), exprNode.getEnd()) : '';
      return `__on(${elVar}, ${JSON.stringify(eventName)}, ${handlerText})`;
    }
    return null;
  }

  // String literal attribute
  if (init.isKind(SyntaxKind.StringLiteral)) {
    return `${elVar}.setAttribute(${JSON.stringify(attrName)}, ${init.getText()})`;
  }

  // Expression attribute
  if (init.isKind(SyntaxKind.JsxExpression)) {
    const exprInfo = jsxMap.get(init.getStart());
    const exprNode = init.getExpression();
    // Read from MagicString
    const exprText = exprNode ? source.slice(exprNode.getStart(), exprNode.getEnd()) : '';

    if (exprInfo?.reactive) {
      return `__attr(${elVar}, ${JSON.stringify(attrName)}, () => ${exprText})`;
    }
    return `${elVar}.setAttribute(${JSON.stringify(attrName)}, ${exprText})`;
  }

  return null;
}

function transformChild(
  child: Node,
  reactiveNames: Set<string>,
  jsxMap: Map<number, JsxExpressionInfo>,
  parentVar: string,
  source: MagicString,
): string | null {
  if (child.isKind(SyntaxKind.JsxText)) {
    const text = child.getText().trim();
    if (!text) return null;
    return `${parentVar}.appendChild(document.createTextNode(${JSON.stringify(text)}))`;
  }

  if (child.isKind(SyntaxKind.JsxExpression)) {
    const exprInfo = jsxMap.get(child.getStart());
    const exprNode = child.getExpression();
    if (!exprNode) return null;
    // Read from MagicString to pick up signal/computed .value transforms
    const exprText = source.slice(exprNode.getStart(), exprNode.getEnd());

    if (exprInfo?.reactive) {
      return `${parentVar}.appendChild(__text(() => ${exprText}))`;
    }
    return `${parentVar}.appendChild(document.createTextNode(String(${exprText})))`;
  }

  if (child.isKind(SyntaxKind.JsxElement) || child.isKind(SyntaxKind.JsxSelfClosingElement)) {
    const childCode = transformJsxNode(child, reactiveNames, jsxMap, source);
    return `${parentVar}.appendChild(${childCode})`;
  }

  return null;
}

function buildPropsObject(
  element: Node,
  jsxMap: Map<number, JsxExpressionInfo>,
  source: MagicString,
): string {
  const attrs = element.getDescendantsOfKind(SyntaxKind.JsxAttribute);
  if (attrs.length === 0) return '{}';

  const props: string[] = [];
  for (const attr of attrs) {
    const name = attr.getNameNode().getText();
    const init = attr.getInitializer();
    if (!init) {
      props.push(`${name}: true`);
      continue;
    }

    if (init.isKind(SyntaxKind.StringLiteral)) {
      props.push(`${name}: ${init.getText()}`);
      continue;
    }

    if (init.isKind(SyntaxKind.JsxExpression)) {
      const exprInfo = jsxMap.get(init.getStart());
      const exprNode = init.getExpression();
      // Read from MagicString
      const exprText = exprNode ? source.slice(exprNode.getStart(), exprNode.getEnd()) : '';

      if (exprInfo?.reactive) {
        props.push(`get ${name}() { return ${exprText}; }`);
      } else {
        props.push(`${name}: ${exprText}`);
      }
    }
  }

  return `{ ${props.join(', ')} }`;
}

/**
 * Get JSX children from a JsxElement node.
 * Children may be wrapped in a SyntaxList between opening/closing tags.
 */
function getJsxChildren(node: Node): Node[] {
  const children: Node[] = [];
  for (const child of node.getChildren()) {
    if (isJsxChild(child)) {
      children.push(child);
    } else if (child.isKind(SyntaxKind.SyntaxList)) {
      // JSX children are wrapped in a SyntaxList
      for (const grandchild of child.getChildren()) {
        if (isJsxChild(grandchild)) {
          children.push(grandchild);
        }
      }
    }
  }
  return children;
}

function isJsxChild(node: Node): boolean {
  return (
    node.isKind(SyntaxKind.JsxText) ||
    node.isKind(SyntaxKind.JsxExpression) ||
    node.isKind(SyntaxKind.JsxElement) ||
    node.isKind(SyntaxKind.JsxSelfClosingElement)
  );
}
