import type {
  Expression,
  JsxElement,
  JsxSelfClosingElement,
  PropertyAccessExpression,
  SourceFile,
  VariableDeclaration,
} from 'ts-morph';
import { Node } from 'ts-morph';
import { BaseAnalyzer } from './base-analyzer';
import type { ComponentFieldAccess } from './field-access-analyzer';
import { FieldAccessAnalyzer } from './field-access-analyzer';

export interface PropFlowEdge {
  parent: string;
  sourceKind: 'query' | 'prop' | 'unknown';
  queryVar?: string;
  parentProp?: string;
  child: string;
  childProp: string;
  isArrayElement?: boolean;
}

export interface AggregatedQueryFields {
  component: string;
  queryVar: string;
  fields: string[];
  hasOpaqueAccess: boolean;
}

export interface CrossComponentAnalyzerResult {
  intraComponent: ComponentFieldAccess[];
  propFlowGraph: PropFlowEdge[];
  aggregated: AggregatedQueryFields[];
}

export class CrossComponentAnalyzer extends BaseAnalyzer<CrossComponentAnalyzerResult> {
  async analyze(): Promise<CrossComponentAnalyzerResult> {
    // Phase 1: Intra-component analysis
    const fieldAccessAnalyzer = new FieldAccessAnalyzer(this.project, this.config);
    const intraComponent = await fieldAccessAnalyzer.analyze();

    // Phase 2: Build prop flow graph
    const propFlowGraph = this.buildPropFlowGraph(intraComponent);

    // Phase 3: Backward propagation
    const aggregated = this.aggregateFields(intraComponent, propFlowGraph);

    return {
      intraComponent,
      propFlowGraph,
      aggregated,
    };
  }

  private buildPropFlowGraph(intraComponent: ComponentFieldAccess[]): PropFlowEdge[] {
    const edges: PropFlowEdge[] = [];
    const componentMap = new Map<string, ComponentFieldAccess>();

    for (const comp of intraComponent) {
      componentMap.set(comp.component, comp);
    }

    for (const sourceFile of this.project.getSourceFiles()) {
      const filePath = this.normalizeFilePath(sourceFile);
      const componentData = componentMap.get(filePath);
      if (!componentData) continue;

      // Find JSX elements in this component
      sourceFile.forEachDescendant((node) => {
        if (Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node)) {
          const jsxEdges = this.analyzeJsxElement(node, filePath, componentData, componentMap);
          edges.push(...jsxEdges);
        }
      });
    }

    return edges;
  }

  private analyzeJsxElement(
    element: JsxElement | JsxSelfClosingElement,
    parentPath: string,
    parentData: ComponentFieldAccess,
    _componentMap: Map<string, ComponentFieldAccess>,
  ): PropFlowEdge[] {
    const edges: PropFlowEdge[] = [];

    const tagName = Node.isJsxElement(element)
      ? element.getOpeningElement().getTagNameNode().getText()
      : element.getTagNameNode().getText();

    // Skip lowercase (HTML tags)
    if (!/^[A-Z]/.test(tagName)) {
      return edges;
    }

    // Try to resolve child component
    const childPath = this.resolveComponentPath(tagName, parentPath);
    if (!childPath) {
      // Opaque boundary - can't resolve component
      return edges;
    }

    // Get attributes
    const attributes = Node.isJsxElement(element)
      ? element.getOpeningElement().getAttributes()
      : element.getAttributes();

    for (const attr of attributes) {
      if (!Node.isJsxAttribute(attr)) {
        // Spread attribute - opaque boundary
        continue;
      }

      const nameNode = attr.getNameNode();
      const propName = nameNode.getText();
      
      // Skip ref and key
      if (propName === 'ref' || propName === 'key') {
        continue;
      }

      const initializer = attr.getInitializer();
      if (!initializer) continue;

      // Unwrap JSX expression
      let valueExpr: Expression | undefined;
      if (Node.isJsxExpression(initializer)) {
        valueExpr = initializer.getExpression();
      } else if (Node.isStringLiteral(initializer)) {
        // String literal - not entity data
        continue;
      }

      if (!valueExpr) continue;

      // Analyze the value expression
      const traceResult = this.traceExpressionToSource(valueExpr, parentData);

      if (traceResult) {
        edges.push({
          parent: parentPath,
          sourceKind: traceResult.kind,
          queryVar: traceResult.queryVar,
          parentProp: traceResult.parentProp,
          child: childPath,
          childProp: propName,
          isArrayElement: traceResult.isArrayElement,
        });
      }
    }

    return edges;
  }

  private traceExpressionToSource(
    expr: Expression,
    parentData: ComponentFieldAccess,
  ): { kind: 'query' | 'prop'; queryVar?: string; parentProp?: string; isArrayElement?: boolean } | null {
    // Handle direct identifier
    if (Node.isIdentifier(expr)) {
      const name = expr.getText();
      // Check if it's a query variable
      const queryAccess = parentData.queryAccess.find(q => q.queryVar === name);
      if (queryAccess) {
        return { kind: 'query', queryVar: name };
      }
      // Check if it's a prop (destructured)
      const propAccess = parentData.propAccess.find(p => p.propName === name);
      if (propAccess) {
        return { kind: 'prop', parentProp: name };
      }
      // Check if it's a callback parameter (e.g., 'p' in .map(p => ...))
      const callbackTrace = this.traceCallbackParameter(expr, parentData);
      if (callbackTrace) {
        return callbackTrace;
      }
      // Try to find the variable declaration and trace its initializer
      const sourceFile = expr.getSourceFile();
      const varDecl = this.findVariableDeclaration(sourceFile, name);
      if (varDecl) {
        const init = varDecl.getInitializer();
        if (init) {
          return this.traceExpressionToSource(init, parentData);
        }
      }
      return null;
    }

    // Handle property access: queryVar.data, queryVar.data[0], props.user
    if (Node.isPropertyAccessExpression(expr)) {
      const base = this.getBaseIdentifier(expr);
      if (!base) return null;

      const baseName = base.getText();

      // Check if it traces to a query
      const queryAccess = parentData.queryAccess.find(q => q.queryVar === baseName);
      if (queryAccess) {
        // Check if it's accessing .data property
        if (this.isDataPropertyAccess(expr, baseName)) {
          return { kind: 'query', queryVar: baseName };
        }
      }

      // Check if it traces to a prop
      const propAccess = parentData.propAccess.find(p => p.propName === baseName || this.extractPropName(expr) === p.propName);
      if (propAccess) {
        return { kind: 'prop', parentProp: propAccess.propName };
      }

      return null;
    }

    // Handle element access: queryVar.data[0]
    if (Node.isElementAccessExpression(expr)) {
      const obj = expr.getExpression();
      const base = this.getBaseIdentifier(obj);
      if (!base) return null;

      const baseName = base.getText();
      const queryAccess = parentData.queryAccess.find(q => q.queryVar === baseName);
      if (queryAccess) {
        return { kind: 'query', queryVar: baseName, isArrayElement: true };
      }

      return null;
    }

    // Handle call expressions: queryVar.data.map(p => ...), queryVar.data.filter(...)
    if (Node.isCallExpression(expr)) {
      const callExpr = expr.getExpression();
      if (Node.isPropertyAccessExpression(callExpr)) {
        const methodName = callExpr.getName();
        
        // Check if it's an array method
        if (['map', 'filter', 'find', 'slice'].includes(methodName)) {
          const obj = callExpr.getExpression();
          const base = this.getBaseIdentifier(obj);
          if (!base) return null;

          const baseName = base.getText();
          const queryAccess = parentData.queryAccess.find(q => q.queryVar === baseName);
          if (queryAccess) {
            // These methods preserve entity data but operate on elements
            const isElementMethod = ['map', 'filter', 'find'].includes(methodName);
            return { 
              kind: 'query', 
              queryVar: baseName, 
              isArrayElement: isElementMethod 
            };
          }

          // Check if it traces to a prop array method
          const propAccess = parentData.propAccess.find(p => p.propName === baseName || this.extractPropName(obj) === p.propName);
          if (propAccess) {
            const isElementMethod = ['map', 'filter', 'find'].includes(methodName);
            return { 
              kind: 'prop', 
              parentProp: propAccess.propName,
              isArrayElement: isElementMethod 
            };
          }
        }
      }
      return null;
    }

    return null;
  }

  private traceCallbackParameter(
    identifier: Expression,
    parentData: ComponentFieldAccess,
  ): { kind: 'query' | 'prop'; queryVar?: string; parentProp?: string; isArrayElement?: boolean } | null {
    if (!Node.isIdentifier(identifier)) return null;

    const paramName = identifier.getText();

    // Walk up to find if this identifier is a callback parameter
    let current: any = identifier;
    while (current) {
      const parent = current.getParent();
      
      // Check if we're inside an arrow function that's a callback to map/filter/etc
      if (parent && Node.isArrowFunction(parent)) {
        const params = parent.getParameters();
        const isParam = params.some(p => p.getName() === paramName);
        
        if (isParam) {
          // Found the arrow function where this is a parameter
          // Now find the call expression that uses this arrow function
          const callParent = parent.getParent();
          if (callParent && Node.isCallExpression(callParent)) {
            const callExpr = callParent.getExpression();
            if (Node.isPropertyAccessExpression(callExpr)) {
              const methodName = callExpr.getName();
              
              if (['map', 'filter', 'find', 'some', 'every', 'forEach'].includes(methodName)) {
                // Trace the object being called (e.g., posts.data or props.items)
                const obj = callExpr.getExpression();
                return this.traceExpressionToSource(obj, parentData);
              }
            }
          }
        }
      }
      
      current = parent;
    }

    return null;
  }

  private findVariableDeclaration(sourceFile: SourceFile, varName: string): VariableDeclaration | null {
    let result: VariableDeclaration | null = null;
    sourceFile.forEachDescendant((node) => {
      if (Node.isVariableDeclaration(node)) {
        if (node.getName() === varName) {
          result = node;
        }
      }
    });
    return result;
  }

  private getBaseIdentifier(expr: Expression): Expression | null {
    let current: Expression = expr;
    while (Node.isPropertyAccessExpression(current) || Node.isElementAccessExpression(current)) {
      if (Node.isPropertyAccessExpression(current)) {
        current = current.getExpression();
      } else {
        current = current.getExpression();
      }
    }
    return Node.isIdentifier(current) ? current : null;
  }

  private isDataPropertyAccess(expr: PropertyAccessExpression, baseName: string): boolean {
    let current: Expression = expr;
    while (Node.isPropertyAccessExpression(current)) {
      const name = current.getName();
      const obj = current.getExpression();
      
      if (name === 'data' && Node.isIdentifier(obj) && obj.getText() === baseName) {
        return true;
      }
      
      current = obj;
    }
    return false;
  }

  private extractPropName(expr: Expression): string | null {
    // For props.propName.x, extract propName
    if (Node.isPropertyAccessExpression(expr)) {
      const obj = expr.getExpression();
      if (Node.isPropertyAccessExpression(obj)) {
        const base = obj.getExpression();
        if (Node.isIdentifier(base) && base.getText() === 'props') {
          return obj.getName();
        }
      } else if (Node.isIdentifier(obj) && obj.getText() === 'props') {
        return expr.getName();
      }
    }
    return null;
  }

  private resolveComponentPath(
    componentName: string,
    _parentPath: string,
  ): string | null {
    // Try to find the component in the project
    for (const sourceFile of this.project.getSourceFiles()) {
      const filePath = this.normalizeFilePath(sourceFile);
      
      // Check function declarations
      const funcDecls = sourceFile.getFunctions();
      for (const func of funcDecls) {
        if (func.getName() === componentName) {
          return filePath;
        }
      }

      // Check variable declarations
      sourceFile.forEachDescendant((node) => {
        if (Node.isVariableDeclaration(node)) {
          if (node.getName() === componentName) {
            const init = node.getInitializer();
            if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
              return filePath;
            }
          }
        }
      });
    }

    return null;
  }

  private aggregateFields(
    intraComponent: ComponentFieldAccess[],
    propFlowGraph: PropFlowEdge[],
  ): AggregatedQueryFields[] {
    const results: AggregatedQueryFields[] = [];
    const componentMap = new Map<string, ComponentFieldAccess>();

    for (const comp of intraComponent) {
      componentMap.set(comp.component, comp);
    }

    // For each component with queries
    for (const comp of intraComponent) {
      for (const queryAccess of comp.queryAccess) {
        const aggregated = this.aggregateFieldsForQuery(
          comp.component,
          queryAccess.queryVar,
          intraComponent,
          propFlowGraph,
          componentMap,
        );

        results.push({
          component: comp.component,
          queryVar: queryAccess.queryVar,
          fields: aggregated.fields,
          hasOpaqueAccess: aggregated.hasOpaqueAccess || queryAccess.hasOpaqueAccess,
        });
      }
    }

    return results;
  }

  private aggregateFieldsForQuery(
    component: string,
    queryVar: string,
    _intraComponent: ComponentFieldAccess[],
    propFlowGraph: PropFlowEdge[],
    componentMap: Map<string, ComponentFieldAccess>,
  ): { fields: string[]; hasOpaqueAccess: boolean } {
    const fields = new Set<string>();
    let hasOpaqueAccess = false;
    const visited = new Set<string>();

    // Start with local field accesses
    const compData = componentMap.get(component);
    if (compData) {
      const queryAccess = compData.queryAccess.find(q => q.queryVar === queryVar);
      if (queryAccess) {
        queryAccess.fields.forEach(f => fields.add(f));
        if (queryAccess.hasOpaqueAccess) {
          hasOpaqueAccess = true;
        }
      }
    }

    // Backward propagation through prop flow graph
    const queue: Array<{ component: string; prop: string; path: string[] }> = [];

    // Find all edges originating from this query
    for (const edge of propFlowGraph) {
      if (edge.parent === component && edge.sourceKind === 'query' && edge.queryVar === queryVar) {
        queue.push({
          component: edge.child,
          prop: edge.childProp,
          path: [component],
        });
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const visitKey = `${current.component}:${current.prop}`;

      // Cycle detection
      if (visited.has(visitKey)) {
        continue;
      }
      visited.add(visitKey);

      // Check for cycle in path
      if (current.path.includes(current.component)) {
        continue;
      }

      const childComp = componentMap.get(current.component);
      if (!childComp) continue;

      // Find field accesses on this prop
      const propAccess = childComp.propAccess.find(p => p.propName === current.prop);
      if (propAccess) {
        propAccess.fields.forEach(f => fields.add(f));
        if (propAccess.hasOpaqueAccess) {
          hasOpaqueAccess = true;
        }
      }

      // Find downstream edges (this component passes the prop to children)
      for (const edge of propFlowGraph) {
        if (edge.parent === current.component && edge.sourceKind === 'prop' && edge.parentProp === current.prop) {
          queue.push({
            component: edge.child,
            prop: edge.childProp,
            path: [...current.path, current.component],
          });
        }
      }
    }

    return {
      fields: Array.from(fields).sort(),
      hasOpaqueAccess,
    };
  }

  private normalizeFilePath(sourceFile: SourceFile): string {
    let filePath = sourceFile.getFilePath().replace(/\\/g, '/');
    if (filePath.startsWith('/')) {
      filePath = filePath.slice(1);
    }
    return filePath;
  }
}
