import type {
  ArrowFunction,
  CallExpression,
  Expression,
  FunctionDeclaration,
  ObjectBindingPattern,
  ParameterDeclaration,
  PropertyAccessExpression,
  SourceFile,
} from 'ts-morph';
import { Node, SyntaxKind } from 'ts-morph';
import { BaseAnalyzer } from './base-analyzer';

export interface QueryFieldAccess {
  queryVar: string;
  fields: string[];
  hasOpaqueAccess: boolean;
}

export interface PropFieldAccess {
  propName: string;
  fields: string[];
  hasOpaqueAccess: boolean;
}

export interface ComponentFieldAccess {
  component: string;
  queryAccess: QueryFieldAccess[];
  propAccess: PropFieldAccess[];
}

export interface FieldAccessAnalyzerResult extends Array<ComponentFieldAccess> {}

export class FieldAccessAnalyzer extends BaseAnalyzer<FieldAccessAnalyzerResult> {
  async analyze(): Promise<FieldAccessAnalyzerResult> {
    const results: ComponentFieldAccess[] = [];

    for (const sourceFile of this.project.getSourceFiles()) {
      const result = this.analyzeFile(sourceFile);
      // Include files that have components (even if no queries/props)
      const components = this.findComponents(sourceFile);
      if (components.length > 0 || result.queryAccess.length > 0 || result.propAccess.length > 0) {
        results.push(result);
      }
    }

    return results;
  }

  private analyzeFile(sourceFile: SourceFile): ComponentFieldAccess {
    const queryAccess: QueryFieldAccess[] = [];
    const propAccess: PropFieldAccess[] = [];

    // Find all query() calls
    const queryCalls = this.findQueryCalls(sourceFile);
    for (const { queryVar } of queryCalls) {
      const fields = this.extractFieldsFromScope(sourceFile, queryVar, 'data');
      queryAccess.push({
        queryVar,
        fields: fields.fields,
        hasOpaqueAccess: fields.hasOpaque,
      });
    }

    // Find all component function declarations/expressions
    const components = this.findComponents(sourceFile);
    for (const component of components) {
      const props = this.extractPropsParameter(component);
      if (props) {
        const propsAccess = this.extractPropsFieldAccess(component, props);
        propAccess.push(...propsAccess);
      }
    }

    // Normalize path: remove leading slash
    let filePath = sourceFile.getFilePath().replace(/\\/g, '/');
    if (filePath.startsWith('/')) {
      filePath = filePath.slice(1);
    }

    return {
      component: filePath,
      queryAccess,
      propAccess,
    };
  }

  private findQueryCalls(sourceFile: SourceFile): Array<{ queryVar: string; callExpr: CallExpression }> {
    const queries: Array<{ queryVar: string; callExpr: CallExpression }> = [];

    sourceFile.forEachDescendant((node) => {
      if (Node.isVariableDeclaration(node)) {
        const init = node.getInitializer();
        if (init && Node.isCallExpression(init)) {
          const expr = init.getExpression();
          if (Node.isIdentifier(expr) && expr.getText() === 'query') {
            const varName = node.getName();
            queries.push({ queryVar: varName, callExpr: init });
          }
        }
      }
    });

    return queries;
  }

  private findComponents(
    sourceFile: SourceFile,
  ): Array<FunctionDeclaration | ArrowFunction> {
    const components: Array<FunctionDeclaration | ArrowFunction> = [];

    sourceFile.forEachDescendant((node) => {
      if (Node.isFunctionDeclaration(node)) {
        // Check if it looks like a component (capitalized name, returns JSX)
        const name = node.getName();
        if (name && /^[A-Z]/.test(name)) {
          components.push(node);
        }
      } else if (Node.isVariableDeclaration(node)) {
        const init = node.getInitializer();
        if (init && Node.isArrowFunction(init)) {
          const name = node.getName();
          if (/^[A-Z]/.test(name)) {
            components.push(init);
          }
        }
      }
    });

    return components;
  }

  private extractPropsParameter(
    component: FunctionDeclaration | ArrowFunction,
  ): ParameterDeclaration | null {
    const params = component.getParameters();
    return params.length > 0 ? params[0] : null;
  }

  private extractPropsFieldAccess(
    component: FunctionDeclaration | ArrowFunction,
    propsParam: ParameterDeclaration,
  ): PropFieldAccess[] {
    const propAccess = new Map<string, { fields: Set<string>; hasOpaque: boolean }>();

    const propsName = propsParam.getName();
    const isDestructured = propsParam.getNameNode().getKind() === SyntaxKind.ObjectBindingPattern;

    if (isDestructured) {
      const binding = propsParam.getNameNode() as ObjectBindingPattern;
      const elements = binding.getElements();

      for (const element of elements) {
        const propName = element.getName();
        // Track access to destructured prop
        component.forEachDescendant((node) => {
          if (Node.isPropertyAccessExpression(node)) {
            const expr = node.getExpression();
            if (Node.isIdentifier(expr) && expr.getText() === propName) {
              const fieldPath = this.buildPropertyPath(node);
              if (fieldPath) {
                if (!propAccess.has(propName)) {
                  propAccess.set(propName, { fields: new Set(), hasOpaque: false });
                }
                const entry = propAccess.get(propName)!;
                entry.fields.add(fieldPath);
              }
            }
          } else if (Node.isElementAccessExpression(node)) {
            const expr = node.getExpression();
            if (Node.isIdentifier(expr) && expr.getText() === propName) {
              const arg = node.getArgumentExpression();
              if (!arg || !Node.isStringLiteral(arg)) {
                if (!propAccess.has(propName)) {
                  propAccess.set(propName, { fields: new Set(), hasOpaque: false });
                }
                propAccess.get(propName)!.hasOpaque = true;
              }
            }
          }
        });
      }
    } else {
      // Non-destructured: look for props.X.Y
      const visited = new Map<string, Set<string>>(); // Track visited chains per prop
      
      // Also handle array methods on props (e.g., props.items.map(...))
      component.forEachDescendant((node) => {
        if (Node.isCallExpression(node)) {
          const expr = node.getExpression();
          if (Node.isPropertyAccessExpression(expr)) {
            const methodName = expr.getName();
            if (['map', 'filter', 'find', 'some', 'every', 'forEach'].includes(methodName)) {
              const obj = expr.getExpression();
              // Check if this is props.propName.method(...)
              if (Node.isPropertyAccessExpression(obj)) {
                const baseExpr = obj.getExpression();
                if (Node.isIdentifier(baseExpr) && baseExpr.getText() === propsName) {
                  const propName = obj.getName();
                  if (!this.isPrimitivePropName(propName)) {
                    const callback = node.getArguments()[0];
                    if (callback && Node.isArrowFunction(callback)) {
                      const params = callback.getParameters();
                      if (params.length > 0) {
                        const paramName = params[0].getName();
                        const callbackFields = this.extractFieldsFromCallback(callback, paramName);
                        
                        if (!propAccess.has(propName)) {
                          propAccess.set(propName, { fields: new Set(), hasOpaque: false });
                          visited.set(propName, new Set());
                        }
                        
                        const visitedSet = visited.get(propName)!;
                        callbackFields.fields.forEach(f => {
                          if (!visitedSet.has(f)) {
                            propAccess.get(propName)!.fields.add(f);
                            visitedSet.add(f);
                          }
                        });
                        
                        if (callbackFields.hasOpaque) {
                          propAccess.get(propName)!.hasOpaque = true;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });
      
      component.forEachDescendant((node) => {
        if (Node.isPropertyAccessExpression(node)) {
          // Check if this chain starts with props.propName
          const propChainInfo = this.extractPropChainInfo(node, propsName);
          if (propChainInfo) {
            const { propName, isLeaf } = propChainInfo;
            
            // Skip primitive-like props
            if (this.isPrimitivePropName(propName)) {
              return;
            }

            // Only track leaf nodes to avoid duplicates
            if (isLeaf) {
              if (!propAccess.has(propName)) {
                propAccess.set(propName, { fields: new Set(), hasOpaque: false });
                visited.set(propName, new Set());
              }

              // Extract the field path after the prop name
              const fieldPath = this.extractFieldPathFromPropChain(node, propsName, propName);
              const visitedSet = visited.get(propName)!;
              
              if (fieldPath && !visitedSet.has(fieldPath)) {
                propAccess.get(propName)!.fields.add(fieldPath);
                visitedSet.add(fieldPath);
                
                // Mark all prefixes as visited
                const parts = fieldPath.split('.');
                for (let i = 1; i < parts.length; i++) {
                  visitedSet.add(parts.slice(0, i).join('.'));
                }
              }
            }
          }
        } else if (Node.isElementAccessExpression(node)) {
          const expr = node.getExpression();
          // Check if it's props.X[...]
          if (Node.isPropertyAccessExpression(expr)) {
            const baseExpr = expr.getExpression();
            if (Node.isIdentifier(baseExpr) && baseExpr.getText() === propsName) {
              const propName = expr.getName();
              const arg = node.getArgumentExpression();
              if (!arg || !Node.isStringLiteral(arg)) {
                if (!propAccess.has(propName)) {
                  propAccess.set(propName, { fields: new Set(), hasOpaque: false });
                }
                propAccess.get(propName)!.hasOpaque = true;
              }
            }
          }
        }
      });
    }

    return Array.from(propAccess.entries()).map(([propName, { fields, hasOpaque }]) => ({
      propName,
      fields: Array.from(fields),
      hasOpaqueAccess: hasOpaque,
    }));
  }

  private isPrimitivePropName(name: string): boolean {
    const primitiveProps = ['className', 'onClick', 'onChange', 'style', 'key', 'ref', 'children', 'count', 'value', 'disabled', 'checked', 'href', 'src', 'alt', 'title', 'id', 'name', 'placeholder', 'type'];
    return primitiveProps.includes(name);
  }

  private extractFieldsFromScope(
    sourceFile: SourceFile,
    varName: string,
    dataProperty: string,
  ): { fields: string[]; hasOpaque: boolean } {
    const fields = new Set<string>();
    const visited = new Set<string>(); // To avoid tracking intermediate nodes
    let hasOpaque = false;

    sourceFile.forEachDescendant((node) => {
      // Handle direct access: varName.data.field
      if (Node.isPropertyAccessExpression(node)) {
        if (this.isDirectDataPropertyAccess(node, varName, dataProperty)) {
          // Only track if this is not part of a longer chain
          const parent = node.getParent();
          const isLeaf = !parent || !Node.isPropertyAccessExpression(parent);
          
          if (isLeaf) {
            const fieldPath = this.buildPropertyPath(node);
            if (fieldPath && !visited.has(fieldPath)) {
              fields.add(fieldPath);
              visited.add(fieldPath);
              
              // Mark all prefixes as visited to avoid double-counting
              const parts = fieldPath.split('.');
              for (let i = 1; i < parts.length; i++) {
                visited.add(parts.slice(0, i).join('.'));
              }
            }
          }
        }
      }

      // Handle element access: varName.data[0].field
      if (Node.isElementAccessExpression(node)) {
        const expr = node.getExpression();
        if (this.isDataAccess(expr, varName, dataProperty)) {
          const arg = node.getArgumentExpression();
          if (arg && Node.isNumericLiteral(arg)) {
            // Array index access - track fields on elements
            const parent = node.getParent();
            if (parent && Node.isPropertyAccessExpression(parent)) {
              const fieldPath = this.buildPropertyPath(parent);
              if (fieldPath && !visited.has(fieldPath)) {
                fields.add(fieldPath);
                visited.add(fieldPath);
              }
            }
          } else {
            // Dynamic access
            hasOpaque = true;
          }
        }
      }

      // Handle map/filter callbacks: varName.data.map(p => p.field)
      // Also handles chains: varName.data.filter(...).map(...)
      if (Node.isCallExpression(node)) {
        const expr = node.getExpression();
        if (Node.isPropertyAccessExpression(expr)) {
          const methodName = expr.getName();

          if (['map', 'filter', 'find', 'some', 'every', 'forEach'].includes(methodName)) {
            // Check if this chain traces back to varName.data
            if (this.chainsBackToData(expr, varName, dataProperty)) {
              const callback = node.getArguments()[0];
              if (callback && Node.isArrowFunction(callback)) {
                const params = callback.getParameters();
                if (params.length > 0) {
                  const paramName = params[0].getName();
                  const callbackFields = this.extractFieldsFromCallback(callback, paramName);
                  callbackFields.fields.forEach(f => {
                    if (!visited.has(f)) {
                      fields.add(f);
                      visited.add(f);
                    }
                  });
                  if (callbackFields.hasOpaque) {
                    hasOpaque = true;
                  }
                }
              }
            }
          }
        }
      }

      // Handle destructuring: const { title, author } = varName.data
      if (Node.isVariableDeclaration(node)) {
        const init = node.getInitializer();
        if (init && this.isDataAccess(init, varName, dataProperty)) {
          const nameNode = node.getNameNode();
          if (Node.isObjectBindingPattern(nameNode)) {
            const elements = nameNode.getElements();
            for (const element of elements) {
              // Get the field name - either from the property name or the element name (for shorthand)
              const propNameNode = element.getPropertyNameNode();
              const fieldName = propNameNode && Node.isIdentifier(propNameNode) 
                ? propNameNode.getText() 
                : element.getName();
              const destructuredName = element.getName();
              
              // Track nested access on destructured field
              const nestedFields = this.extractFieldsFromVariable(sourceFile, destructuredName);
              if (nestedFields.fields.length > 0) {
                nestedFields.fields.forEach(f => {
                  const fullPath = `${fieldName}.${f}`;
                  if (!visited.has(fullPath)) {
                    fields.add(fullPath);
                    visited.add(fullPath);
                  }
                });
              } else {
                // No nested access, just the field itself
                if (!visited.has(fieldName)) {
                  fields.add(fieldName);
                  visited.add(fieldName);
                }
              }
            }
          }
        }
      }

      // Handle spread operator: { ...varName.data }
      if (Node.isSpreadAssignment(node) || Node.isSpreadElement(node)) {
        const expr = node.getExpression();
        if (this.isDataAccess(expr, varName, dataProperty)) {
          hasOpaque = true;
        }
      }
    });

    return {
      fields: Array.from(fields),
      hasOpaque,
    };
  }

  private extractFieldsFromVariable(
    sourceFile: SourceFile,
    varName: string,
  ): { fields: string[]; hasOpaque: boolean } {
    const fields = new Set<string>();
    let hasOpaque = false;

    sourceFile.forEachDescendant((node) => {
      if (Node.isPropertyAccessExpression(node)) {
        const expr = node.getExpression();
        if (Node.isIdentifier(expr) && expr.getText() === varName) {
          // Build the path but exclude the variable name itself
          const parts: string[] = [];
          let current: any = node;
          
          while (current && Node.isPropertyAccessExpression(current)) {
            const name = current.getName();
            if (name !== varName) {
              parts.unshift(name);
            }
            current = current.getExpression();
          }
          
          if (parts.length > 0) {
            fields.add(parts.join('.'));
          }
        }
      }
    });

    return { fields: Array.from(fields), hasOpaque };
  }

  private extractFieldsFromCallback(
    callback: ArrowFunction,
    paramName: string,
  ): { fields: string[]; hasOpaque: boolean } {
    const fields = new Set<string>();
    let hasOpaque = false;

    callback.forEachDescendant((node) => {
      if (Node.isPropertyAccessExpression(node)) {
        const expr = node.getExpression();
        if (Node.isIdentifier(expr) && expr.getText() === paramName) {
          const fieldPath = this.buildPropertyPath(node);
          if (fieldPath) {
            fields.add(fieldPath);
          }
        }
      } else if (Node.isElementAccessExpression(node)) {
        const expr = node.getExpression();
        if (Node.isIdentifier(expr) && expr.getText() === paramName) {
          const arg = node.getArgumentExpression();
          if (!arg || !Node.isStringLiteral(arg)) {
            hasOpaque = true;
          }
        }
      }
    });

    return {
      fields: Array.from(fields),
      hasOpaque,
    };
  }

  private isDataAccess(expr: Expression, varName: string, dataProperty: string): boolean {
    if (!dataProperty) {
      return Node.isIdentifier(expr) && expr.getText() === varName;
    }

    if (Node.isPropertyAccessExpression(expr)) {
      const name = expr.getName();
      const obj = expr.getExpression();
      return name === dataProperty && Node.isIdentifier(obj) && obj.getText() === varName;
    }

    return false;
  }

  private chainsBackToData(node: PropertyAccessExpression, varName: string, dataProperty: string): boolean {
    let current: any = node;
    
    while (current) {
      if (Node.isPropertyAccessExpression(current)) {
        const obj = current.getExpression();
        
        // Check if we found the data access
        if (this.isDataAccess(current, varName, dataProperty)) {
          return true;
        }
        
        // Continue walking down
        current = obj;
      } else if (Node.isCallExpression(current)) {
        // Walk through call expressions (like filter results)
        const expr = current.getExpression();
        current = expr;
      } else {
        break;
      }
    }
    
    return false;
  }

  private isDirectDataPropertyAccess(
    node: PropertyAccessExpression,
    varName: string,
    dataProperty: string,
  ): boolean {
    // Walk up to find if this chain starts with varName.data
    let current: any = node;
    while (current && Node.isPropertyAccessExpression(current)) {
      const expr = current.getExpression();
      if (Node.isPropertyAccessExpression(expr)) {
        const name = expr.getName();
        const obj = expr.getExpression();
        if (name === dataProperty && Node.isIdentifier(obj) && obj.getText() === varName) {
          return true;
        }
      }
      current = expr;
    }
    return false;
  }

  private buildPropertyPath(node: PropertyAccessExpression): string | null {
    const parts: string[] = [];
    let current: any = node;

    while (current && Node.isPropertyAccessExpression(current)) {
      parts.unshift(current.getName());
      current = current.getExpression();
    }

    // Filter out 'data' and any method calls like 'map', 'filter'
    const filtered = parts.filter(p => p !== 'data' && !['map', 'filter', 'find', 'some', 'every', 'forEach'].includes(p));

    return filtered.length > 0 ? filtered.join('.') : null;
  }

  private extractPropChainInfo(
    node: PropertyAccessExpression,
    propsName: string,
  ): { propName: string; isLeaf: boolean } | null {
    // Walk down to find if this chain starts with props.propName
    let current: any = node;
    const chain: string[] = [];
    
    while (current && Node.isPropertyAccessExpression(current)) {
      chain.unshift(current.getName());
      current = current.getExpression();
    }

    // Check if it starts with props
    if (!current || !Node.isIdentifier(current) || current.getText() !== propsName) {
      return null;
    }

    // The first element after props is the prop name
    if (chain.length === 0) {
      return null;
    }

    const propName = chain[0];
    
    // Check if this is a leaf (not part of a longer chain)
    const parent = node.getParent();
    const isLeaf = !parent || !Node.isPropertyAccessExpression(parent);

    return { propName, isLeaf };
  }

  private extractFieldPathFromPropChain(
    node: PropertyAccessExpression,
    _propsName: string,
    propName: string,
  ): string | null {
    const parts: string[] = [];
    let current: any = node;

    // Build the full chain
    while (current && Node.isPropertyAccessExpression(current)) {
      parts.unshift(current.getName());
      current = current.getExpression();
    }

    // Find the index of the prop name and take everything after it
    const propIndex = parts.indexOf(propName);
    if (propIndex === -1) {
      return null;
    }

    const fieldParts = parts.slice(propIndex + 1);
    return fieldParts.length > 0 ? fieldParts.join('.') : null;
  }
}
