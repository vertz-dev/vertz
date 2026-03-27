import type MagicString from 'magic-string';
import type { Node, ReturnStatement } from 'ts-morph';
import { type SourceFile, SyntaxKind } from 'ts-morph';
import type { AotComponentInfo, AotTier, ComponentInfo, VariableInfo } from '../types';
import { findBodyNode, isInNestedFunction } from '../utils';

/** Metadata for a query variable extracted from the component AST. */
interface QueryVarMeta {
  /** Original variable name (e.g., 'projects'). */
  varName: string;
  /** Cache key in entity-operation format (e.g., 'projects-list') or template pattern (e.g., 'game-${slug}'). */
  cacheKey: string;
  /** Index for the local binding in the AOT function (e.g., 0 → __q0). */
  index: number;
  /** Derived aliases (e.g., `const d = q.data` → d is alias for __q{index}). */
  derivedAliases: string[];
  /** Route param names referenced in the cache key (e.g., ['slug']). Empty for static keys. */
  paramRefs: string[];
  /** Maps local alias → route param name for aliased destructuring (e.g., gameSlug → slug). */
  paramMap: Map<string, string>;
}

/** A body-level derived variable that should be emitted in the AOT preamble. */
interface DerivedVarDecl {
  /** Variable name (e.g., 'sellerMap'). */
  name: string;
  /** Full declaration source text (e.g., 'const sellerMap = new Map(d.sellers.map(...))') */
  sourceText: string;
}

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

    // Extract query variable metadata for standalone page functions
    const queryVars = this._extractQueryVars(sourceFile, component, variables);

    // Collect derived variable declarations for AOT preamble (#1951)
    const derivedVars = this._collectDerivedVarDecls(bodyNode, s, queryVars, variables);

    // If there are query-like variables that couldn't be resolved, fall back to runtime
    const signalApiVarCount = variables.filter(
      (v) => v.signalProperties && v.signalProperties.has('data'),
    ).length;
    if (signalApiVarCount > 0 && queryVars.length < signalApiVarCount) {
      this._components.push({
        name: component.name,
        tier: 'runtime-fallback',
        holes: [],
        queryKeys: [],
        fallbackReason:
          'query key is not a static string or template literal with useParams() interpolation',
      });
      return;
    }

    // Only count direct returns (not returns inside nested callbacks/functions)
    const allReturnStmts = bodyNode.getDescendantsOfKind(SyntaxKind.ReturnStatement);
    const directReturns = allReturnStmts.filter((ret) => !isInNestedFunction(ret, bodyNode));
    const returnsWithJsx = directReturns.filter((ret) => {
      const expr = ret.getExpression();
      return expr && this._findJsx(expr);
    });

    if (returnsWithJsx.length > 1) {
      // Check for guard pattern: if-return guards + unconditional main return
      const guardResult = this._analyzeGuardPattern(returnsWithJsx, bodyNode, s);
      if (guardResult) {
        const isInteractive = variables.some((v) => v.kind === 'signal');
        this._resetTracking(variables);

        // When there are derived vars after guards, emit early-return guards
        // instead of a ternary — derived vars must execute only in the main path.
        if (derivedVars.length > 0) {
          const guardStrs: Array<{ condition: string; html: string }> = [];
          for (const guard of guardResult.guards) {
            const guardHtml = this._jsxToString(guard.jsx, variables, s, null);
            guardStrs.push({ condition: guard.condition, html: guardHtml });
          }
          const mainStr = this._jsxToString(
            guardResult.mainJsx,
            variables,
            s,
            isInteractive ? component.name : null,
          );
          this._emitAotFunctionWithGuards(s, component, mainStr, guardStrs, queryVars, derivedVars);
          return;
        }

        const stringExpr = this._guardPatternToString(
          guardResult,
          variables,
          s,
          isInteractive ? component.name : null,
        );
        this._emitAotFunction(s, component, 'conditional', stringExpr, queryVars, derivedVars);
        return;
      }
      // Not a guard pattern → runtime-fallback
      this._components.push({
        name: component.name,
        tier: 'runtime-fallback',
        holes: [],
        queryKeys: [],
      });
      return;
    }

    // Find the return statement's JSX
    const returnJsx = this._findReturnJsx(bodyNode);

    if (!returnJsx) {
      // Check for conditional return: `return cond ? <A/> : <B/>` or `return expr && <A/>`
      const conditionalExpr = this._findReturnConditionalExpr(bodyNode);
      if (conditionalExpr) {
        this._resetTracking(variables);
        let stringExpr: string;
        if (conditionalExpr.isKind(SyntaxKind.ConditionalExpression)) {
          stringExpr = this._ternaryToString(conditionalExpr, variables, s);
        } else {
          stringExpr = this._binaryToString(conditionalExpr, variables, s);
        }
        this._emitAotFunction(s, component, 'conditional', stringExpr, queryVars, derivedVars);
        return;
      }
      return;
    }

    // Determine tier based on variables and JSX analysis
    const tier = this._classifyTier(returnJsx, variables);

    // Check if component is interactive (has signal/let declarations)
    const isInteractive = variables.some((v) => v.kind === 'signal');

    // Reset tracking for this component
    this._resetTracking(variables);

    // Build the string expression for the JSX tree
    const stringExpr = this._jsxToString(
      returnJsx,
      variables,
      s,
      isInteractive ? component.name : null,
    );

    this._emitAotFunction(s, component, tier, stringExpr, queryVars, derivedVars);
  }

  private _findReturnJsx(bodyNode: Node): Node | null {
    const returnStmts = bodyNode.getDescendantsOfKind(SyntaxKind.ReturnStatement);
    for (const ret of returnStmts) {
      if (isInNestedFunction(ret, bodyNode)) continue;
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

  /** Reset per-component tracking state. */
  private _resetTracking(variables: VariableInfo[]): void {
    this._currentHoles = new Set();
    this._reactiveNames = new Set(
      variables.filter((v) => v.kind === 'signal' || v.kind === 'computed').map((v) => v.name),
    );
  }

  /** Generate AOT function and record component metadata. */
  private _emitAotFunction(
    s: MagicString,
    component: ComponentInfo,
    tier: AotTier,
    stringExpr: string,
    queryVars?: QueryVarMeta[],
    derivedVars?: DerivedVarDecl[],
  ): void {
    const aotFnName = `__ssr_${component.name}`;
    const hasQueries = queryVars && queryVars.length > 0;

    let paramStr: string;
    let preamble = '';

    if (hasQueries) {
      // Page-level function with query data: (data: Record<string, unknown>, ctx: SSRAotContext)
      paramStr = 'data: Record<string, unknown>, ctx: SSRAotContext';

      // Build local bindings for query data
      for (const qv of queryVars) {
        if (qv.paramRefs.length > 0) {
          // Parameterized key: emit backtick template with ctx.params.* substitutions
          // e.g., 'game-${slug}' → `game-${ctx.params.slug}`
          const resolvedKey = qv.cacheKey.replace(
            /\$\{(\w+)\}/g,
            (_, paramName) => '${ctx.params.' + paramName + '}',
          );
          preamble += `\n  const __q${qv.index} = ctx.getData(\`${resolvedKey}\`);`;
        } else {
          preamble += `\n  const __q${qv.index} = ctx.getData('${qv.cacheKey}');`;
        }
      }

      // Apply query variable replacements to a string (reused for stringExpr and preamble)
      const applyQueryReplacements = (text: string): string => {
        for (const qv of queryVars) {
          const localVar = `__q${qv.index}`;
          text = text.split(`${qv.varName}.data`).join(localVar);
          text = text.split(`${qv.varName}.loading`).join('false');
          text = text.split(`${qv.varName}.error`).join('undefined');
          for (const alias of qv.derivedAliases) {
            text = text.replace(new RegExp(`(?<!\\.)\\b${alias}\\b`, 'g'), localVar);
          }
        }
        return text;
      };

      // Post-process string expression to replace query variable references
      stringExpr = applyQueryReplacements(stringExpr);

      // Emit derived variable declarations in source-order with replacements applied (#1951)
      if (derivedVars && derivedVars.length > 0) {
        for (const dv of derivedVars) {
          preamble += `\n  ${applyQueryReplacements(dv.sourceText)}`;
        }
      }
    } else {
      const propsParam = component.propsParam;
      paramStr = propsParam ? `${propsParam}` : '';

      // Emit derived variable declarations for props-based components
      if (derivedVars && derivedVars.length > 0) {
        for (const dv of derivedVars) {
          preamble += `\n  ${dv.sourceText}`;
        }
      }
    }

    const body = preamble
      ? `${preamble}\n  return ${stringExpr};\n`
      : `\n  return ${stringExpr};\n`;
    const aotFn = `\nexport function ${aotFnName}(${paramStr}): string {${body}}\n`;
    s.appendRight(component.bodyEnd + 1, aotFn);

    this._components.push({
      name: component.name,
      tier,
      holes: [...this._currentHoles],
      queryKeys: hasQueries ? queryVars.map((qv) => qv.cacheKey) : [],
    });
  }

  /**
   * Generate an AOT function with early-return guards followed by derived
   * variable declarations and the main return. Used when derived vars appear
   * after guard returns — the vars must only execute in the main path.
   *
   * Generated shape:
   * ```
   * function __ssr_F(data, ctx) {
   *   const __q0 = ctx.getData('key');
   *   if (!__q0) return '<!--conditional-->..guard..<!--/conditional-->';
   *   const sellerMap = new Map(__q0.sellers.map(...));
   *   return '<!--conditional-->..main..<!--/conditional-->';
   * }
   * ```
   */
  private _emitAotFunctionWithGuards(
    s: MagicString,
    component: ComponentInfo,
    mainStringExpr: string,
    guards: Array<{ condition: string; html: string }>,
    queryVars?: QueryVarMeta[],
    derivedVars?: DerivedVarDecl[],
  ): void {
    const aotFnName = `__ssr_${component.name}`;
    const hasQueries = queryVars && queryVars.length > 0;

    let paramStr: string;
    let body = '';

    // Build replacement helper for query var references
    const applyQueryReplacements = hasQueries
      ? (text: string): string => {
          for (const qv of queryVars) {
            const localVar = `__q${qv.index}`;
            text = text.split(`${qv.varName}.data`).join(localVar);
            text = text.split(`${qv.varName}.loading`).join('false');
            text = text.split(`${qv.varName}.error`).join('undefined');
            for (const alias of qv.derivedAliases) {
              text = text.replace(new RegExp(`(?<!\\.)\\b${alias}\\b`, 'g'), localVar);
            }
          }
          return text;
        }
      : (text: string): string => text;

    if (hasQueries) {
      paramStr = 'data: Record<string, unknown>, ctx: SSRAotContext';
      // Query data bindings
      for (const qv of queryVars) {
        if (qv.paramRefs.length > 0) {
          const resolvedKey = qv.cacheKey.replace(
            /\$\{(\w+)\}/g,
            (_, paramName) => '${ctx.params.' + paramName + '}',
          );
          body += `\n  const __q${qv.index} = ctx.getData(\`${resolvedKey}\`);`;
        } else {
          body += `\n  const __q${qv.index} = ctx.getData('${qv.cacheKey}');`;
        }
      }
    } else {
      paramStr = component.propsParam ? `${component.propsParam}` : '';
    }

    // Early-return guards
    for (const guard of guards) {
      const guardCondition = applyQueryReplacements(guard.condition);
      const guardHtml = applyQueryReplacements(guard.html);
      body += `\n  if (${guardCondition}) return '<!--conditional-->' + ${guardHtml} + '<!--/conditional-->';`;
    }

    // Derived variable declarations (after guards, so they only execute in main path)
    if (derivedVars && derivedVars.length > 0) {
      for (const dv of derivedVars) {
        body += `\n  ${applyQueryReplacements(dv.sourceText)}`;
      }
    }

    // Main return
    const mainExpr = applyQueryReplacements(mainStringExpr);
    body += `\n  return '<!--conditional-->' + ${mainExpr} + '<!--/conditional-->';\n`;

    const aotFn = `\nexport function ${aotFnName}(${paramStr}): string {${body}}\n`;
    s.appendRight(component.bodyEnd + 1, aotFn);

    this._components.push({
      name: component.name,
      tier: 'conditional',
      holes: [...this._currentHoles],
      queryKeys: hasQueries ? queryVars.map((qv) => qv.cacheKey) : [],
    });
  }

  /**
   * Collect useParams() destructured variable names from the component body.
   *
   * Returns a Map<string, string> of local name → route param name.
   * For `const { slug } = useParams()`, maps slug → slug.
   * For `const { slug: gameSlug } = useParams()`, maps gameSlug → slug.
   */
  private _collectUseParamsVars(bodyNode: Node): Map<string, string> {
    const paramMap = new Map<string, string>();
    const varDecls = bodyNode.getDescendantsOfKind(SyntaxKind.VariableDeclaration);

    for (const decl of varDecls) {
      if (isInNestedFunction(decl, bodyNode)) continue;
      const nameNode = asNode(decl.getNameNode());
      if (!nameNode.isKind(SyntaxKind.ObjectBindingPattern)) continue;

      const init = decl.getInitializer();
      if (!init || !init.isKind(SyntaxKind.CallExpression)) continue;

      const callee = init.getExpression();
      if (!callee.isKind(SyntaxKind.Identifier)) continue;
      if (callee.getText() !== 'useParams') continue;

      // Extract each binding element: { slug } or { slug: gameSlug }
      for (const el of nameNode.getElements()) {
        const localName = el.getNameNode().getText();
        // propertyNameNode is present for aliased destructuring: { slug: gameSlug }
        const propertyNameNode = el.getPropertyNameNode();
        const routeParamName = propertyNameNode ? propertyNameNode.getText() : localName;
        paramMap.set(localName, routeParamName);
      }
    }

    return paramMap;
  }

  /**
   * Extract a cache key pattern from a template literal expression.
   *
   * Returns the cache key with ${routeParamName} placeholders and the list of
   * route param names referenced, or null if any interpolation is not a simple
   * identifier from useParams().
   *
   * Example: `game-${slug}` where slug is from useParams() → { cacheKey: 'game-${slug}', paramRefs: ['slug'] }
   * Example: `game-${gameSlug}` where { slug: gameSlug } from useParams() → { cacheKey: 'game-${slug}', paramRefs: ['slug'] }
   */
  private _extractTemplateLiteralKey(
    node: Node,
    useParamsMap: Map<string, string>,
  ): { cacheKey: string; paramRefs: string[] } | null {
    // TemplateExpression: head + spans[]
    // Each span: expression + literal (TemplateMiddle or TemplateTail)
    const head = node.getChildAtIndex(0); // TemplateHead
    if (!head) return null;

    const spans = node.getDescendantsOfKind(SyntaxKind.TemplateSpan);
    if (spans.length === 0) return null;

    const paramRefs: string[] = [];
    // Get head text (e.g., "game-" from `game-${slug}`)
    let cacheKey = head.getText().slice(1, -2); // Remove opening backtick and trailing ${

    for (const span of spans) {
      const expr = span.getChildAtIndex(0); // The interpolated expression
      const literal = span.getChildAtIndex(1); // TemplateMiddle or TemplateTail

      if (!expr || !literal) return null;

      // Only support simple identifiers from useParams()
      if (!expr.isKind(SyntaxKind.Identifier)) return null;

      const localName = expr.getText();
      const routeParamName = useParamsMap.get(localName);
      if (!routeParamName) return null; // Not from useParams() — bail

      paramRefs.push(routeParamName);
      cacheKey += `\${${routeParamName}}`;

      // Append the literal text after the interpolation (remove trailing ` or ${)
      const litText = literal.getText();
      if (litText.endsWith('`')) {
        // TemplateTail — last span
        cacheKey += litText.slice(1, -1); // Remove leading } and trailing `
      } else {
        // TemplateMiddle — more spans follow
        cacheKey += litText.slice(1, -2); // Remove leading } and trailing ${
      }
    }

    return { cacheKey, paramRefs };
  }

  /**
   * Extract query variable metadata from the component body.
   *
   * Scans variable declarations for `query(api.entity.operation())` calls
   * and extracts the cache key in `entity-operation` format.
   */
  private _extractQueryVars(
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
  ): QueryVarMeta[] {
    const queryVars: QueryVarMeta[] = [];

    // Find variables that come from query() — they have signal properties with 'data'
    const signalApiVars = variables.filter(
      (v) => v.signalProperties && v.signalProperties.has('data'),
    );

    if (signalApiVars.length === 0) return queryVars;

    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return queryVars;

    // Collect useParams() destructured variables: local name → route param name
    const useParamsMap = this._collectUseParamsVars(bodyNode);

    const varDecls = bodyNode.getDescendantsOfKind(SyntaxKind.VariableDeclaration);

    for (const qv of signalApiVars) {
      // Find the matching variable declaration in the AST
      for (const decl of varDecls) {
        if (decl.getName() !== qv.name) continue;
        if (isInNestedFunction(decl, bodyNode)) continue;

        const init = decl.getInitializer();
        if (!init || !init.isKind(SyntaxKind.CallExpression)) continue;

        // Verify the callee is 'query' (or an alias)
        const callee = init.getExpression();
        if (!callee.isKind(SyntaxKind.Identifier)) continue;
        const calleeName = callee.getText();
        if (calleeName !== 'query' && calleeName !== 'q') continue;

        // Get the first argument — the descriptor factory call: api.entity.operation()
        const args = init.getArguments();
        if (args.length === 0) continue;

        let cacheKey: string | null = null;
        let paramRefs: string[] = [];

        const firstArg = args[0]!;
        // Strategy 1: api.entity.operation() pattern
        // Note: When the first arg is an ArrowFunction (Pattern B), Strategy 1 returns null.
        // This is expected — Strategy 3 (template literal in options) provides the key.
        if (firstArg.isKind(SyntaxKind.CallExpression)) {
          const descriptorExpr = firstArg.getExpression();
          const chain = this._extractPropertyAccessChain(descriptorExpr);
          if (chain && chain.length >= 3) {
            cacheKey = `${chain[1]}-${chain[2]}`;
          }
        } else if (firstArg.isKind(SyntaxKind.PropertyAccessExpression)) {
          const chain = this._extractPropertyAccessChain(firstArg);
          if (chain && chain.length >= 3) {
            cacheKey = `${chain[1]}-${chain[2]}`;
          }
        }

        // Strategy 2: { key: '...' } static string in options object (second argument)
        if (!cacheKey && args.length >= 2) {
          const secondArg = args[1]!;
          if (secondArg.isKind(SyntaxKind.ObjectLiteralExpression)) {
            for (const prop of secondArg.getProperties()) {
              if (prop.isKind(SyntaxKind.PropertyAssignment) && prop.getName() === 'key') {
                const initializer = prop.getInitializer();
                if (initializer?.isKind(SyntaxKind.StringLiteral)) {
                  cacheKey = initializer.getLiteralText();
                }
                break;
              }
            }
          }
        }

        // Strategy 3: { key: `...${param}...` } template literal in options object
        // Handles Pattern B: query(async () => ..., { key: `game-${slug}` })
        // where slug comes from useParams() destructuring.
        if (!cacheKey && args.length >= 2) {
          const secondArg = args[1]!;
          if (secondArg.isKind(SyntaxKind.ObjectLiteralExpression)) {
            for (const prop of secondArg.getProperties()) {
              if (prop.isKind(SyntaxKind.PropertyAssignment) && prop.getName() === 'key') {
                const initializer = prop.getInitializer();
                if (initializer?.isKind(SyntaxKind.TemplateExpression)) {
                  const extracted = this._extractTemplateLiteralKey(initializer, useParamsMap);
                  if (extracted) {
                    cacheKey = extracted.cacheKey;
                    paramRefs = extracted.paramRefs;
                  }
                }
                break;
              }
            }
          }
        }

        if (!cacheKey) continue;

        // Find derived aliases: const d = queryVar.data → d aliases __q{N}
        const aliases: string[] = [];
        for (const d of varDecls) {
          if (isInNestedFunction(d, bodyNode)) continue;
          const dInit = d.getInitializer();
          if (!dInit) continue;
          // Match: const d = queryVar.data
          if (
            dInit.isKind(SyntaxKind.PropertyAccessExpression) &&
            dInit.getExpression().getText() === qv.name &&
            dInit.getName() === 'data'
          ) {
            aliases.push(d.getName());
          }
        }

        queryVars.push({
          varName: qv.name,
          cacheKey,
          index: queryVars.length,
          derivedAliases: aliases,
          paramRefs,
          paramMap: useParamsMap,
        });
        break;
      }
    }

    return queryVars;
  }

  /**
   * Collect body-level derived variable declarations that need to be included
   * in the AOT function preamble (#1951).
   *
   * Returns declarations that are NOT: query vars, data aliases, useParams, or
   * signal/signal-API vars. These are intermediate computations that must be
   * emitted in source-order in the AOT function for references to resolve.
   */
  private _collectDerivedVarDecls(
    bodyNode: Node,
    s: MagicString,
    queryVars: QueryVarMeta[],
    variables: VariableInfo[],
  ): DerivedVarDecl[] {
    // Build the set of "known" variable names handled by the AOT system
    const knownNames = new Set<string>();
    for (const qv of queryVars) {
      knownNames.add(qv.varName);
      for (const alias of qv.derivedAliases) {
        knownNames.add(alias);
      }
    }
    for (const v of variables) {
      if (v.kind === 'signal') knownNames.add(v.name);
      if (v.signalProperties && v.signalProperties.size > 0) knownNames.add(v.name);
    }

    const derived: DerivedVarDecl[] = [];
    // Walk top-level statements in source order
    const stmts = bodyNode.getChildSyntaxList()?.getChildren() ?? [];
    for (const stmt of stmts) {
      if (!stmt.isKind(SyntaxKind.VariableStatement)) continue;
      const declList = stmt.getChildrenOfKind(SyntaxKind.VariableDeclarationList)[0];
      if (!declList) continue;

      for (const decl of declList.getDeclarations()) {
        const name = decl.getName();
        if (knownNames.has(name)) continue;

        // Skip useParams() calls — resolved via ctx.params
        const init = decl.getInitializer();
        if (init && init.isKind(SyntaxKind.CallExpression)) {
          const callee = init.getExpression();
          if (callee.isKind(SyntaxKind.Identifier) && callee.getText() === 'useParams') continue;
        }

        // Extract the full VariableStatement source text (includes const/let keyword)
        const sourceText = s.slice(stmt.getStart(), stmt.getEnd());
        derived.push({ name, sourceText });
      }
    }

    return derived;
  }

  /** Extract a property access chain from a node. Returns segments like ['api', 'projects', 'list']. */
  private _extractPropertyAccessChain(node: Node): string[] | null {
    if (node.isKind(SyntaxKind.Identifier)) {
      return [node.getText()];
    }

    if (node.isKind(SyntaxKind.PropertyAccessExpression)) {
      const children = node.getChildren();
      // PropertyAccessExpression: [object, DotToken, name]
      const object = children[0];
      const name = children[children.length - 1];
      if (!object || !name) return null;

      const prefix = this._extractPropertyAccessChain(object);
      if (!prefix) return null;

      return [...prefix, name.getText()];
    }

    return null;
  }

  /**
   * Find a return statement whose expression is a ConditionalExpression or
   * BinaryExpression containing JSX (e.g., `return d ? <A/> : <B/>` or
   * `return show && <A/>`). These are not caught by _findReturnJsx because
   * _findJsx only matches direct JSX nodes.
   */
  private _findReturnConditionalExpr(bodyNode: Node): Node | null {
    const allReturns = bodyNode.getDescendantsOfKind(SyntaxKind.ReturnStatement);
    const directReturns = allReturns.filter((ret) => !isInNestedFunction(ret, bodyNode));
    for (const ret of directReturns) {
      const expr = ret.getExpression();
      if (!expr) continue;
      const unwrapped = this._unwrapParens(expr);
      if (
        (unwrapped.isKind(SyntaxKind.ConditionalExpression) ||
          unwrapped.isKind(SyntaxKind.BinaryExpression)) &&
        this._deepContainsJsx(unwrapped)
      ) {
        return unwrapped;
      }
    }
    return null;
  }

  /** Unwrap parenthesized expressions. */
  private _unwrapParens(node: Node): Node {
    if (node.isKind(SyntaxKind.ParenthesizedExpression)) {
      return this._unwrapParens(node.getExpression());
    }
    return node;
  }

  /** Check if a node or any descendant contains JSX. */
  private _deepContainsJsx(node: Node): boolean {
    if (
      node.isKind(SyntaxKind.JsxElement) ||
      node.isKind(SyntaxKind.JsxSelfClosingElement) ||
      node.isKind(SyntaxKind.JsxFragment)
    ) {
      return true;
    }
    return node.getChildren().some((c) => this._deepContainsJsx(c));
  }

  /**
   * Analyze a set of JSX return statements for the guard pattern:
   * one or more if-guarded early returns followed by an unconditional main return.
   *
   * Only handles flat guard patterns (no nested ifs). Each guard return must be
   * a direct child of a top-level if-statement in the function body.
   */
  private _analyzeGuardPattern(
    returnsWithJsx: Node[],
    bodyNode: Node,
    s: MagicString,
  ): { guards: Array<{ condition: string; jsx: Node }>; mainJsx: Node } | null {
    const guards: Array<{ condition: string; jsx: Node }> = [];

    // All returns except the last must be inside if-statements
    for (let i = 0; i < returnsWithJsx.length - 1; i++) {
      const ret = returnsWithJsx[i]!;
      const ifStmt = this._findEnclosingIf(ret, bodyNode);
      if (!ifStmt) return null;

      // Reject nested if-guards: the enclosing if must not itself be inside another if
      const outerIf = this._findEnclosingIf(ifStmt, bodyNode);
      if (outerIf) return null;

      // IfStatement children: IfKeyword, OpenParen, condition, CloseParen, thenStmt, [ElseKeyword, elseStmt]
      const children = ifStmt.getChildren();
      const condition = children[2];
      if (!condition) return null;

      // Determine if the return is in the then-branch or else-branch
      const isElseBranch = this._isInElseBranch(ret, ifStmt);

      const condText = s.slice(condition.getStart(), condition.getEnd());
      // If the return is in the else-branch, negate the condition
      const guardCondition = isElseBranch ? `!(${condText})` : condText;

      const retExpr = (ret as ReturnStatement).getExpression();
      if (!retExpr) return null;
      const jsx = this._findJsx(retExpr);
      if (!jsx) return null;

      guards.push({ condition: guardCondition, jsx });
    }

    // Last return is the main (unconditional) return
    const lastRet = returnsWithJsx[returnsWithJsx.length - 1]!;
    // Verify last return is NOT inside an if at the function body level
    const lastIfStmt = this._findEnclosingIf(lastRet, bodyNode);
    if (lastIfStmt) return null;

    const lastExpr = (lastRet as ReturnStatement).getExpression();
    if (!lastExpr) return null;
    const mainJsx = this._findJsx(lastExpr);
    if (!mainJsx) return null;

    return { guards, mainJsx };
  }

  /** Find the nearest enclosing IfStatement between a node and the body boundary. */
  private _findEnclosingIf(node: Node, bodyNode: Node): Node | null {
    let current = node.getParent();
    while (current && current !== bodyNode) {
      if (current.isKind(SyntaxKind.IfStatement)) return current;
      current = current.getParent();
    }
    return null;
  }

  /** Check if a return statement is in the else-branch of its enclosing if. */
  private _isInElseBranch(returnNode: Node, ifStmt: Node): boolean {
    // Walk up from the return to the if-statement, checking if we pass through an else clause
    let current = returnNode.getParent();
    while (current && current !== ifStmt) {
      // Check if `current` is the else clause of the if-statement
      const parent = current.getParent();
      if (parent === ifStmt) {
        // IfStatement children: IfKeyword(0), OpenParen(1), condition(2), CloseParen(3), thenStmt(4), [ElseKeyword(5), elseStmt(6)]
        const children = ifStmt.getChildren();
        return children.length > 5 && current === children[6];
      }
      current = parent;
    }
    return false;
  }

  /**
   * Generate string expression for a guard pattern: nested ternary with conditional markers.
   * `if (!d) return <Loading/>; return <Main/>` →
   * `'<!--conditional-->' + (!d ? '<div>Loading</div>' : '<div>...</div>') + '<!--/conditional-->'`
   */
  private _guardPatternToString(
    pattern: { guards: Array<{ condition: string; jsx: Node }>; mainJsx: Node },
    variables: VariableInfo[],
    s: MagicString,
    hydrationId: string | null,
  ): string {
    const mainStr = this._jsxToString(pattern.mainJsx, variables, s, hydrationId);

    let result = mainStr;
    for (let i = pattern.guards.length - 1; i >= 0; i--) {
      const guard = pattern.guards[i]!;
      const guardStr = this._jsxToString(guard.jsx, variables, s, null);
      result = `(${guard.condition} ? ${guardStr} : ${result})`;
    }

    return `'<!--conditional-->' + ${result} + '<!--/conditional-->'`;
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

    // Wrap reactive expressions with child markers for hydration parity.
    // End marker (<!--/child-->) provides a precise boundary so hydration
    // cleanup does not consume adjacent static text. See #1812, #1815.
    if (this._isReactiveExpression(expr)) {
      return `'<!--child-->' + __esc(${exprText}) + '<!--/child-->'`;
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

    // If body is a block, extract non-return statements and convert return JSX.
    // Non-return statements (variable declarations, etc.) are preserved verbatim
    // in the generated callback — they're closures that execute per-item.
    if (body.isKind(SyntaxKind.Block)) {
      const stmts = body.getStatements();
      const returnStmt = stmts.find((stmt) => stmt.isKind(SyntaxKind.ReturnStatement));
      if (returnStmt) {
        const retExpr = (returnStmt as ReturnStatement).getExpression();
        if (retExpr) {
          const retJsx = this._findJsx(retExpr);
          if (retJsx) {
            const jsxStr = this._jsxToString(retJsx, variables, s, null);
            // Collect non-return statements as raw source text
            const nonReturnStmts = stmts.filter((stmt) => !stmt.isKind(SyntaxKind.ReturnStatement));
            if (nonReturnStmts.length === 0) {
              // No extra statements — simple arrow like before
              return `'<!--list-->' + ${callerText}.map(${paramName} => ${jsxStr}).join('') + '<!--/list-->'`;
            }
            // Preserve declarations in a block-body arrow
            const stmtTexts = nonReturnStmts
              .map((stmt) => `    ${s.slice(stmt.getStart(), stmt.getEnd())}`)
              .join('\n');
            return (
              `'<!--list-->' + ${callerText}.map((${paramName}) => {\n` +
              `${stmtTexts}\n` +
              `    return ${jsxStr};\n` +
              `  }).join('') + '<!--/list-->'`
            );
          }
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
