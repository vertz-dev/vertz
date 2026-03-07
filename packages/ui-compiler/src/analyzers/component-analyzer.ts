import {
  type FunctionDeclaration,
  type Node,
  type ParameterDeclaration,
  type SourceFile,
  SyntaxKind,
  type VariableDeclaration,
} from 'ts-morph';
import type { ComponentInfo, PropsBindingInfo } from '../types';

/**
 * Detect functions that return JSX — the component boundaries
 * the compiler operates within.
 */
export class ComponentAnalyzer {
  analyze(sourceFile: SourceFile): ComponentInfo[] {
    const components: ComponentInfo[] = [];

    // Named function declarations returning JSX
    for (const fn of sourceFile.getFunctions()) {
      if (this._returnsJsx(fn)) {
        components.push(this._fromFunctionDeclaration(fn));
      }
    }

    // Arrow functions / function expressions assigned to const
    for (const stmt of sourceFile.getVariableStatements()) {
      for (const decl of stmt.getDeclarationList().getDeclarations()) {
        const init = decl.getInitializer();
        if (!init) continue;

        if (init.isKind(SyntaxKind.ArrowFunction) || init.isKind(SyntaxKind.FunctionExpression)) {
          if (this._returnsJsx(init)) {
            components.push(this._fromVariableDeclaration(decl, init));
          }
        }
      }
    }

    return components;
  }

  /**
   * Check whether a function contains JSX — either in a return statement
   * or anywhere in the function body (e.g., variable assignments, loops,
   * function call arguments).
   */
  private _returnsJsx(node: Node): boolean {
    // Arrow with expression body: const X = () => <div/>
    if (node.isKind(SyntaxKind.ArrowFunction)) {
      const body = node.getBody();
      if (this._containsJsx(body)) return true;
    }

    // Check the entire function body for any JSX nodes
    const body =
      node.isKind(SyntaxKind.FunctionDeclaration) || node.isKind(SyntaxKind.FunctionExpression)
        ? node.getBody()
        : node;

    if (body && this._containsJsx(body)) return true;

    // Check if the function body contains JSX anywhere (e.g., in variable assignments)
    if (this._containsJsx(node)) return true;

    return false;
  }

  private _containsJsx(node: Node): boolean {
    if (
      node.isKind(SyntaxKind.JsxElement) ||
      node.isKind(SyntaxKind.JsxSelfClosingElement) ||
      node.isKind(SyntaxKind.JsxFragment)
    ) {
      return true;
    }
    return node.getChildren().some((c) => this._containsJsx(c));
  }

  private _fromFunctionDeclaration(fn: FunctionDeclaration): ComponentInfo {
    const body = fn.getBody();
    const bodyStart = body ? body.getStart() : fn.getStart();
    const bodyEnd = body ? body.getEnd() : fn.getEnd();

    const param = fn.getParameters()[0];
    const propsInfo = this._extractPropsInfo(param);

    return {
      name: fn.getName() ?? 'anonymous',
      ...propsInfo,
      bodyStart,
      bodyEnd,
    };
  }

  private _fromVariableDeclaration(decl: VariableDeclaration, init: Node): ComponentInfo {
    const name = decl.getName();

    // Get parameters from arrow function or function expression
    const params = init.isKind(SyntaxKind.ArrowFunction)
      ? init.getParameters()
      : init.isKind(SyntaxKind.FunctionExpression)
        ? init.getParameters()
        : [];

    const param = params[0];
    const propsInfo = this._extractPropsInfo(param);

    // Body range
    let bodyNode: Node;
    if (init.isKind(SyntaxKind.ArrowFunction)) {
      bodyNode = init.getBody();
    } else if (init.isKind(SyntaxKind.FunctionExpression)) {
      bodyNode = init.getBody() ?? init;
    } else {
      bodyNode = init;
    }

    return {
      name,
      ...propsInfo,
      bodyStart: bodyNode.getStart(),
      bodyEnd: bodyNode.getEnd(),
    };
  }

  private _extractPropsInfo(
    param: ParameterDeclaration | undefined,
  ): Pick<ComponentInfo, 'propsParam' | 'hasDestructuredProps' | 'destructuredProps'> {
    if (!param) {
      return { propsParam: null, hasDestructuredProps: false };
    }

    const nameNode = param.getNameNode();
    if (!nameNode.isKind(SyntaxKind.ObjectBindingPattern)) {
      return { propsParam: param.getName(), hasDestructuredProps: false };
    }

    // Extract binding details from the ObjectBindingPattern
    const bindings: PropsBindingInfo[] = [];
    let hasRest = false;
    let hasNestedDestructuring = false;

    for (const element of nameNode.getElements()) {
      if (element.getDotDotDotToken()) {
        hasRest = true;
        bindings.push({
          propName: element.getName(),
          bindingName: element.getName(),
          isRest: true,
        });
        continue;
      }

      // Check for nested destructuring
      const elementName = element.getNameNode();
      if (
        elementName.isKind(SyntaxKind.ObjectBindingPattern) ||
        elementName.isKind(SyntaxKind.ArrayBindingPattern)
      ) {
        hasNestedDestructuring = true;
        continue;
      }

      const bindingName = element.getName();
      const propertyNameNode = element.getPropertyNameNode();
      const propName = propertyNameNode ? propertyNameNode.getText() : bindingName;
      const initializer = element.getInitializer();

      bindings.push({
        propName,
        bindingName,
        defaultValue: initializer?.getText(),
        isRest: false,
      });
    }

    const typeNode = param.getTypeNode();
    const typeAnnotation = typeNode ? `: ${typeNode.getText()}` : null;

    return {
      propsParam: null,
      hasDestructuredProps: true,
      destructuredProps: {
        bindings,
        hasRest,
        hasNestedDestructuring,
        paramStart: param.getStart(),
        paramEnd: param.getEnd(),
        typeAnnotation,
      },
    };
  }
}
