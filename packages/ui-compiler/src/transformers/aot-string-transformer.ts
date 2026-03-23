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

/** Set of HTML boolean attributes that should be present/absent, not have string values. */
const BOOLEAN_ATTRIBUTES = new Set([
  'allowfullscreen',
  'async',
  'autofocus',
  'autoplay',
  'checked',
  'controls',
  'default',
  'defer',
  'disabled',
  'formnovalidate',
  'hidden',
  'inert',
  'ismap',
  'itemscope',
  'loop',
  'multiple',
  'muted',
  'nomodule',
  'novalidate',
  'open',
  'playsinline',
  'readonly',
  'required',
  'reversed',
  'selected',
]);

/** JSX props that should not appear in HTML output. */
const SKIP_PROPS = new Set(['key', 'ref', 'dangerouslySetInnerHTML']);

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
  /** Component names referenced during current transform (for holes tracking). */
  private _currentHoles: Set<string> = new Set();
  /** Reactive variable names for the current component (signal/computed). */
  private _reactiveNames: Set<string> = new Set();

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

    // Detect multiple return statements → runtime-fallback
    const returnStmts = bodyNode.getDescendantsOfKind(SyntaxKind.ReturnStatement);
    const returnsWithJsx = returnStmts.filter((ret) => {
      const expr = ret.getExpression();
      return expr && this._findJsx(expr);
    });

    if (returnsWithJsx.length > 1) {
      this._components.push({
        name: component.name,
        tier: 'runtime-fallback',
        holes: [],
      });
      return;
    }

    // Find the return statement's JSX
    const returnJsx = this._findReturnJsx(bodyNode);
    if (!returnJsx) return;

    // Determine tier based on variables and JSX analysis
    const tier = this._classifyTier(returnJsx, variables);

    // Check if component is interactive (has signal/let declarations)
    const isInteractive = variables.some((v) => v.kind === 'signal');

    // Reset tracking for this component
    this._currentHoles = new Set();
    this._reactiveNames = new Set(
      variables.filter((v) => v.kind === 'signal' || v.kind === 'computed').map((v) => v.name),
    );

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
      holes: [...this._currentHoles],
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
        if (this._isMapCall(inner)) return 'conditional';
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

    const dangerousHtml = this._extractDangerousInnerHTML(openingElement, s);
    const attrs = this._attrsToString(openingElement, variables, s);
    const hydrationAttr = hydrationId ? ` data-v-id="${hydrationId}"` : '';
    let attrStr: string;
    if (!attrs) {
      attrStr = hydrationAttr;
    } else if (this._isAttrsDynamic(attrs)) {
      // Dynamic-only attrs handle their own leading space
      attrStr = attrs + hydrationAttr;
    } else {
      attrStr = ' ' + attrs + hydrationAttr;
    }

    if (isVoid) {
      return `'<${tagName}${attrStr}>'`;
    }

    // dangerouslySetInnerHTML replaces children with raw HTML
    const children = dangerousHtml ?? this._childrenToString(node, variables, isRawText, s);

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
    const dangerousHtml = this._extractDangerousInnerHTML(node, s);
    const attrs = this._attrsToString(node, variables, s);
    const hydrationAttr = hydrationId ? ` data-v-id="${hydrationId}"` : '';
    let attrStr: string;
    if (!attrs) {
      attrStr = hydrationAttr;
    } else if (this._isAttrsDynamic(attrs)) {
      attrStr = attrs + hydrationAttr;
    } else {
      attrStr = ' ' + attrs + hydrationAttr;
    }

    if (isVoid) {
      return `'<${tagName}${attrStr}>'`;
    }

    if (dangerousHtml) {
      return `'<${tagName}${attrStr}>' + ${dangerousHtml} + '</${tagName}>'`;
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
    // Track this component as a hole
    this._currentHoles.add(tagName);

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

    // Separate static attrs (inline in string) from dynamic attrs (need JS expressions)
    const staticParts: string[] = [];
    const dynamicSuffix: string[] = [];
    const syntaxList = attrs.getChildrenOfKind(SyntaxKind.SyntaxList)[0];
    const attrNodes = syntaxList ? syntaxList.getChildren() : attrs.getChildren();

    for (const attr of attrNodes) {
      if (attr.isKind(SyntaxKind.JsxAttribute)) {
        const attrResult = this._attrToString(attr, variables, s);
        if (!attrResult) continue;

        // Dynamic attrs that break out of the string literal
        if (attrResult.startsWith("' + ")) {
          // Boolean attr or spread — already includes leading space in the expression
          dynamicSuffix.push(attrResult);
        } else {
          staticParts.push(attrResult);
        }
      } else if (attr.isKind(SyntaxKind.JsxSpreadAttribute)) {
        const spreadExpr = asNode(attr.getChildren()[2]);
        if (spreadExpr && spreadExpr.getKind() !== SyntaxKind.CloseBraceToken) {
          const exprText = s.slice(spreadExpr.getStart(), spreadExpr.getEnd());
          dynamicSuffix.push(`' + __ssr_spread(${exprText}) + '`);
        }
      }
    }

    const staticStr = staticParts.join(' ');
    if (dynamicSuffix.length === 0) return staticStr;
    // Combine: static attrs followed by dynamic attrs that include their own spacing
    // Dynamic attrs (boolean, spread) already include leading space in their expressions
    return staticStr + dynamicSuffix.join('');
  }

  /**
   * Returns true if the attrs string is purely dynamic (needs no leading space from caller).
   * Dynamic-only attr strings start with "' +" and handle their own spacing.
   */
  private _isAttrsDynamic(attrStr: string): boolean {
    return attrStr.startsWith("' + ");
  }

  private _attrToString(attr: Node, _variables: VariableInfo[], s: MagicString): string | null {
    const nameNode = attr.getChildrenOfKind(SyntaxKind.Identifier)[0];
    if (!nameNode) return null;

    let name = nameNode.getText();

    // Skip event handlers
    if (name.startsWith('on') && name.length > 2 && name[2] === name[2]!.toUpperCase()) {
      return null;
    }

    // Skip framework-only props
    if (SKIP_PROPS.has(name)) return null;

    // Prop aliasing
    if (name === 'className') name = 'class';
    if (name === 'htmlFor') name = 'for';

    const initializer = attr.getChildrenOfKind(SyntaxKind.JsxExpression)[0];
    const stringLiteral = attr.getChildrenOfKind(SyntaxKind.StringLiteral)[0];

    if (stringLiteral) {
      const value = stringLiteral.getLiteralText();
      return `${name}="${this._escapeAttrValue(value)}"`;
    }

    if (initializer) {
      const expr = initializer.getExpression();
      if (!expr) {
        return name;
      }
      const exprText = s.slice(expr.getStart(), expr.getEnd());

      // style attribute with object value → use __ssr_style_object()
      if (name === 'style') {
        return `style="' + __ssr_style_object(${exprText}) + '"`;
      }

      // Boolean attributes → conditional presence
      if (BOOLEAN_ATTRIBUTES.has(name.toLowerCase())) {
        return `' + (${exprText} ? ' ${name}' : '') + '`;
      }

      return `${name}="' + __esc_attr(${exprText}) + '"`;
    }

    return name;
  }

  /** Extract dangerouslySetInnerHTML __html expression from an element. */
  private _extractDangerousInnerHTML(openingOrSelfClosing: Node, s: MagicString): string | null {
    const attrs = openingOrSelfClosing.getChildrenOfKind(SyntaxKind.JsxAttributes)[0];
    if (!attrs) return null;

    const syntaxList = attrs.getChildrenOfKind(SyntaxKind.SyntaxList)[0];
    const attrNodes = syntaxList ? syntaxList.getChildren() : attrs.getChildren();

    for (const attr of attrNodes) {
      if (!attr.isKind(SyntaxKind.JsxAttribute)) continue;
      const nameNode = attr.getChildrenOfKind(SyntaxKind.Identifier)[0];
      if (!nameNode || nameNode.getText() !== 'dangerouslySetInnerHTML') continue;

      const jsxExpr = attr.getChildrenOfKind(SyntaxKind.JsxExpression)[0];
      if (!jsxExpr) return null;

      const expr = jsxExpr.getExpression();
      if (!expr) return null;

      // Look for __html property in the object literal
      if (expr.isKind(SyntaxKind.ObjectLiteralExpression)) {
        for (const prop of expr.getProperties()) {
          if (prop.isKind(SyntaxKind.PropertyAssignment)) {
            const propName = prop.getNameNode();
            if (propName && propName.getText() === '__html') {
              const init = prop.getInitializer();
              if (init) {
                return s.slice(init.getStart(), init.getEnd());
              }
            }
          }
        }
      }

      // Fallback: use the full expression and access .__html
      const exprText = s.slice(expr.getStart(), expr.getEnd());
      return `(${exprText}).__html`;
    }

    return null;
  }

  /** Escape a static attribute value for embedding in a JS single-quoted string literal. */
  private _escapeAttrValue(value: string): string {
    // The value is inside a JS string literal wrapped in single quotes: '<tag attr="VALUE">'
    // We need to escape: backslash (JS), single quote (JS), newlines (JS)
    // HTML attribute escaping (&quot;) is not needed here — the value is already
    // from a JSX string literal which the developer wrote.
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
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
    if (expr.isKind(SyntaxKind.CallExpression) && this._isMapCall(expr)) {
      return this._mapCallToString(expr, variables, s);
    }

    // Simple expression
    const exprText = s.slice(expr.getStart(), expr.getEnd());
    if (isRawText) {
      return `String(${exprText})`;
    }

    // Wrap reactive expressions with child marker for hydration parity.
    // Only a start marker — the DOM shim's __child() emits a single <!--child-->
    // comment anchor with no end marker.
    if (this._isReactiveExpression(expr)) {
      return `'<!--child-->' + __esc(${exprText})`;
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

    return `'<!--conditional-->' + (${condText} ? ${trueStr} : ${falseStr}) + '<!--/conditional-->'`;
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
      return `'<!--conditional-->' + (${leftText} ? ${rightStr} : '') + '<!--/conditional-->'`;
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
      return `'<!--list-->' + ${callerText}.map(${paramName} => ${jsxStr}).join('') + '<!--/list-->'`;
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
          return `'<!--list-->' + ${callerText}.map(${paramName} => ${jsxStr}).join('') + '<!--/list-->'`;
        }
      }
    }

    return `__esc(${s.slice(expr.getStart(), expr.getEnd())})`;
  }

  /**
   * Convert an expression node to a string representation.
   * If the node is JSX, convert to AOT string.
   * If the node is a conditional/binary, recurse with markers.
   * Otherwise, use __esc().
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

    // Nested ternary: cond ? a : b
    if (node.isKind(SyntaxKind.ConditionalExpression)) {
      return this._ternaryToString(node, variables, s);
    }

    // Nested binary: expr && <JSX />
    if (node.isKind(SyntaxKind.BinaryExpression)) {
      return this._binaryToString(node, variables, s);
    }

    // Non-JSX expression
    const exprText = s.slice(node.getStart(), node.getEnd());
    return `__esc(${exprText})`;
  }

  /**
   * Check if an expression references any reactive variable (signal/computed).
   * Uses AST identifier scanning — no string matching.
   *
   * Skips identifiers that are the property name (right side) of a
   * PropertyAccessExpression to avoid false positives like `obj.count`
   * matching a signal named `count`.
   */
  private _isReactiveExpression(node: Node): boolean {
    if (this._reactiveNames.size === 0) return false;

    // Direct identifier reference
    if (node.isKind(SyntaxKind.Identifier)) {
      return this._reactiveNames.has(node.getText());
    }

    // Check all descendant identifiers, skipping property access names
    const identifiers = node.getDescendantsOfKind(SyntaxKind.Identifier);
    return identifiers.some((id) => {
      if (!this._reactiveNames.has(id.getText())) return false;

      // Skip if this identifier is the property name of a member expression.
      // In `obj.count`, `count` is the name child of PropertyAccessExpression.
      const parent = id.getParent();
      if (parent?.isKind(SyntaxKind.PropertyAccessExpression)) {
        const children = parent.getChildren();
        // PropertyAccessExpression children: [object, DotToken, name]
        // If the identifier is the name (last child), it's a property access, not a variable reference
        if (children.length >= 3 && children[children.length - 1] === id) {
          return false;
        }
      }
      return true;
    });
  }

  /** Check if a CallExpression is a .map() call using AST, not string matching. */
  private _isMapCall(node: Node): boolean {
    const firstChild = node.getChildren()[0];
    if (!firstChild || !firstChild.isKind(SyntaxKind.PropertyAccessExpression)) return false;
    const propName = firstChild.getChildrenOfKind(SyntaxKind.Identifier);
    // The method name is the last identifier in the property access
    const methodName = propName[propName.length - 1];
    return methodName?.getText() === 'map';
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
    return text
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }
}
