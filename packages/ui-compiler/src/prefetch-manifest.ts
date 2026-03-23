/**
 * Prefetch manifest generator — produces a route → component → query mapping
 * for SSR single-pass prefetching via static AST analysis.
 *
 * Uses ts.createSourceFile() for performance (no type checker needed).
 * Reuses import resolution from manifest-resolver.ts.
 */
import { ts } from 'ts-morph';

// ─── Types ──────────────────────────────────────────────────────

export interface QueryBindings {
  where?: Record<string, string | null>;
  select?: Record<string, true>;
  include?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
}

export interface ExtractedQuery {
  /** Descriptor factory chain, e.g. 'api.issues.list' or 'api.projects.get' */
  descriptorChain: string;
  /** Entity name parsed from the chain, e.g. 'issues' */
  entity?: string;
  /** Operation name parsed from the chain, e.g. 'list' or 'get' */
  operation?: string;
  /** For get(param) calls — the route param identifier used as the entity ID */
  idParam?: string;
  /** Bindings extracted from the descriptor factory arguments (where, select, etc.) */
  queryBindings?: QueryBindings;
}

export interface ComponentAnalysis {
  /** All query() calls found in the component */
  queries: ExtractedQuery[];
  /** Route params from useParams() destructuring */
  params: string[];
}

export interface ImportInfo {
  localName: string;
  originalName: string;
  source: string;
}

export interface ManifestRoute {
  pattern: string;
  componentName: string;
  type: 'layout' | 'page';
  file?: string;
  queries: ExtractedQuery[];
  params: string[];
}

export interface PrefetchManifest {
  routes: ManifestRoute[];
  unanalyzable: Array<{ pattern: string; file?: string; reason: string }>;
  generatedAt: string;
}

export interface GeneratePrefetchManifestOptions {
  routerSource: string;
  routerPath: string;
  readFile: (path: string) => string | undefined;
  resolveImport: (specifier: string, fromFile: string) => string | undefined;
}

export interface ExtractedRoute {
  /** Full route pattern (e.g., '/projects/:projectId/board') */
  pattern: string;
  /** Component name referenced in the route (e.g., 'ProjectBoardPage') */
  componentName: string;
  /** Whether this is a layout (has children) or a page (leaf) */
  type: 'layout' | 'page';
  /** Child routes (before flattening) */
  children?: ExtractedRoute[];
}

// ─── Route Extraction ───────────────────────────────────────────

/**
 * Extract routes from a source file containing defineRoutes() calls.
 * Returns a flat list of routes with their component references.
 */
export function extractRoutes(sourceText: string, filePath: string): ExtractedRoute[] {
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  // Find defineRoutes(...) call
  const routeObj = findDefineRoutesArg(sf);
  if (!routeObj) return [];

  // Parse the object literal into routes
  const nested = parseRouteObject(routeObj, sf);

  // Flatten nested routes into full patterns
  return flattenRoutes(nested, '');
}

// ─── Internal Helpers ───────────────────────────────────────────

function findDefineRoutesArg(sf: ts.SourceFile): ts.ObjectLiteralExpression | undefined {
  let result: ts.ObjectLiteralExpression | undefined;

  function visit(node: ts.Node): void {
    if (result) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineRoutes' &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      result = node.arguments[0];
      return;
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sf, visit);
  return result;
}

function parseRouteObject(obj: ts.ObjectLiteralExpression, sf: ts.SourceFile): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];

  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;

    const pattern = stripQuotes(prop.name.getText(sf));
    if (!ts.isObjectLiteralExpression(prop.initializer)) continue;

    const routeObj = prop.initializer;
    let componentName: string | undefined;
    let children: ExtractedRoute[] | undefined;

    for (const inner of routeObj.properties) {
      if (!ts.isPropertyAssignment(inner)) continue;
      const key = inner.name.getText(sf);

      if (key === 'component') {
        componentName = extractComponentName(inner.initializer, sf);
      } else if (key === 'children' && ts.isObjectLiteralExpression(inner.initializer)) {
        children = parseRouteObject(inner.initializer, sf);
      }
    }

    if (componentName) {
      const hasChildren = children && children.length > 0;
      routes.push({
        pattern,
        componentName,
        type: hasChildren ? 'layout' : 'page',
        children: hasChildren ? children : undefined,
      });
    }
  }

  return routes;
}

/**
 * Extract the outermost component name from a route's component property value.
 * Handles: `() => <ComponentName />` and `() => <Wrapper>...</Wrapper>` (extracts `Wrapper`).
 */
function extractComponentName(expr: ts.Expression, sf: ts.SourceFile): string | undefined {
  // Unwrap arrow function: () => <Foo />
  if (ts.isArrowFunction(expr)) {
    return extractComponentNameFromExpr(expr.body as ts.Expression, sf);
  }
  return undefined;
}

function extractComponentNameFromExpr(expr: ts.Expression, sf: ts.SourceFile): string | undefined {
  if (ts.isParenthesizedExpression(expr)) {
    return extractComponentNameFromExpr(expr.expression, sf);
  }
  // <ComponentName /> — self-closing
  if (ts.isJsxSelfClosingElement(expr)) {
    return expr.tagName.getText(sf);
  }
  // <ComponentName>...</ComponentName>
  if (ts.isJsxElement(expr)) {
    return expr.openingElement.tagName.getText(sf);
  }
  return undefined;
}

function flattenRoutes(routes: ExtractedRoute[], parentPattern: string): ExtractedRoute[] {
  const flat: ExtractedRoute[] = [];

  for (const route of routes) {
    const fullPattern = joinPatterns(parentPattern, route.pattern);

    flat.push({
      pattern: fullPattern,
      componentName: route.componentName,
      type: route.type,
    });

    if (route.children) {
      flat.push(...flattenRoutes(route.children, fullPattern));
    }
  }

  return flat;
}

function joinPatterns(parent: string, child: string): string {
  if (!parent) return child;
  if (child === '/') return parent;
  // Remove trailing slash from parent before joining
  const base = parent.endsWith('/') ? parent.slice(0, -1) : parent;
  return `${base}${child}`;
}

function stripQuotes(text: string): string {
  return text.replace(/^['"]|['"]$/g, '');
}

// ─── Component Query Extraction ─────────────────────────────────

/**
 * Analyze a component file to find query() calls and useParams() dependencies.
 * Extracts descriptor factory chains (e.g., 'api.issues.list') and route params.
 */
export function analyzeComponentQueries(sourceText: string, filePath: string): ComponentAnalysis {
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const queries: ExtractedQuery[] = [];
  const params: string[] = [];

  // First pass: collect useParams() destructured params so we know which
  // identifiers are route params when we encounter them in query() calls.
  function collectParams(node: ts.Node): void {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isObjectBindingPattern(decl.name) &&
          decl.initializer &&
          ts.isCallExpression(decl.initializer) &&
          ts.isIdentifier(decl.initializer.expression) &&
          decl.initializer.expression.text === 'useParams'
        ) {
          for (const el of decl.name.elements) {
            if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
              params.push(el.name.text);
            }
          }
        }
      }
    }
    ts.forEachChild(node, collectParams);
  }
  ts.forEachChild(sf, collectParams);

  // Second pass: extract query() calls with binding information.
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'query' &&
      node.arguments.length > 0
    ) {
      const queryInfo = extractQueryInfo(node.arguments[0], sf, params);
      if (queryInfo) {
        queries.push(queryInfo);
      }
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sf, visit);

  return { queries, params };
}

/**
 * Extract full query info from a query() argument: descriptor chain, entity,
 * operation, ID param binding, and query option bindings (where, select, etc.).
 */
function extractQueryInfo(
  arg: ts.Expression,
  sf: ts.SourceFile,
  routeParams: string[],
): ExtractedQuery | undefined {
  // query(api.entity.method(...)) — the arg is a call expression
  if (ts.isCallExpression(arg)) {
    const chain = extractPropertyAccessChain(arg.expression, sf);
    if (!chain) return undefined;

    const { entity, operation } = parseEntityOperation(chain);
    const query: ExtractedQuery = { descriptorChain: chain, entity, operation };

    // Extract argument bindings based on operation type
    if (operation === 'get' && arg.arguments.length > 0) {
      // get(id) or get(id, { select: {...} })
      const idArg = arg.arguments[0];
      if (ts.isIdentifier(idArg) && routeParams.includes(idArg.text)) {
        query.idParam = idArg.text;
      }
      // Second argument is options object: { select: {...} }
      if (arg.arguments.length > 1 && ts.isObjectLiteralExpression(arg.arguments[1])) {
        const bindings = extractObjectBindings(arg.arguments[1], sf, routeParams);
        if (bindings) query.queryBindings = bindings;
      }
    } else if (arg.arguments.length > 0 && ts.isObjectLiteralExpression(arg.arguments[0])) {
      // list({ where: {...}, select: {...}, ... })
      const bindings = extractObjectBindings(arg.arguments[0], sf, routeParams);
      if (bindings) query.queryBindings = bindings;
    }

    return query;
  }

  // query(descriptor) — a variable reference (unusual but possible)
  if (ts.isIdentifier(arg)) {
    return { descriptorChain: arg.text };
  }

  return undefined;
}

/**
 * Parse entity name and operation from a descriptor chain.
 * 'api.projects.list' → { entity: 'projects', operation: 'list' }
 * 'api.issues.get' → { entity: 'issues', operation: 'get' }
 */
function parseEntityOperation(chain: string): { entity?: string; operation?: string } {
  const parts = chain.split('.');
  // Expected format: api.<entity>.<operation>
  if (parts.length >= 3) {
    return { entity: parts[1], operation: parts[2] };
  }
  return {};
}

/**
 * Extract query bindings from an object literal argument.
 * Recognizes: where, select, include, orderBy, limit.
 */
function extractObjectBindings(
  obj: ts.ObjectLiteralExpression,
  sf: ts.SourceFile,
  routeParams: string[],
): QueryBindings | undefined {
  const bindings: QueryBindings = {};
  let hasBindings = false;

  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = prop.name.getText(sf);

    switch (key) {
      case 'where': {
        if (ts.isObjectLiteralExpression(prop.initializer)) {
          bindings.where = extractWhereBindings(prop.initializer, sf, routeParams);
          hasBindings = true;
        }
        break;
      }
      case 'select': {
        if (ts.isObjectLiteralExpression(prop.initializer)) {
          bindings.select = extractSelectRecord(prop.initializer, sf);
          hasBindings = true;
        }
        break;
      }
      case 'include': {
        if (ts.isObjectLiteralExpression(prop.initializer)) {
          bindings.include = extractStaticObjectLiteral(prop.initializer, sf);
          hasBindings = true;
        }
        break;
      }
      case 'orderBy': {
        if (ts.isObjectLiteralExpression(prop.initializer)) {
          bindings.orderBy = extractStaticRecord(prop.initializer, sf) as Record<
            string,
            'asc' | 'desc'
          >;
          hasBindings = true;
        }
        break;
      }
      case 'limit': {
        if (ts.isNumericLiteral(prop.initializer)) {
          bindings.limit = Number(prop.initializer.text);
          hasBindings = true;
        }
        break;
      }
    }
  }

  return hasBindings ? bindings : undefined;
}

/**
 * Extract where clause bindings. Values that reference route params become
 * '$paramName'; other identifiers become null (dynamic, cannot resolve statically).
 */
function extractWhereBindings(
  obj: ts.ObjectLiteralExpression,
  sf: ts.SourceFile,
  routeParams: string[],
): Record<string, string | null> {
  const where: Record<string, string | null> = {};

  for (const prop of obj.properties) {
    // Shorthand property: { projectId } (equivalent to { projectId: projectId })
    if (ts.isShorthandPropertyAssignment(prop)) {
      const name = prop.name.getText(sf);
      where[name] = routeParams.includes(name) ? `$${name}` : null;
      continue;
    }

    if (!ts.isPropertyAssignment(prop)) continue;
    const key = prop.name.getText(sf);
    const value = prop.initializer;

    if (ts.isIdentifier(value)) {
      where[key] = routeParams.includes(value.text) ? `$${value.text}` : null;
    } else if (ts.isStringLiteral(value)) {
      where[key] = value.text;
    } else if (ts.isNumericLiteral(value)) {
      where[key] = value.text;
    } else {
      where[key] = null; // Complex expression — cannot resolve statically
    }
  }

  return where;
}

/**
 * Extract a static Record<string, true> from a select object literal.
 */
function extractSelectRecord(
  obj: ts.ObjectLiteralExpression,
  sf: ts.SourceFile,
): Record<string, true> {
  const record: Record<string, true> = {};
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = prop.name.getText(sf);
    if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      record[key] = true;
    }
  }
  return record;
}

/**
 * Extract a static Record<string, unknown> from an object literal (for orderBy).
 */
function extractStaticRecord(
  obj: ts.ObjectLiteralExpression,
  sf: ts.SourceFile,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = prop.name.getText(sf);
    const value = prop.initializer;

    if (value.kind === ts.SyntaxKind.TrueKeyword) {
      record[key] = true;
    } else if (value.kind === ts.SyntaxKind.FalseKeyword) {
      record[key] = false;
    } else if (ts.isStringLiteral(value)) {
      record[key] = value.text;
    } else if (ts.isNumericLiteral(value)) {
      record[key] = Number(value.text);
    }
  }

  return record;
}

/**
 * Extract a static object literal (for include — may contain nested objects or booleans).
 */
function extractStaticObjectLiteral(
  obj: ts.ObjectLiteralExpression,
  sf: ts.SourceFile,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = prop.name.getText(sf);
    const value = prop.initializer;

    if (value.kind === ts.SyntaxKind.TrueKeyword) {
      result[key] = true;
    } else if (value.kind === ts.SyntaxKind.FalseKeyword) {
      result[key] = false;
    } else if (ts.isStringLiteral(value)) {
      result[key] = value.text;
    } else if (ts.isNumericLiteral(value)) {
      result[key] = Number(value.text);
    } else if (ts.isObjectLiteralExpression(value)) {
      result[key] = extractStaticObjectLiteral(value, sf);
    }
  }

  return result;
}

/**
 * Extract a property access chain like api.projects.list → 'api.projects.list'
 */
function extractPropertyAccessChain(expr: ts.Expression, _sf: ts.SourceFile): string | undefined {
  if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  if (ts.isPropertyAccessExpression(expr)) {
    const left = extractPropertyAccessChain(expr.expression, _sf);
    if (left) {
      return `${left}.${expr.name.text}`;
    }
  }
  return undefined;
}

// ─── Import Collection ──────────────────────────────────────────

/**
 * Collect all named imports from a source file.
 */
export function collectImports(sourceText: string, filePath: string): ImportInfo[] {
  const sf = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const imports: ImportInfo[] = [];

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const source = stripQuotes(stmt.moduleSpecifier.getText(sf));
    const clause = stmt.importClause;
    if (!clause) continue;

    // Named imports: import { Foo, Bar } from '...'
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        const originalName = el.propertyName?.getText(sf) ?? el.name.getText(sf);
        const localName = el.name.getText(sf);
        imports.push({ localName, originalName, source });
      }
    }

    // Default import: import Foo from '...'
    if (clause.name) {
      imports.push({
        localName: clause.name.getText(sf),
        originalName: 'default',
        source,
      });
    }
  }

  return imports;
}

// ─── Full Manifest Generation ───────────────────────────────────

/**
 * Generate a complete prefetch manifest from a router file and its component graph.
 *
 * 1. Extract routes from defineRoutes() in the router source
 * 2. Collect imports to map component names → file paths
 * 3. Read each component file and analyze for query() calls
 * 4. Produce the full manifest
 */
export function generatePrefetchManifest(
  options: GeneratePrefetchManifestOptions,
): PrefetchManifest {
  const { routerSource, routerPath, readFile, resolveImport } = options;

  // 1. Extract routes
  const routes = extractRoutes(routerSource, routerPath);

  // 2. Collect imports from router to map component names → module specifiers
  const imports = collectImports(routerSource, routerPath);
  const importMap = new Map<string, string>();
  for (const imp of imports) {
    importMap.set(imp.localName, imp.source);
  }

  // 3. For each route, resolve the component file and analyze for queries
  const manifestRoutes: ManifestRoute[] = [];
  const unanalyzable: Array<{ pattern: string; file?: string; reason: string }> = [];

  for (const route of routes) {
    const specifier = importMap.get(route.componentName);
    let file: string | undefined;
    let queries: ExtractedQuery[] = [];
    let params: string[] = [];

    if (!specifier) {
      unanalyzable.push({
        pattern: route.pattern,
        reason: `Component '${route.componentName}' not found in router imports`,
      });
    } else {
      file = resolveImport(specifier, routerPath);
      if (!file) {
        unanalyzable.push({
          pattern: route.pattern,
          reason: `Could not resolve import '${specifier}' for component '${route.componentName}'`,
        });
      } else {
        const source = readFile(file);
        if (!source) {
          unanalyzable.push({
            pattern: route.pattern,
            file,
            reason: `Could not read file '${file}' for component '${route.componentName}'`,
          });
        } else {
          const analysis = analyzeComponentQueries(source, file);
          queries = analysis.queries;
          params = analysis.params;
        }
      }
    }

    manifestRoutes.push({
      pattern: route.pattern,
      componentName: route.componentName,
      type: route.type,
      file,
      queries,
      params,
    });
  }

  return {
    routes: manifestRoutes,
    unanalyzable,
    generatedAt: new Date().toISOString(),
  };
}
