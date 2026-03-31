/**
 * Component prop field analyzer — extracts which fields each component
 * accesses on each of its props.
 *
 * Used by the field selection manifest to build the cross-file mapping
 * of component → prop → accessed fields.
 *
 * Uses ts.createSourceFile (no type checker) for lightweight analysis.
 */
import ts from 'typescript';

export interface ComponentPropFields {
  /** Component name (PascalCase) */
  componentName: string;
  /** Map of prop name → field access info */
  props: Record<string, PropFieldAccess>;
}

export interface PropFieldAccess {
  /** Fields accessed on this prop */
  fields: string[];
  /** Whether opaque access detected (spread, dynamic key) */
  hasOpaqueAccess: boolean;
  /** Props forwarded to child components via JSX */
  forwarded: PropForward[];
}

export interface PropForward {
  /** Component name as written in JSX */
  componentName: string;
  /** Import specifier (e.g., './user-card') or null if locally defined */
  importSource: string | null;
  /** Prop name on the child component */
  propName: string;
}

/**
 * Analyze a single file for component prop field access.
 * Returns info about each exported component's prop field usage.
 */
export function analyzeComponentPropFields(
  filePath: string,
  sourceText: string,
): ComponentPropFields[] {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const results: ComponentPropFields[] = [];

  // Find exported component functions
  for (const stmt of sourceFile.statements) {
    // export function ComponentName({ prop1, prop2 }: Props) { ... }
    if (ts.isFunctionDeclaration(stmt) && hasExportModifier(stmt) && stmt.name) {
      const name = stmt.name.getText(sourceFile);
      if (isPascalCase(name) && stmt.body) {
        const propNames = extractDestructuredProps(stmt, sourceFile);
        if (propNames.length > 0) {
          const props = analyzePropsFieldAccess(stmt.body, propNames, sourceFile);
          results.push({ componentName: name, props });
        }
      }
    }

    // export const ComponentName = ({ prop1 }: Props) => { ... }
    if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          const name = decl.name.getText(sourceFile);
          if (isPascalCase(name)) {
            const init = decl.initializer;
            if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
              const propNames = extractFunctionExprProps(init);
              if (propNames.length > 0 && init.body && ts.isBlock(init.body)) {
                const props = analyzePropsFieldAccess(init.body, propNames, sourceFile);
                results.push({ componentName: name, props });
              }
            }
          }
        }
      }
    }
  }

  return results;
}

/**
 * Extract destructured prop names from a component function's first parameter.
 */
function extractDestructuredProps(
  node: ts.FunctionDeclaration,
  _sourceFile: ts.SourceFile,
): string[] {
  const param = node.parameters[0];
  if (!param) return [];
  return extractBindingNames(param.name);
}

/**
 * Extract destructured prop names from an arrow/function expression's first parameter.
 */
function extractFunctionExprProps(node: ts.ArrowFunction | ts.FunctionExpression): string[] {
  const param = node.parameters[0];
  if (!param) return [];
  return extractBindingNames(param.name);
}

function extractBindingNames(name: ts.BindingName): string[] {
  if (ts.isObjectBindingPattern(name)) {
    const names: string[] = [];
    for (const element of name.elements) {
      if (ts.isIdentifier(element.name)) {
        names.push(element.name.text);
      }
    }
    return names;
  }
  return [];
}

/**
 * Track field access on each prop within a function body.
 */
function analyzePropsFieldAccess(
  body: ts.Block,
  propNames: string[],
  sourceFile: ts.SourceFile,
): Record<string, PropFieldAccess> {
  const result: Record<string, PropFieldAccess> = {};
  const propSet = new Set(propNames);
  const imports = collectImports(sourceFile);

  for (const propName of propNames) {
    result[propName] = { fields: [], hasOpaqueAccess: false, forwarded: [] };
  }

  function visit(node: ts.Node): void {
    // Track prop.field access
    if (ts.isPropertyAccessExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && propSet.has(expr.text)) {
        const propName = expr.text;
        const fieldName = node.name.text;
        const access = result[propName];
        if (access && !access.fields.includes(fieldName)) {
          access.fields.push(fieldName);
        }
      }
    }

    // Track spread on prop → opaque
    if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) {
      const spreadExpr = node.expression;
      if (ts.isIdentifier(spreadExpr) && propSet.has(spreadExpr.text)) {
        const access = result[spreadExpr.text];
        if (access) access.hasOpaqueAccess = true;
      }
    }

    // Track dynamic key access on prop → opaque
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      propSet.has(node.expression.text) &&
      !ts.isNumericLiteral(node.argumentExpression)
    ) {
      const access = result[node.expression.text];
      if (access) access.hasOpaqueAccess = true;
    }

    // Track JSX prop forwarding: <Component propName={propVar} />
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (isPascalCase(tagName)) {
        for (const attr of node.attributes.properties) {
          if (ts.isJsxAttribute(attr) && attr.initializer) {
            const attrName = attr.name.getText(sourceFile);
            // Check if the value is a prop reference: {propVar}
            if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
              const valueExpr = attr.initializer.expression;
              if (ts.isIdentifier(valueExpr) && propSet.has(valueExpr.text)) {
                const propName = valueExpr.text;
                const access = result[propName];
                if (access) {
                  const importSource = imports.get(tagName) ?? null;
                  access.forwarded.push({
                    componentName: tagName,
                    importSource,
                    propName: attrName,
                  });
                }
              }
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(body);
  return result;
}

/**
 * Collect import specifiers for all named imports.
 * Returns map of localName → moduleSpecifier.
 */
function collectImports(sourceFile: ts.SourceFile): Map<string, string> {
  const imports = new Map<string, string>();
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const moduleSpecifier = stmt.moduleSpecifier.getText(sourceFile).replace(/^['"]|['"]$/g, '');
      const clause = stmt.importClause;
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          const localName = el.name.getText(sourceFile);
          imports.set(localName, moduleSpecifier);
        }
      }
      if (clause?.name) {
        imports.set(clause.name.getText(sourceFile), moduleSpecifier);
      }
    }
  }
  return imports;
}

function isPascalCase(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function hasExportModifier(node: ts.Statement): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  if (!mods) return false;
  return mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}
