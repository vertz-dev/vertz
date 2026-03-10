/**
 * Field selection analyzer — lightweight single-file analysis for VertzQL auto field selection.
 *
 * Uses ts.createSourceFile (no type checker) to:
 * 1. Find query() calls and the variable they're assigned to
 * 2. Track field access on the query variable's .data/.data.items paths
 * 3. Return which fields each query accesses
 *
 * Used by the Bun plugin to inject `select` into descriptor calls.
 */
import { ts } from 'ts-morph';

export type InjectionKind =
  /** No args: api.users.list() → insert `{ select: {...} }` */
  | 'insert-arg'
  /** First arg is object literal: api.users.list({ status }) → insert `, select: {...}` */
  | 'merge-into-object'
  /** First arg is not an object: api.users.get(id) → insert `, { select: {...} }` */
  | 'append-arg';

export interface PropFlow {
  /** Component name as written in JSX (PascalCase) */
  componentName: string;
  /** Import specifier (e.g., './user-card') or null if not imported */
  importSource: string | null;
  /** Prop name on the component receiving the data */
  propName: string;
}

export interface QueryFieldSelection {
  /** Variable name assigned from query() call (e.g., 'users') */
  queryVar: string;
  /** AST position where the injection should occur */
  injectionPos: number;
  /** How the select should be injected */
  injectionKind: InjectionKind;
  /** Collected leaf field names (e.g., ['name', 'email']) */
  fields: string[];
  /** True if any opaque access detected (spread, dynamic key, pass to function) */
  hasOpaqueAccess: boolean;
  /** Components receiving data from this query via JSX props */
  propFlows: PropFlow[];
}

/**
 * Analyze a single file's source code for query field access.
 * Returns one entry per query() call in the file.
 */
export function analyzeFieldSelection(filePath: string, sourceText: string): QueryFieldSelection[] {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const results: QueryFieldSelection[] = [];

  // Step 0: Collect imports for resolving component sources
  const imports = collectImports(sourceFile);

  // Step 1: Find query() variable declarations
  const queryVars = findQueryVariables(sourceFile);

  // Step 2: For each query variable, track field access throughout the file
  for (const qv of queryVars) {
    const { fields, hasOpaqueAccess, propFlows } = trackFieldAccess(
      sourceFile,
      qv.varName,
      imports,
    );
    results.push({
      queryVar: qv.varName,
      injectionPos: qv.injectionPos,
      injectionKind: qv.injectionKind,
      fields: [...new Set(fields)],
      hasOpaqueAccess,
      propFlows,
    });
  }

  return results;
}

interface QueryVarInfo {
  varName: string;
  injectionPos: number;
  injectionKind: InjectionKind;
}

/**
 * Find variable declarations of the form: const x = query(descriptorCall(...))
 */
function findQueryVariables(sourceFile: ts.SourceFile): QueryVarInfo[] {
  const results: QueryVarInfo[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      const callExpr = node.initializer;
      const callee = callExpr.expression;

      // Check if it's query(...)
      if (ts.isIdentifier(callee) && callee.text === 'query' && callExpr.arguments.length > 0) {
        // Check for // @vertz-select-all pragma on the preceding line
        if (hasPragma(node, sourceFile)) {
          return; // Skip this query
        }

        const innerArg = callExpr.arguments[0];

        // The inner argument should be a call expression (the descriptor call)
        if (innerArg && ts.isCallExpression(innerArg)) {
          const varName = node.name.getText(sourceFile);
          const { injectionPos, injectionKind } = computeInjectionPoint(innerArg, sourceFile);
          results.push({
            varName,
            injectionPos,
            injectionKind,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return results;
}

/**
 * Track all field accesses on a query variable throughout the file.
 *
 * Recognized patterns:
 * - varName.data.field (single entity get)
 * - varName.data.items.map(item => item.field) (list query)
 * - varName.data.items[i].field (index access)
 * - Destructuring: const { field } = varName.data
 * - Opaque: spread, dynamic key, pass to function
 */
function trackFieldAccess(
  sourceFile: ts.SourceFile,
  varName: string,
  imports: Map<string, string>,
): { fields: string[]; hasOpaqueAccess: boolean; propFlows: PropFlow[] } {
  const fields: string[] = [];
  const propFlows: PropFlow[] = [];
  let hasOpaqueAccess = false;

  // Track which callback params map to this query variable's data items
  const callbackParamsFromQuery = new Set<string>();

  function visit(node: ts.Node): void {
    // Track property access chains on the variable
    if (ts.isPropertyAccessExpression(node)) {
      const chain = buildPropertyChain(node, sourceFile);
      if (chain && chain[0] === varName) {
        const fieldPath = extractFieldFromChain(chain);
        if (fieldPath) {
          fields.push(fieldPath);
        }
      }
    }

    // Track array method callbacks: varName.data.items.map(item => item.field)
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        const methodName = callee.name.text;
        if (['map', 'filter', 'find', 'forEach', 'some', 'every'].includes(methodName)) {
          const chain = buildPropertyChain(callee.expression, sourceFile);
          if (
            chain &&
            chain[0] === varName &&
            (chain.includes('items') || chain.includes('data'))
          ) {
            // Analyze callback parameter field access
            const callback = node.arguments[0];
            if (callback) {
              const paramName = getCallbackParamName(callback, sourceFile);
              if (paramName) {
                callbackParamsFromQuery.add(paramName);
                const callbackFields = trackCallbackFieldAccess(
                  callback,
                  paramName,
                  sourceFile,
                  imports,
                  propFlows,
                );
                fields.push(...callbackFields.fields);
                if (callbackFields.hasOpaqueAccess) hasOpaqueAccess = true;
              }
            }
          }
        }
      }
    }

    // Track JSX prop passing: <Component propName={varName.data} />
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (/^[A-Z]/.test(tagName)) {
        for (const attr of node.attributes.properties) {
          if (ts.isJsxAttribute(attr) && attr.initializer && ts.isJsxExpression(attr.initializer)) {
            const valueExpr = attr.initializer.expression;
            if (valueExpr) {
              // Check if value traces to query variable's data path
              if (ts.isPropertyAccessExpression(valueExpr)) {
                const chain = buildPropertyChain(valueExpr, sourceFile);
                if (chain && chain[0] === varName && chain.includes('data')) {
                  const attrName = attr.name.getText(sourceFile);
                  propFlows.push({
                    componentName: tagName,
                    importSource: imports.get(tagName) ?? null,
                    propName: attrName,
                  });
                }
              }
            }
          }
        }
      }
    }

    // Track spread operator → opaque
    if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) {
      const spreadExpr = ts.isSpreadElement(node) ? node.expression : node.expression;
      if (ts.isIdentifier(spreadExpr) && spreadExpr.text === varName) {
        hasOpaqueAccess = true;
      }
      if (ts.isPropertyAccessExpression(spreadExpr)) {
        const chain = buildPropertyChain(spreadExpr, sourceFile);
        if (chain && chain[0] === varName) {
          hasOpaqueAccess = true;
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { fields, hasOpaqueAccess, propFlows };
}

/**
 * Build a property access chain from a PropertyAccessExpression.
 * e.g., users.data.items → ['users', 'data', 'items']
 */
function buildPropertyChain(node: ts.Expression, _sourceFile: ts.SourceFile): string[] | null {
  const chain: string[] = [];
  let current: ts.Expression = node;

  while (ts.isPropertyAccessExpression(current)) {
    chain.unshift(current.name.text);
    current = current.expression;
  }

  // Handle element access: users.data.items[0]
  if (ts.isElementAccessExpression(current)) {
    current = current.expression;
    while (ts.isPropertyAccessExpression(current)) {
      chain.unshift(current.name.text);
      current = current.expression;
    }
  }

  if (ts.isIdentifier(current)) {
    chain.unshift(current.text);
    return chain;
  }

  return null;
}

/**
 * Extract the entity field name from a property chain.
 *
 * For list queries: ['users', 'data', 'items', X, 'fieldName'] → 'fieldName'
 * For get queries:  ['users', 'data', 'fieldName'] → 'fieldName'
 *
 * Skips 'data' and 'items' as they're structural, not entity fields.
 */
function extractFieldFromChain(chain: string[]): string | null {
  // Skip the variable name
  const path = chain.slice(1);

  // Strip structural properties: data, items
  const structural = new Set(['data', 'items']);
  const fieldParts: string[] = [];
  for (const part of path) {
    if (!structural.has(part)) {
      fieldParts.push(part);
    }
  }

  // Skip known non-entity properties
  const nonEntityProps = new Set([
    // Signal properties
    'loading',
    'error',
    'revalidating',
    'refetch',
    'revalidate',
    'dispose',
    // Array methods (accessed on .data.items)
    'map',
    'filter',
    'find',
    'forEach',
    'some',
    'every',
    'reduce',
    'flatMap',
    'includes',
    'indexOf',
    'length',
    'slice',
    'sort',
  ]);
  if (fieldParts.length === 1 && fieldParts[0] && nonEntityProps.has(fieldParts[0])) {
    return null;
  }

  return fieldParts.length > 0 ? (fieldParts[0] ?? null) : null;
}

/**
 * Compute the injection point and kind for a descriptor call.
 *
 * - No args: `api.users.list()` → insert-arg, position before `)`
 * - Object literal arg: `api.users.list({ status })` → merge-into-object, position before `}`
 * - Non-object arg: `api.users.get(id)` → append-arg, position before `)`
 */
function computeInjectionPoint(
  descriptorCall: ts.CallExpression,
  _sourceFile: ts.SourceFile,
): { injectionPos: number; injectionKind: InjectionKind } {
  if (descriptorCall.arguments.length === 0) {
    return {
      injectionPos: descriptorCall.end - 1, // Before closing paren
      injectionKind: 'insert-arg',
    };
  }

  const firstArg = descriptorCall.arguments[0]!;

  if (ts.isObjectLiteralExpression(firstArg)) {
    // Merge into the existing object literal
    return {
      injectionPos: firstArg.end - 1, // Before closing }
      injectionKind: 'merge-into-object',
    };
  }

  // Non-object argument (e.g., id) → append as new argument
  const lastArg = descriptorCall.arguments[descriptorCall.arguments.length - 1]!;
  return {
    injectionPos: lastArg.end,
    injectionKind: 'append-arg',
  };
}

/**
 * Check if a node has a `// @vertz-select-all` pragma comment
 * on the line immediately preceding the variable declaration.
 */
function hasPragma(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  // Walk up to the VariableStatement (the full `const x = query(...)` line)
  let current: ts.Node = node;
  while (current.parent && !ts.isVariableStatement(current)) {
    current = current.parent;
  }

  const leadingComments = ts.getLeadingCommentRanges(sourceFile.text, current.pos);
  if (leadingComments) {
    for (const comment of leadingComments) {
      const text = sourceFile.text.slice(comment.pos, comment.end);
      if (text.includes('@vertz-select-all')) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get the parameter name from a callback expression.
 * Handles: (item) => ..., item => ..., function(item) { ... }
 */
function getCallbackParamName(node: ts.Expression, _sourceFile: ts.SourceFile): string | null {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const param = node.parameters[0];
    if (param && ts.isIdentifier(param.name)) {
      return param.name.text;
    }
  }
  return null;
}

/**
 * Track field access within a callback function body.
 */
function trackCallbackFieldAccess(
  callback: ts.Expression,
  paramName: string,
  sourceFile: ts.SourceFile,
  imports: Map<string, string>,
  propFlows: PropFlow[],
): { fields: string[]; hasOpaqueAccess: boolean } {
  const fields: string[] = [];
  let hasOpaqueAccess = false;

  function visit(node: ts.Node): void {
    if (ts.isPropertyAccessExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === paramName) {
        fields.push(node.name.text);
      }
    }

    // Dynamic key access on param → opaque
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === paramName &&
      !ts.isNumericLiteral(node.argumentExpression)
    ) {
      hasOpaqueAccess = true;
    }

    // Spread of param → opaque
    if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) {
      const expr = ts.isSpreadElement(node) ? node.expression : node.expression;
      if (ts.isIdentifier(expr) && expr.text === paramName) {
        hasOpaqueAccess = true;
      }
    }

    // JSX prop passing in callback: <Component propName={paramName} />
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (/^[A-Z]/.test(tagName)) {
        for (const attr of node.attributes.properties) {
          if (ts.isJsxAttribute(attr) && attr.initializer && ts.isJsxExpression(attr.initializer)) {
            const valueExpr = attr.initializer.expression;
            if (valueExpr && ts.isIdentifier(valueExpr) && valueExpr.text === paramName) {
              const attrName = attr.name.getText(sourceFile);
              propFlows.push({
                componentName: tagName,
                importSource: imports.get(tagName) ?? null,
                propName: attrName,
              });
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) {
    visit(callback.body);
  }

  return { fields, hasOpaqueAccess };
}

/**
 * Collect import specifiers for named imports.
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
          imports.set(el.name.getText(sourceFile), moduleSpecifier);
        }
      }
      if (clause?.name) {
        imports.set(clause.name.getText(sourceFile), moduleSpecifier);
      }
    }
  }
  return imports;
}
