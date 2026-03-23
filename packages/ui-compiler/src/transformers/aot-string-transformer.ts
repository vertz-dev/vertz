import type MagicString from 'magic-string';
import type { Node } from 'ts-morph';
import { type SourceFile, SyntaxKind } from 'ts-morph';
import type { AotComponentInfo, AotTier, ComponentInfo, VariableInfo } from '../types';
import { findBodyNode } from '../utils';

/** Get node as a generic Node to avoid ts-morph's over-narrowing. */
function asNode(n: unknown): Node {
  return n as Node;
}

/** Set of HTML void elements that must not have closing tags. */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** Set of raw text elements whose children must not be HTML-escaped. */
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

/** Check if a tag name refers to a component (starts with uppercase). */
function isComponentTag(tagName: string): boolean {
  return (
    tagName.length > 0 &&
    tagName[0] === tagName[0]!.toUpperCase() &&
    tagName[0] !== tagName[0]!.toLowerCase()
  );
}

/**
 * Transforms component JSX into AOT string-builder functions for SSR.
 *
 * Instead of generating DOM helper calls (__element, __child, __attr),
 * this transformer produces string concatenation code that builds HTML
 * directly — no DOM shim, no virtual DOM, no serialization pass.
 */
export class AotStringTransformer {
  private _components: AotComponentInfo[] = [];

  get components(): AotComponentInfo[] {
    return this._components;
  }

  transform(
    s: MagicString,
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
  ): void {
    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return;

    // Find the return statement's JSX
    const returnJsx = this._findReturnJsx(bodyNode);
    if (!returnJsx) return;

    // Determine tier based on variables and JSX analysis
    const tier = this._classifyTier(returnJsx, variables);

    // Check if component is interactive (has let declarations)
    const isInteractive = this._isInteractive(sourceFile, component);

    // Build the string expression for the JSX tree
    const stringExpr = this._jsxToString(
      returnJsx,
      variables,
      s,
      isInteractive ? component.name : null,
    );

    // Generate the AOT function with props parameter
    const aotFnName = `__ssr_${component.name}`;
    const propsParam = component.propsParam;
    const paramStr = propsParam ? `${propsParam}` : '';
    const aotFn = `\nfunction ${aotFnName}(${paramStr}): string {\n  return ${stringExpr};\n}\n`;

    // Append the AOT function after the component
    s.appendRight(component.bodyEnd + 1, aotFn);

    this._components.push({
      name: component.name,
      tier,
      holes: [],
    });
  }

  private _findReturnJsx(bodyNode: Node): Node | null {
    const returnStmts = bodyNode.getDescendantsOfKind(SyntaxKind.ReturnStatement);
    for (const ret of returnStmts) {
      const expr = ret.getExpression();
      if (!expr) continue;
      const jsx = this._findJsx(expr);
      if (jsx) return jsx;
    }
    return null;
  }

  private _findJsx(node: Node): Node | null {
    if (
      node.isKind(SyntaxKind.JsxElement) ||
      node.isKind(SyntaxKind.JsxSelfClosingElement) ||
      node.isKind(SyntaxKind.JsxFragment)
    ) {
      return node;
    }
    if (node.isKind(SyntaxKind.ParenthesizedExpression)) {
      return this._findJsx(node.getExpression());
    }
    return null;
  }

  private _isInteractive(sourceFile: SourceFile, component: ComponentInfo): boolean {
    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return false;

    for (const stmt of bodyNode.getChildSyntaxList()?.getChildren() ?? []) {
      if (!stmt.isKind(SyntaxKind.VariableStatement)) continue;
      const declList = stmt.getChildrenOfKind(SyntaxKind.VariableDeclarationList)[0];
      if (!declList) continue;
      if (declList.getText().startsWith('let ')) return true;
    }
    return false;
  }

  private _classifyTier(jsxNode: Node, variables: VariableInfo[]): AotTier {
    const hasReactive = variables.some((v) => v.kind === 'signal' || v.kind === 'computed');
    const hasExpressions = jsxNode.getDescendantsOfKind(SyntaxKind.JsxExpression).length > 0;

    if (!hasExpressions && !hasReactive) return 'static';

    // Check for conditionals or lists
    const exprs = jsxNode.getDescendantsOfKind(SyntaxKind.JsxExpression);
    for (const expr of exprs) {
      const inner = expr.getExpression();
      if (!inner) continue;
      if (
        inner.isKind(SyntaxKind.ConditionalExpression) ||
        inner.isKind(SyntaxKind.BinaryExpression)
      ) {
        return 'conditional';
      }
      if (inner.isKind(SyntaxKind.CallExpression)) {
        const text = inner.getText();
        if (text.includes('.map(')) return 'conditional';
      }
    }

    return 'data-driven';
  }

  private _jsxToString(
    node: Node,
    variables: VariableInfo[],
    s: MagicString,
    hydrationId: string | null,
  ): string {
    if (node.isKind(SyntaxKind.JsxElement)) {
      return this._elementToString(node, variables, s, hydrationId);
    }
    if (node.isKind(SyntaxKind.JsxSelfClosingElement)) {
      return this._selfClosingToString(node, variables, s, hydrationId);
    }
    if (node.isKind(SyntaxKind.JsxFragment)) {
      return this._fragmentToString(node, variables, s);
    }
    return "''";
  }

  private _elementToString(
    node: Node,
    variables: VariableInfo[],
    s: MagicString,
    hydrationId: string | null,
  ): string {
    const openingElement = node.getChildrenOfKind(SyntaxKind.JsxOpeningElement)[0];
    if (!openingElement) return "''";

    const tagName = this._getTagName(openingElement);

    // Component reference → function call
    if (isComponentTag(tagName)) {
      return this._componentCallToString(tagName, openingElement, node, variables, s);
    }

    const isVoid = VOID_ELEMENTS.has(tagName);
    const isRawText = RAW_TEXT_ELEMENTS.has(tagName);

    const attrs = this._attrsToString(openingElement, variables, s);
    const hydrationAttr = hydrationId ? ` data-v-id="${hydrationId}"` : '';
    const attrStr = attrs ? ' ' + attrs + hydrationAttr : hydrationAttr;

    if (isVoid) {
      return `'<${tagName}${attrStr}>'`;
    }

    const children = this._childrenToString(node, variables, isRawText, s);

    return `'<${tagName}${attrStr}>' + ${children} + '</${tagName}>'`;
  }

  private _selfClosingToString(
    node: Node,
    variables: VariableInfo[],
    s: MagicString,
    hydrationId: string | null,
  ): string {
    const tagName = this._getTagName(node);

    // Component reference → function call
    if (isComponentTag(tagName)) {
      return this._componentCallToString(tagName, node, null, variables, s);
    }

    const isVoid = VOID_ELEMENTS.has(tagName);
    const attrs = this._attrsToString(node, variables, s);
    const hydrationAttr = hydrationId ? ` data-v-id="${hydrationId}"` : '';
    const attrStr = attrs ? ' ' + attrs + hydrationAttr : hydrationAttr;

    if (isVoid) {
      return `'<${tagName}${attrStr}>'`;
    }

    return `'<${tagName}${attrStr}></${tagName}>'`;
  }

  private _componentCallToString(
    tagName: string,
    openingOrSelfClosing: Node,
    parentElement: Node | null,
    _variables: VariableInfo[],
    s: MagicString,
  ): string {
    // Build props object from attributes
    const propsEntries: string[] = [];
    const attrs = openingOrSelfClosing.getChildrenOfKind(SyntaxKind.JsxAttributes)[0];
    if (attrs) {
      const syntaxList = attrs.getChildrenOfKind(SyntaxKind.SyntaxList)[0];
      const attrNodes = syntaxList ? syntaxList.getChildren() : attrs.getChildren();

      for (const attr of attrNodes) {
        if (attr.isKind(SyntaxKind.JsxAttribute)) {
          const nameNode = attr.getChildrenOfKind(SyntaxKind.Identifier)[0];
          if (!nameNode) continue;
          const name = nameNode.getText();

          const stringLiteral = attr.getChildrenOfKind(SyntaxKind.StringLiteral)[0];
          const jsxExpr = attr.getChildrenOfKind(SyntaxKind.JsxExpression)[0];

          if (stringLiteral) {
            propsEntries.push(`${name}: ${stringLiteral.getText()}`);
          } else if (jsxExpr) {
            const expr = jsxExpr.getExpression();
            if (expr) {
              const exprText = s.slice(expr.getStart(), expr.getEnd());
              propsEntries.push(`${name}: ${exprText}`);
            }
          } else {
            // Boolean prop: <Badge active />
            propsEntries.push(`${name}: true`);
          }
        } else if (attr.isKind(SyntaxKind.JsxSpreadAttribute)) {
          // JsxSpreadAttribute: {...expr} — get the expression (3rd child: { ... EXPR })
          const spreadExpr = asNode(attr.getChildren()[2]);
          if (spreadExpr && spreadExpr.getKind() !== SyntaxKind.CloseBraceToken) {
            const exprText = s.slice(spreadExpr.getStart(), spreadExpr.getEnd());
            propsEntries.push(`...${exprText}`);
          }
        }
      }
    }

    // Handle children prop
    if (parentElement) {
      const children = this._getJsxChildren(parentElement);
      if (children.length > 0) {
        const childParts = children.map((child) => this._childToString(child, [], false, s));
        propsEntries.push(`children: ${childParts.join(' + ')}`);
      }
    }

    const propsStr = propsEntries.length > 0 ? `{ ${propsEntries.join(', ')} }` : '{}';
    return `__ssr_${tagName}(${propsStr})`;
  }

  private _fragmentToString(node: Node, variables: VariableInfo[], s: MagicString): string {
    const children = this._getJsxChildren(node);
    if (children.length === 0) return "''";

    const parts = children.map((child) => this._childToString(child, variables, false, s));
    return parts.join(' + ');
  }

  private _getTagName(node: Node): string {
    const identifier = node.getChildrenOfKind(SyntaxKind.Identifier)[0];
    return identifier?.getText() ?? 'div';
  }

  private _attrsToString(node: Node, variables: VariableInfo[], s: MagicString): string {
    const attrs = node.getChildrenOfKind(SyntaxKind.JsxAttributes)[0];
    if (!attrs) return '';

    const parts: string[] = [];
    const syntaxList = attrs.getChildrenOfKind(SyntaxKind.SyntaxList)[0];
    const attrNodes = syntaxList ? syntaxList.getChildren() : attrs.getChildren();

    for (const attr of attrNodes) {
      if (attr.isKind(SyntaxKind.JsxAttribute)) {
        const attrResult = this._attrToString(attr, variables, s);
        if (attrResult) parts.push(attrResult);
      } else if (attr.isKind(SyntaxKind.JsxSpreadAttribute)) {
        const spreadExpr = asNode(attr.getChildren()[2]);
        if (spreadExpr && spreadExpr.getKind() !== SyntaxKind.CloseBraceToken) {
          const exprText = s.slice(spreadExpr.getStart(), spreadExpr.getEnd());
          parts.push(`' + __ssr_spread(${exprText}) + '`);
        }
      }
    }
    return parts.join(' ');
  }

  private _attrToString(attr: Node, _variables: VariableInfo[], s: MagicString): string | null {
    const nameNode = attr.getChildrenOfKind(SyntaxKind.Identifier)[0];
    if (!nameNode) return null;

    let name = nameNode.getText();

    // Skip event handlers
    if (name.startsWith('on') && name.length > 2 && name[2] === name[2]!.toUpperCase()) {
      return null;
    }

    // Prop aliasing
    if (name === 'className') name = 'class';
    if (name === 'htmlFor') name = 'for';

    const initializer = attr.getChildrenOfKind(SyntaxKind.JsxExpression)[0];
    const stringLiteral = attr.getChildrenOfKind(SyntaxKind.StringLiteral)[0];

    if (stringLiteral) {
      const value = stringLiteral.getLiteralText();
      return `${name}="${value}"`;
    }

    if (initializer) {
      const expr = initializer.getExpression();
      if (!expr) {
        return name;
      }
      const exprText = s.slice(expr.getStart(), expr.getEnd());
      return `${name}="' + __esc_attr(${exprText}) + '"`;
    }

    return name;
  }

  private _childrenToString(
    node: Node,
    variables: VariableInfo[],
    isRawText: boolean,
    s: MagicString,
  ): string {
    const children = this._getJsxChildren(node);
    if (children.length === 0) return "''";

    const parts = children.map((child) => this._childToString(child, variables, isRawText, s));
    return parts.join(' + ');
  }

  private _getJsxChildren(node: Node): Node[] {
    const syntaxList = node.getChildrenOfKind(SyntaxKind.SyntaxList)[0];
    if (!syntaxList) return [];

    return syntaxList
      .getChildren()
      .filter(
        (child) =>
          child.isKind(SyntaxKind.JsxElement) ||
          child.isKind(SyntaxKind.JsxSelfClosingElement) ||
          child.isKind(SyntaxKind.JsxText) ||
          child.isKind(SyntaxKind.JsxExpression) ||
          child.isKind(SyntaxKind.JsxFragment),
      );
  }

  private _childToString(
    child: Node,
    variables: VariableInfo[],
    isRawText: boolean,
    s: MagicString,
  ): string {
    if (child.isKind(SyntaxKind.JsxText)) {
      const text = child.getText();
      const cleaned = this._cleanJsxText(text);
      if (!cleaned) return "''";
      return `'${this._escapeStringLiteral(cleaned)}'`;
    }

    if (child.isKind(SyntaxKind.JsxExpression)) {
      return this._jsxExpressionToString(child, variables, isRawText, s);
    }

    if (
      child.isKind(SyntaxKind.JsxElement) ||
      child.isKind(SyntaxKind.JsxSelfClosingElement) ||
      child.isKind(SyntaxKind.JsxFragment)
    ) {
      return this._jsxToString(child, variables, s, null);
    }

    return "''";
  }

  /**
   * Handle a JSX expression child: {expr}
   *
   * Special handling for:
   * - Ternary with JSX branches → inline ternary with string conversion
   * - && with JSX consequence → inline conditional
   * - .map() with JSX callback → .map().join('')
   * - Simple expressions → __esc(expr)
   */
  private _jsxExpressionToString(
    jsxExpr: Node,
    variables: VariableInfo[],
    isRawText: boolean,
    s: MagicString,
  ): string {
    // JsxExpression children: { expr } — the expression is the 2nd child (index 1)
    const exprChild = jsxExpr.getChildren()[1];
    const expr = exprChild ? asNode(exprChild) : null;
    if (!expr || expr.getKind() === SyntaxKind.CloseBraceToken) return "''";

    // Ternary: cond ? <A /> : <B />
    if (expr.isKind(SyntaxKind.ConditionalExpression)) {
      return this._ternaryToString(expr, variables, s);
    }

    // Binary: expr && <A />
    if (expr.isKind(SyntaxKind.BinaryExpression)) {
      return this._binaryToString(expr, variables, s);
    }

    // .map() call: items.map(item => <Li />)
    if (expr.isKind(SyntaxKind.CallExpression) && expr.getText().includes('.map(')) {
      return this._mapCallToString(expr, variables, s);
    }

    // Simple expression
    const exprText = s.slice(expr.getStart(), expr.getEnd());
    if (isRawText) {
      return `String(${exprText})`;
    }
    return `__esc(${exprText})`;
  }

  private _ternaryToString(expr: Node, variables: VariableInfo[], s: MagicString): string {
    // ConditionalExpression has: condition, QuestionToken, whenTrue, ColonToken, whenFalse
    const children = expr.getChildren();
    const condition = children[0];
    const whenTrue = children[2];
    const whenFalse = children[4];

    if (!condition || !whenTrue || !whenFalse) {
      return `__esc(${s.slice(expr.getStart(), expr.getEnd())})`;
    }

    const condText = s.slice(condition.getStart(), condition.getEnd());
    const trueStr = this._expressionNodeToString(whenTrue, variables, s);
    const falseStr = this._expressionNodeToString(whenFalse, variables, s);

    return `(${condText} ? ${trueStr} : ${falseStr})`;
  }

  private _binaryToString(expr: Node, variables: VariableInfo[], s: MagicString): string {
    const children = expr.getChildren();
    const left = children[0];
    const operator = children[1];
    const right = children[2];

    if (!left || !operator || !right) {
      return `__esc(${s.slice(expr.getStart(), expr.getEnd())})`;
    }

    const opText = operator.getText();

    // Handle && operator: expr && <JSX />
    if (opText === '&&') {
      const leftText = s.slice(left.getStart(), left.getEnd());
      const rightStr = this._expressionNodeToString(right, variables, s);
      return `(${leftText} ? ${rightStr} : '')`;
    }

    // For other binary operators, fall back to __esc
    return `__esc(${s.slice(expr.getStart(), expr.getEnd())})`;
  }

  private _mapCallToString(expr: Node, variables: VariableInfo[], s: MagicString): string {
    // CallExpression: obj.map(callback)
    // We need to transform the JSX inside the callback to string concatenation
    // For now, rewrite the callback to use AOT rendering

    // Find the arrow function inside .map()
    const args = expr.getChildrenOfKind(SyntaxKind.SyntaxList);
    // The arguments are in the second SyntaxList (after the type arguments)
    const argList = args.length > 1 ? args[1] : args[0];
    if (!argList) return `__esc(${s.slice(expr.getStart(), expr.getEnd())})`;

    const callback = argList
      .getChildren()
      .find((c) => c.isKind(SyntaxKind.ArrowFunction) || c.isKind(SyntaxKind.FunctionExpression));

    if (!callback) {
      // No inline callback found — fall back to raw expression
      return `__esc(${s.slice(expr.getStart(), expr.getEnd())})`;
    }

    // Get the caller (e.g., items)
    const callExpr = expr.getChildren()[0]; // PropertyAccessExpression: items.map
    if (!callExpr) return `__esc(${s.slice(expr.getStart(), expr.getEnd())})`;

    // Get the object being mapped (e.g., items in items.map)
    let callerText: string;
    if (callExpr.isKind(SyntaxKind.PropertyAccessExpression)) {
      const obj = callExpr.getChildren()[0];
      if (obj) {
        callerText = s.slice(obj.getStart(), obj.getEnd());
      } else {
        callerText = s.slice(callExpr.getStart(), callExpr.getEnd());
      }
    } else {
      callerText = s.slice(callExpr.getStart(), callExpr.getEnd());
    }

    // Get callback parameter name
    let paramName: string;
    if (callback.isKind(SyntaxKind.ArrowFunction)) {
      const params = callback.getParameters();
      paramName = params[0]?.getName() ?? '_item';
    } else {
      paramName = '_item';
    }

    // Get callback body JSX
    const body = callback.isKind(SyntaxKind.ArrowFunction) ? callback.getBody() : null;
    if (!body) return `__esc(${s.slice(expr.getStart(), expr.getEnd())})`;

    // If body is JSX, convert to string
    const jsx = this._findJsx(body);
    if (jsx) {
      const jsxStr = this._jsxToString(jsx, variables, s, null);
      return `${callerText}.map(${paramName} => ${jsxStr}).join('')`;
    }

    // If body is a block, try to find return JSX
    if (body.isKind(SyntaxKind.Block)) {
      const returnStmts = body.getDescendantsOfKind(SyntaxKind.ReturnStatement);
      for (const ret of returnStmts) {
        const retExpr = ret.getExpression();
        if (!retExpr) continue;
        const retJsx = this._findJsx(retExpr);
        if (retJsx) {
          const jsxStr = this._jsxToString(retJsx, variables, s, null);
          return `${callerText}.map(${paramName} => ${jsxStr}).join('')`;
        }
      }
    }

    return `__esc(${s.slice(expr.getStart(), expr.getEnd())})`;
  }

  /**
   * Convert an expression node to a string representation.
   * If the node is JSX, convert to AOT string. Otherwise, use __esc().
   */
  private _expressionNodeToString(node: Node, variables: VariableInfo[], s: MagicString): string {
    // Unwrap parenthesized expressions
    if (node.isKind(SyntaxKind.ParenthesizedExpression)) {
      return this._expressionNodeToString(node.getExpression(), variables, s);
    }

    // JSX element or fragment
    if (
      node.isKind(SyntaxKind.JsxElement) ||
      node.isKind(SyntaxKind.JsxSelfClosingElement) ||
      node.isKind(SyntaxKind.JsxFragment)
    ) {
      return this._jsxToString(node, variables, s, null);
    }

    // Non-JSX expression
    const exprText = s.slice(node.getStart(), node.getEnd());
    return `__esc(${exprText})`;
  }

  private _cleanJsxText(raw: string): string {
    if (!raw.includes('\n') && !raw.includes('\r')) {
      return raw;
    }

    const lines = raw.split(/\r\n|\n|\r/);
    const cleaned: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      let line = (lines[i] as string).replace(/\t/g, ' ');
      if (i > 0) line = line.trimStart();
      if (i < lines.length - 1) line = line.trimEnd();
      if (line) cleaned.push(line);
    }

    return cleaned.join(' ');
  }

  private _escapeStringLiteral(text: string): string {
    return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  }
}
