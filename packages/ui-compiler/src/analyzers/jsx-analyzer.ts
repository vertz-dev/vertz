import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { CallbackConstInline, ComponentInfo, JsxExpressionInfo, VariableInfo } from '../types';
import { findBodyNode } from '../utils';

/**
 * Map each JSX expression/attribute to its dependencies.
 * Classify as reactive or static based on whether any dependency is a signal,
 * computed, or a signal API property access (e.g., query().data, form().submitting).
 */
export class JsxAnalyzer {
  analyze(
    sourceFile: SourceFile,
    component: ComponentInfo,
    variables: VariableInfo[],
  ): JsxExpressionInfo[] {
    const reactiveNames = new Set(
      variables.filter((v) => v.kind === 'signal' || v.kind === 'computed').map((v) => v.name),
    );

    // Build maps of signal API variables and reactive source variables
    const signalApiVars = new Map<string, Set<string>>();
    const plainPropVars = new Map<string, Set<string>>();
    const fieldSignalPropVars = new Map<string, Set<string>>();
    const reactiveSourceVars = new Set<string>();
    // Destructured props are getter-backed (__props.xxx) — they must be
    // classified as reactive sources so JSX expressions referencing them
    // get effect wrapping for signal tracking.
    if (component.destructuredProps) {
      for (const binding of component.destructuredProps.bindings) {
        if (!binding.isRest) {
          reactiveSourceVars.add(binding.bindingName);
        }
      }
    }
    for (const v of variables) {
      if (v.signalProperties && v.signalProperties.size > 0) {
        signalApiVars.set(v.name, v.signalProperties);
      }
      if (v.plainProperties && v.plainProperties.size > 0) {
        plainPropVars.set(v.name, v.plainProperties);
      }
      if (v.fieldSignalProperties && v.fieldSignalProperties.size > 0) {
        fieldSignalPropVars.set(v.name, v.fieldSignalProperties);
      }
      if (v.isReactiveSource) {
        reactiveSourceVars.add(v.name);
      }
    }

    const bodyNode = findBodyNode(sourceFile, component);
    if (!bodyNode) return [];

    // Pre-pass: detect callback-local consts derived from reactive names.
    const callbackScopes = collectCallbackScopes(
      bodyNode,
      reactiveNames,
      signalApiVars,
      plainPropVars,
      fieldSignalPropVars,
      reactiveSourceVars,
    );

    const results: JsxExpressionInfo[] = [];

    // Find all JSX expressions
    const jsxExprs = bodyNode.getDescendantsOfKind(SyntaxKind.JsxExpression);
    for (const expr of jsxExprs) {
      const identifiers = collectIdentifiers(expr);
      const deps = identifiers.filter((id) => reactiveNames.has(id));
      const uniqueDeps = [...new Set(deps)];
      const hasSignalApiAccess = containsSignalApiPropertyAccess(
        expr,
        signalApiVars,
        plainPropVars,
        fieldSignalPropVars,
      );
      const hasReactiveSourceAccess = containsReactiveSourceAccess(expr, reactiveSourceVars);

      // Check callback-local reactive consts
      const callbackConstInlines = findCallbackConstInlines(expr, identifiers, callbackScopes);
      const hasCallbackReactive = callbackConstInlines.length > 0;

      const reactive =
        uniqueDeps.length > 0 ||
        hasSignalApiAccess ||
        hasReactiveSourceAccess ||
        hasCallbackReactive;

      const info: JsxExpressionInfo = {
        start: expr.getStart(),
        end: expr.getEnd(),
        reactive,
        deps: uniqueDeps,
      };
      if (callbackConstInlines.length > 0) {
        info.callbackConstInlines = callbackConstInlines;
      }
      results.push(info);
    }

    return results;
  }
}

/**
 * Check if a node contains a PropertyAccessExpression that accesses
 * a signal property on a signal API variable.
 *
 * Handles two patterns:
 * - 2-level: `tasks.loading` (root.signalProp)
 * - N-level (>= 3): `taskForm.title.error`, `taskForm.address.street.error`,
 *   `taskForm[field].error` (root + intermediates + fieldSignalProp leaf)
 */
function containsSignalApiPropertyAccess(
  node: Node,
  signalApiVars: Map<string, Set<string>>,
  plainPropVars: Map<string, Set<string>>,
  fieldSignalPropVars: Map<string, Set<string>>,
): boolean {
  if (signalApiVars.size === 0 && fieldSignalPropVars.size === 0) return false;

  const propAccesses = node.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
  for (const pa of propAccesses) {
    const obj = pa.getExpression();
    const propName = pa.getName();

    // 2-level: root.signalProp
    if (obj.isKind(SyntaxKind.Identifier)) {
      const varName = obj.getText();
      const signalProps = signalApiVars.get(varName);
      if (signalProps?.has(propName)) {
        return true;
      }
    }

    // N-level (>= 3): Walk up the chain to find the root identifier
    // Quick check: leaf must be a potential fieldSignalProperty
    let anyHasLeaf = false;
    for (const props of fieldSignalPropVars.values()) {
      if (props.has(propName)) {
        anyHasLeaf = true;
        break;
      }
    }
    if (!anyHasLeaf) continue;

    let current: Node = obj;
    const intermediateNames: string[] = [];
    let chainLength = 2; // root + leaf

    while (true) {
      if (current.isKind(SyntaxKind.PropertyAccessExpression)) {
        const innerPa = current.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
        intermediateNames.unshift(innerPa.getName());
        current = innerPa.getExpression();
        chainLength++;
      } else if (current.isKind(SyntaxKind.ElementAccessExpression)) {
        const ea = current.asKindOrThrow(SyntaxKind.ElementAccessExpression);
        current = ea.getExpression();
        chainLength++;
      } else {
        break;
      }
    }

    if (!current.isKind(SyntaxKind.Identifier)) continue;
    const rootName = current.getText();

    const fieldSignalProps = fieldSignalPropVars.get(rootName);
    if (!fieldSignalProps) continue;
    if (chainLength < 3) continue;
    if (!fieldSignalProps.has(propName)) continue;

    // No intermediate can be a signalProperty or plainProperty
    const signalProps = signalApiVars.get(rootName);
    const plainProps = plainPropVars.get(rootName);
    let intermediateBlocked = false;
    for (const name of intermediateNames) {
      if (signalProps?.has(name) || plainProps?.has(name)) {
        intermediateBlocked = true;
        break;
      }
    }
    if (intermediateBlocked) continue;

    return true;
  }
  return false;
}

/**
 * Check if a node contains a property access or bare reference to a reactive source variable.
 * Any property access on a reactive source (e.g., ctx.theme) is reactive.
 * A bare reactive source identifier (e.g., {ctx}) is also reactive.
 */
function containsReactiveSourceAccess(node: Node, reactiveSourceVars: Set<string>): boolean {
  if (reactiveSourceVars.size === 0) return false;

  // Check for property access: ctx.theme
  const propAccesses = node.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
  for (const pa of propAccesses) {
    const obj = pa.getExpression();
    if (obj.isKind(SyntaxKind.Identifier) && reactiveSourceVars.has(obj.getText())) {
      return true;
    }
  }

  // Check for bare identifier: {ctx}
  const identifiers = node.getDescendantsOfKind(SyntaxKind.Identifier);
  for (const id of identifiers) {
    if (reactiveSourceVars.has(id.getText())) {
      return true;
    }
  }

  return false;
}

function collectIdentifiers(node: Node): string[] {
  const ids: string[] = [];
  const walk = (n: Node): void => {
    if (n.isKind(SyntaxKind.Identifier)) {
      ids.push(n.getText());
    }
    for (const c of n.getChildren()) {
      walk(c);
    }
  };
  walk(node);
  return ids;
}

// ─── Callback Scope Detection ──────────────────────────────────────

/** A callback scope with its reactive const names and their initializer positions. */
interface CallbackScope {
  start: number;
  end: number;
  reactiveConsts: Map<string, { initStart: number; initEnd: number }>;
}

/**
 * Detect callback-local consts that derive from reactive names.
 * For each ArrowFunction in the component body, collect const declarations,
 * check if their initializers reference reactive names (signals, computeds,
 * signal API properties, or reactive sources), and build per-scope maps.
 */
function collectCallbackScopes(
  bodyNode: Node,
  reactiveNames: Set<string>,
  signalApiVars: Map<string, Set<string>>,
  plainPropVars: Map<string, Set<string>>,
  fieldSignalPropVars: Map<string, Set<string>>,
  reactiveSourceVars: Set<string>,
): CallbackScope[] {
  const scopes: CallbackScope[] = [];

  const arrowFns = bodyNode.getDescendantsOfKind(SyntaxKind.ArrowFunction);
  for (const fn of arrowFns) {
    // Collect parameter names — these shadow outer reactive names
    const paramNames = new Set<string>();
    for (const param of fn.getParameters()) {
      const nameNode = param.getNameNode();
      if (nameNode.isKind(SyntaxKind.Identifier)) {
        paramNames.add(nameNode.getText());
      }
    }

    // Build effective reactive names (outer minus shadowed)
    const effectiveReactive = new Set<string>();
    for (const name of reactiveNames) {
      if (!paramNames.has(name)) effectiveReactive.add(name);
    }
    // Merge reactive consts from enclosing callback scopes
    for (const parentScope of scopes) {
      if (parentScope.start <= fn.getStart() && fn.getEnd() <= parentScope.end) {
        for (const name of parentScope.reactiveConsts.keys()) {
          if (!paramNames.has(name)) effectiveReactive.add(name);
        }
      }
    }

    // Build effective signal API / reactive source maps (minus shadowed)
    const effectiveSignalApiVars = new Map<string, Set<string>>();
    for (const [name, props] of signalApiVars) {
      if (!paramNames.has(name)) effectiveSignalApiVars.set(name, props);
    }
    const effectiveReactiveSourceVars = new Set<string>();
    for (const name of reactiveSourceVars) {
      if (!paramNames.has(name)) effectiveReactiveSourceVars.add(name);
    }

    // Get the callback body
    const body = fn.getBody();
    if (!body) continue;

    // Collect const declarations inside this callback
    const localConsts = collectLocalConsts(body);
    if (localConsts.size === 0) continue;

    // Fixed-point: determine which consts are reactive
    const reactiveConsts = new Map<string, { initStart: number; initEnd: number }>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const [name, info] of localConsts) {
        if (reactiveConsts.has(name)) continue;

        const isReactive =
          info.deps.some((dep) => effectiveReactive.has(dep) || reactiveConsts.has(dep)) ||
          nodeContainsSignalApiPropertyAccess(
            info.initNode,
            effectiveSignalApiVars,
            plainPropVars,
            fieldSignalPropVars,
          ) ||
          nodeContainsReactiveSourceAccess(info.initNode, effectiveReactiveSourceVars);

        if (isReactive) {
          reactiveConsts.set(name, { initStart: info.initStart, initEnd: info.initEnd });
          changed = true;
        }
      }
    }

    if (reactiveConsts.size > 0) {
      scopes.push({
        start: fn.getStart(),
        end: fn.getEnd(),
        reactiveConsts,
      });
    }
  }

  return scopes;
}

/** Info about a const declaration inside a callback body. */
interface LocalConstInfo {
  deps: string[];
  initNode: Node;
  initStart: number;
  initEnd: number;
}

/**
 * Collect const declarations from a callback body's immediate block scope.
 * Does NOT descend into nested arrow functions or function expressions to
 * avoid collecting consts that belong to inner closures.
 *
 * Note: only `const` is tracked. `let` variables can be reassigned,
 * making inlining unsafe (the inlined initializer would not reflect
 * later assignments).
 */
function collectLocalConsts(body: Node): Map<string, LocalConstInfo> {
  const result = new Map<string, LocalConstInfo>();
  if (!body.isKind(SyntaxKind.Block)) return result;

  // Walk only direct statements of the block — getStatements() does not
  // recurse into nested function bodies.
  for (const stmt of body.getStatements()) {
    if (!stmt.isKind(SyntaxKind.VariableStatement)) continue;
    const declList = stmt.getChildrenOfKind(SyntaxKind.VariableDeclarationList)[0];
    if (!declList) continue;
    if (!declList.getText().startsWith('const ')) continue;

    for (const decl of declList.getDeclarations()) {
      const nameNode = decl.getNameNode();
      if (!nameNode.isKind(SyntaxKind.Identifier)) continue;
      const name = nameNode.getText();
      const init = decl.getInitializer();
      if (!init) continue;

      // Skip function definitions — they are stable references
      if (init.isKind(SyntaxKind.ArrowFunction) || init.isKind(SyntaxKind.FunctionExpression)) {
        continue;
      }

      const deps = collectIdentifiers(init);
      result.set(name, {
        deps,
        initNode: init,
        initStart: init.getStart(),
        initEnd: init.getEnd(),
      });
    }
  }

  return result;
}

/**
 * Like containsSignalApiPropertyAccess but also checks the node itself
 * (getDescendantsOfKind excludes the node). Needed for initializer nodes
 * that ARE the property access (e.g., `const loading = tasks.loading`).
 */
function nodeContainsSignalApiPropertyAccess(
  node: Node,
  signalApiVars: Map<string, Set<string>>,
  plainPropVars: Map<string, Set<string>>,
  fieldSignalPropVars: Map<string, Set<string>>,
): boolean {
  if (containsSignalApiPropertyAccess(node, signalApiVars, plainPropVars, fieldSignalPropVars)) {
    return true;
  }
  // Check the node itself if it's a PropertyAccessExpression
  if (node.isKind(SyntaxKind.PropertyAccessExpression)) {
    const obj = node.getExpression();
    const propName = node.getName();
    if (obj.isKind(SyntaxKind.Identifier)) {
      const signalProps = signalApiVars.get(obj.getText());
      if (signalProps?.has(propName)) return true;
    }
  }
  return false;
}

/**
 * Like containsReactiveSourceAccess but also checks the node itself.
 */
function nodeContainsReactiveSourceAccess(node: Node, reactiveSourceVars: Set<string>): boolean {
  if (containsReactiveSourceAccess(node, reactiveSourceVars)) return true;
  // Check the node itself
  if (node.isKind(SyntaxKind.PropertyAccessExpression)) {
    const obj = node.getExpression();
    if (obj.isKind(SyntaxKind.Identifier) && reactiveSourceVars.has(obj.getText())) return true;
  }
  if (node.isKind(SyntaxKind.Identifier) && reactiveSourceVars.has(node.getText())) return true;
  return false;
}

/**
 * For a JSX expression, find callback-local reactive consts to inline.
 * Returns the list of CallbackConstInline entries for consts referenced
 * by the expression from enclosing callback scopes.
 */
function findCallbackConstInlines(
  expr: Node,
  identifiers: string[],
  callbackScopes: CallbackScope[],
): CallbackConstInline[] {
  const inlines: CallbackConstInline[] = [];
  const exprStart = expr.getStart();
  const exprEnd = expr.getEnd();
  const uniqueIds = new Set(identifiers);

  // Include all reactive consts from enclosing scopes that are directly
  // referenced OR transitively needed (for chains like a→b→signal).
  // We include all reactive consts — inlineCallbackConsts only substitutes
  // names that actually appear in the text, and runs in a fixed-point loop
  // to handle transitive chains.
  let hasDirectMatch = false;
  for (const scope of callbackScopes) {
    if (scope.start > exprStart || exprEnd > scope.end) continue;
    for (const name of scope.reactiveConsts.keys()) {
      if (uniqueIds.has(name)) {
        hasDirectMatch = true;
        break;
      }
    }
    if (hasDirectMatch) {
      // Include ALL reactive consts from this scope for transitive inlining
      for (const [name, pos] of scope.reactiveConsts) {
        inlines.push({ name, initStart: pos.initStart, initEnd: pos.initEnd });
      }
    }
  }

  return inlines;
}
