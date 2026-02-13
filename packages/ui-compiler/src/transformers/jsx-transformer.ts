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

    // Find ALL JSX nodes in the function body (not just return statements).
    // This handles JSX in variable assignments, for-loops, function arguments,
    // if-blocks, and any other imperative position.
    this.transformAllJsx(bodyNode, reactiveNames, jsxMap, source);
  }

  /**
   * Walk the full function body and transform every top-level JSX node.
   * "Top-level" means JSX that isn't nested inside other JSX (children are
   * handled recursively by transformJsxNode).
   */
  private transformAllJsx(
    node: Node,
    reactiveNames: Set<string>,
    jsxMap: Map<number, JsxExpressionInfo>,
    source: MagicString,
  ): void {
    // If this node is a JSX element/fragment, transform it and stop recursing
    // (children are handled by transformJsxNode internally).
    if (isJsxTopLevel(node)) {
      const transformed = transformJsxNode(node, reactiveNames, jsxMap, source);
      source.overwrite(node.getStart(), node.getEnd(), transformed);
      return;
    }

    // Otherwise recurse into children
    for (const child of node.getChildren()) {
      this.transformAllJsx(child, reactiveNames, jsxMap, source);
    }
  }
}

/**
 * Check if a node is a top-level JSX node (element, self-closing, or fragment).
 * Does NOT match ParenthesizedExpression — we want to recurse into parens
 * so we transform the inner JSX node directly (the parens stay).
 */
function isJsxTopLevel(node: Node): boolean {
  return (
    node.isKind(SyntaxKind.JsxElement) ||
    node.isKind(SyntaxKind.JsxSelfClosingElement) ||
    node.isKind(SyntaxKind.JsxFragment)
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

    // Check for conditional pattern (reactive ternary or logical AND)
    if (exprInfo?.reactive) {
      const conditionalCode = tryTransformConditional(exprNode, reactiveNames, jsxMap, source);
      if (conditionalCode) {
        return `${parentVar}.appendChild(${conditionalCode}.node)`;
      }

      const listCode = tryTransformList(exprNode, reactiveNames, jsxMap, parentVar, source);
      if (listCode) {
        return listCode;
      }
    }

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

/**
 * Try to transform a conditional expression (ternary or logical AND) into __conditional().
 * Returns the __conditional(...) call string if the expression matches, null otherwise.
 */
function tryTransformConditional(
  exprNode: Node,
  reactiveNames: Set<string>,
  jsxMap: Map<number, JsxExpressionInfo>,
  source: MagicString,
): string | null {
  // Ternary: condition ? trueExpr : falseExpr
  if (exprNode.isKind(SyntaxKind.ConditionalExpression)) {
    const condition = exprNode.getCondition();
    const whenTrue = exprNode.getWhenTrue();
    const whenFalse = exprNode.getWhenFalse();

    const condText = source.slice(condition.getStart(), condition.getEnd());
    const trueBranch = transformBranch(whenTrue, reactiveNames, jsxMap, source);
    const falseBranch = transformBranch(whenFalse, reactiveNames, jsxMap, source);

    return `__conditional(() => ${condText}, () => ${trueBranch}, () => ${falseBranch})`;
  }

  // Logical AND: condition && element
  if (
    exprNode.isKind(SyntaxKind.BinaryExpression) &&
    exprNode.getOperatorToken().getKind() === SyntaxKind.AmpersandAmpersandToken
  ) {
    const left = exprNode.getLeft();
    const right = exprNode.getRight();

    const condText = source.slice(left.getStart(), left.getEnd());
    const trueBranch = transformBranch(right, reactiveNames, jsxMap, source);

    return `__conditional(() => ${condText}, () => ${trueBranch}, () => null)`;
  }

  return null;
}

/**
 * Transform a conditional branch expression into a DOM-producing expression.
 * If the branch contains JSX, it's transformed into DOM helper calls.
 * Otherwise, the expression text (from MagicString) is used as-is.
 */
function transformBranch(
  node: Node,
  reactiveNames: Set<string>,
  jsxMap: Map<number, JsxExpressionInfo>,
  source: MagicString,
): string {
  if (
    node.isKind(SyntaxKind.JsxElement) ||
    node.isKind(SyntaxKind.JsxSelfClosingElement) ||
    node.isKind(SyntaxKind.JsxFragment)
  ) {
    return transformJsxNode(node, reactiveNames, jsxMap, source);
  }

  // For nested conditionals (ternary inside ternary)
  if (node.isKind(SyntaxKind.ConditionalExpression)) {
    const nested = tryTransformConditional(node, reactiveNames, jsxMap, source);
    if (nested) return `${nested}.node`;
  }

  // Fallback: use the text from MagicString
  return source.slice(node.getStart(), node.getEnd());
}

/**
 * Try to transform a .map() call into __list().
 * Returns the __list(...) statement string if the expression matches, null otherwise.
 *
 * Pattern: items.map(item => <Element ... />)  or  items.map((item) => <Element ... />)
 */
function tryTransformList(
  exprNode: Node,
  reactiveNames: Set<string>,
  jsxMap: Map<number, JsxExpressionInfo>,
  parentVar: string,
  source: MagicString,
): string | null {
  if (!exprNode.isKind(SyntaxKind.CallExpression)) return null;

  const propAccess = exprNode.getExpression();
  if (!propAccess.isKind(SyntaxKind.PropertyAccessExpression)) return null;

  const methodName = propAccess.getNameNode().getText();
  if (methodName !== 'map') return null;

  const args = exprNode.getArguments();
  if (args.length === 0) return null;

  const callbackArg = args[0];
  if (!callbackArg) return null;

  // Get the source object (e.g. "items" or "items.value")
  const sourceObj = propAccess.getExpression();
  const sourceObjText = source.slice(sourceObj.getStart(), sourceObj.getEnd());

  // Extract callback parameter name(s)
  let itemParam: string | null = null;
  let indexParam: string | null = null;
  let callbackBody: Node | null = null;

  if (callbackArg.isKind(SyntaxKind.ArrowFunction)) {
    const params = callbackArg.getParameters();
    itemParam = params[0]?.getName() ?? null;
    indexParam = params[1]?.getName() ?? null;

    // Get the body of the arrow function
    const body = callbackArg.getBody();
    callbackBody = body;
  }

  if (!itemParam || !callbackBody) return null;

  // Extract key function from the JSX element's key prop
  const keyFn = extractKeyFunction(callbackBody, itemParam, indexParam);

  // Build the render function
  const renderFn = buildListRenderFunction(callbackBody, itemParam, reactiveNames, jsxMap, source);

  return `__list(${parentVar}, () => ${sourceObjText}, ${keyFn}, ${renderFn})`;
}

/**
 * Extract a key function from the callback body.
 * Looks for a `key` prop on the outermost JSX element.
 * Falls back to index-based key if no key prop is found.
 */
function extractKeyFunction(
  callbackBody: Node,
  itemParam: string,
  indexParam: string | null,
): string {
  // The body might be the JSX element directly (arrow without block)
  const jsxNode = findJsxInBody(callbackBody);
  if (jsxNode) {
    const keyValue = extractKeyPropValue(jsxNode);
    if (keyValue) {
      return `(${itemParam}) => ${keyValue}`;
    }
  }

  // Fallback: use index if available, otherwise use a stringified item
  if (indexParam) {
    return `(_item, ${indexParam}) => ${indexParam}`;
  }
  return `(_item, __i) => __i`;
}

/**
 * Find the outermost JSX element in a callback body.
 */
function findJsxInBody(node: Node): Node | null {
  if (node.isKind(SyntaxKind.JsxElement) || node.isKind(SyntaxKind.JsxSelfClosingElement)) {
    return node;
  }
  if (node.isKind(SyntaxKind.Block)) {
    // Look for return statement
    const returnStmt = node.getFirstDescendantByKind(SyntaxKind.ReturnStatement);
    if (returnStmt) {
      const expr = returnStmt.getExpression();
      if (expr) return findJsxInBody(expr);
    }
  }
  if (node.isKind(SyntaxKind.ParenthesizedExpression)) {
    return findJsxInBody(node.getExpression());
  }
  return null;
}

/**
 * Extract the value of the `key` prop from a JSX element.
 * Returns the expression text (e.g. "item.id") or null if no key prop.
 */
function extractKeyPropValue(jsxNode: Node): string | null {
  const attrs = jsxNode.getDescendantsOfKind(SyntaxKind.JsxAttribute);
  for (const attr of attrs) {
    if (attr.getNameNode().getText() !== 'key') continue;
    const init = attr.getInitializer();
    if (!init) continue;
    if (init.isKind(SyntaxKind.JsxExpression)) {
      const expr = init.getExpression();
      if (expr) return expr.getText();
    }
    if (init.isKind(SyntaxKind.StringLiteral)) {
      return init.getText();
    }
  }
  return null;
}

/**
 * Build the render function for __list.
 * Transforms the JSX in the callback body into DOM helper calls.
 */
function buildListRenderFunction(
  callbackBody: Node,
  itemParam: string,
  reactiveNames: Set<string>,
  jsxMap: Map<number, JsxExpressionInfo>,
  source: MagicString,
): string {
  const jsxNode = findJsxInBody(callbackBody);
  if (jsxNode) {
    // Strip the key prop from the JSX before transforming
    const transformed = transformJsxNode(jsxNode, reactiveNames, jsxMap, source);
    return `(${itemParam}) => ${transformed}`;
  }

  // Fallback: use the body text
  const bodyText = source.slice(callbackBody.getStart(), callbackBody.getEnd());
  return `(${itemParam}) => ${bodyText}`;
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
