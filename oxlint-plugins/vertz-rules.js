/**
 * Vertz framework-specific lint rules for oxlint.
 *
 * Replaces the 7 GritQL plugins previously in biome-plugins/.
 * The 7th rule (no-ts-ignore) maps to the built-in typescript/ban-ts-comment.
 */

import { extname } from 'node:path';

/** no-double-cast: flag `as unknown as T` double type assertions. */
const noDoubleCast = {
  create(context) {
    return {
      TSAsExpression(node) {
        if (
          node.expression &&
          node.expression.type === 'TSAsExpression' &&
          node.expression.typeAnnotation &&
          node.expression.typeAnnotation.type === 'TSUnknownKeyword'
        ) {
          context.report({
            node: node.expression,
            message:
              'Avoid double type assertion (as unknown as T). This bypasses type safety — consider restructuring the types instead.',
          });
        }
      },
    };
  },
};

/** no-internals-import: block imports from @vertz/core/internals. */
const noInternalsImport = {
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source && node.source.value === '@vertz/core/internals') {
          context.report({
            node: node.source,
            message:
              "Do not import from '@vertz/core/internals'. Use the public API from '@vertz/core' instead. Only @vertz/testing may access internals.",
          });
        }
      },
    };
  },
};

/** no-throw-plain-error: prefer VertzException subclasses over plain Error. */
const noThrowPlainError = {
  create(context) {
    return {
      ThrowStatement(node) {
        if (
          node.argument &&
          node.argument.type === 'NewExpression' &&
          node.argument.callee &&
          node.argument.callee.type === 'Identifier' &&
          node.argument.callee.name === 'Error'
        ) {
          context.report({
            node: node.argument,
            message:
              'Prefer throwing a VertzException subclass (e.g. BadRequestException, NotFoundException) instead of plain Error for proper HTTP error responses.',
          });
        }
      },
    };
  },
};

/** no-wrong-effect: block calls to the removed effect() function. */
const noWrongEffect = {
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee && node.callee.type === 'Identifier' && node.callee.name === 'effect') {
          context.report({
            node,
            message:
              'effect() was removed. Use domEffect() for DOM primitives or lifecycleEffect() for lifecycle/data-fetching concerns. Import from @vertz/ui/internals.',
          });
        }
      },
    };
  },
};

/** no-body-jsx: block JSX in variable initializers (breaks hydration). */
const noBodyJsx = {
  create(context) {
    return {
      VariableDeclarator(node) {
        if (!node.init) return;

        const init = node.init;

        // Direct JSX: const x = <div /> or const x = <div>...</div>
        if (init.type === 'JSXElement' || init.type === 'JSXFragment') {
          context.report({
            node,
            message:
              'JSX outside the return tree breaks hydration. Use document.createElement() for imperative containers, or move the JSX into the return expression.',
          });
          return;
        }

        // Cast JSX: const x = (<div />) as HTMLElement
        if (
          init.type === 'TSAsExpression' &&
          init.expression &&
          (init.expression.type === 'JSXElement' || init.expression.type === 'JSXFragment')
        ) {
          context.report({
            node,
            message:
              'JSX outside the return tree breaks hydration. Use document.createElement() for imperative containers, or move the JSX into the return expression.',
          });
        }
      },
    };
  },
};

/** no-try-catch-result: block try/catch around error-as-value APIs (.open()). */
const noTryCatchResult = {
  create(context) {
    return {
      TryStatement(node) {
        // Check if the try block source contains a .open() call
        const source = context.sourceCode.getText(node.block);
        if (source.includes('.open(')) {
          context.report({
            node,
            message:
              'Do not wrap error-as-value APIs in try/catch. APIs like stack.open() return Result types — use `if (result.ok)` instead of try/catch.',
          });
        }
      },
    };
  },
};

/**
 * no-narrowing-let: flag union-typed `let` declarations in top-level components
 * (.tsx only) where TypeScript's control-flow analysis narrows the variable to
 * its initializer literal, breaking comparisons on later reassignments.
 *
 * See: plans/2779-let-signal-narrowing.md
 */

const BARE_CAST_SAFE_NODE_TYPES = new Set([
  'Literal',
  'TemplateLiteral',
  'TaggedTemplateExpression',
  'Identifier',
  'ThisExpression',
  'MemberExpression',
  'ChainExpression',
  'CallExpression',
  'NewExpression',
  'ObjectExpression',
  'ArrayExpression',
  'RegExpLiteral',
  'ArrowFunctionExpression',
  'FunctionExpression',
  'TSAsExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
]);

function walkToEnclosingFunction(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression' ||
      current.type === 'ArrowFunctionExpression'
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function isTopLevelComponent(fnNode) {
  const parent = fnNode.parent;
  if (!parent) return false;
  if (parent.type === 'Program') return true;
  if (parent.type === 'ExportNamedDeclaration') return true;
  if (parent.type === 'ExportDefaultDeclaration') return true;
  // Arrow function inside `export const X = () => {...}` or `const X = () => {...}` at module scope
  if (parent.type === 'VariableDeclarator') {
    const decl = parent.parent;
    if (!decl || decl.type !== 'VariableDeclaration') return false;
    const declParent = decl.parent;
    if (!declParent) return false;
    return (
      declParent.type === 'Program' ||
      declParent.type === 'ExportNamedDeclaration' ||
      declParent.type === 'ExportDefaultDeclaration'
    );
  }
  return false;
}

function stripAsConst(initNode, initText) {
  if (
    initNode.type === 'TSAsExpression' &&
    initNode.typeAnnotation &&
    initNode.typeAnnotation.type === 'TSTypeReference' &&
    initNode.typeAnnotation.typeName &&
    initNode.typeAnnotation.typeName.type === 'Identifier' &&
    initNode.typeAnnotation.typeName.name === 'const'
  ) {
    return { node: initNode.expression, text: null };
  }
  return { node: initNode, text: initText };
}

/** Walk up to the enclosing Program node. */
function findProgram(node) {
  let current = node;
  while (current && current.type !== 'Program') current = current.parent;
  return current;
}

/**
 * Return true if the annotation is (a) a `TSUnionType`, or (b) a
 * `TSTypeReference` whose name resolves in the same file to a
 * `TSTypeAliasDeclaration` with a union body.
 */
function isUnionOrUnionAlias(innerType, program) {
  if (!innerType) return false;
  if (innerType.type === 'TSUnionType') return true;
  if (
    innerType.type !== 'TSTypeReference' ||
    !innerType.typeName ||
    innerType.typeName.type !== 'Identifier' ||
    !program ||
    !Array.isArray(program.body)
  ) {
    return false;
  }
  const name = innerType.typeName.name;
  for (const stmt of program.body) {
    const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    if (
      decl &&
      decl.type === 'TSTypeAliasDeclaration' &&
      decl.id &&
      decl.id.name === name &&
      decl.typeAnnotation &&
      decl.typeAnnotation.type === 'TSUnionType'
    ) {
      return true;
    }
  }
  return false;
}

/**
 * True if the initializer is `null` or `undefined` literal AND the declared
 * union includes the corresponding null/undefined keyword. TS does not narrow
 * in those cases, so the rule would be a false positive.
 */
function isNullishInitOfNullableUnion(initNode, unionMembers) {
  if (!initNode || !Array.isArray(unionMembers)) return false;
  const types = new Set(unionMembers.map((m) => (m && m.type) || ''));
  const isNullLiteral =
    initNode.type === 'Literal' && initNode.value === null && initNode.raw === 'null';
  if (isNullLiteral && types.has('TSNullKeyword')) return true;
  const isUndefinedIdent = initNode.type === 'Identifier' && initNode.name === 'undefined';
  if (isUndefinedIdent && types.has('TSUndefinedKeyword')) return true;
  return false;
}

const NO_NARROWING_LET_MESSAGE =
  'Union-typed `let` in a top-level component narrows to its initializer type. ' +
  'Rewrite as `let x: T = v as T` to prevent TS2367 on later comparisons.\n' +
  '  - let panel: \'code\' | \'spec\' = \'code\';\n' +
  '  + let panel: \'code\' | \'spec\' = \'code\' as \'code\' | \'spec\';\n' +
  'See https://vertz.dev/guides/ui/reactivity#union-typed-state';

const noNarrowingLet = {
  meta: { fixable: 'code' },
  create(context) {
    if (extname(context.filename).toLowerCase() !== '.tsx') return {};

    return {
      VariableDeclarator(node) {
        const decl = node.parent;
        if (!decl || decl.type !== 'VariableDeclaration' || decl.kind !== 'let') return;
        if (!node.init) return;
        if (!node.id || node.id.type !== 'Identifier') return;

        // oxlint's .d.ts types `typeAnnotation` as null on BindingIdentifier,
        // but it's populated at runtime. The file is .js and not typechecked,
        // so no directive is needed. See design doc Rev 2, Unknowns #2.
        const typeAnnotationNode = node.id.typeAnnotation;
        if (!typeAnnotationNode || typeAnnotationNode.type !== 'TSTypeAnnotation') return;
        const innerType = typeAnnotationNode.typeAnnotation;
        if (!innerType) return;

        const program = findProgram(node);
        if (!isUnionOrUnionAlias(innerType, program)) return;

        // Resolve the effective union members (either inline or alias body).
        let unionMembers = null;
        if (innerType.type === 'TSUnionType') {
          unionMembers = innerType.types;
        } else if (innerType.type === 'TSTypeReference' && program && program.body) {
          const aliasName =
            innerType.typeName && innerType.typeName.type === 'Identifier'
              ? innerType.typeName.name
              : null;
          for (const stmt of program.body) {
            const d = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
            if (
              d &&
              d.type === 'TSTypeAliasDeclaration' &&
              d.id &&
              d.id.name === aliasName &&
              d.typeAnnotation &&
              d.typeAnnotation.type === 'TSUnionType'
            ) {
              unionMembers = d.typeAnnotation.types;
              break;
            }
          }
        }

        // False positive: `let x: string | null = null` / `= undefined` —
        // TS doesn't narrow when the initializer is in the union.
        if (isNullishInitOfNullableUnion(node.init, unionMembers)) return;

        const source = context.sourceCode;
        const annotText = source.getText(innerType);

        // Narrow self-fire guard: only skip if the existing `as` annotation
        // textually matches the declared type (our own autofix output, or the
        // user having already applied the idiom). A narrower cast like
        // `as 'a' | 'b'` when declared as `'a' | 'b' | 'c'` still narrows and
        // must be flagged.
        if (node.init.type === 'TSAsExpression' && node.init.typeAnnotation) {
          const castText = source.getText(node.init.typeAnnotation);
          if (castText === annotText) return;
        }

        const enclosingFn = walkToEnclosingFunction(node);
        if (!enclosingFn) return;
        if (!isTopLevelComponent(enclosingFn)) return;

        const idText = node.id.name;

        const initText = source.getText(node.init);
        const stripped = stripAsConst(node.init, initText);
        const effectiveInitNode = stripped.node;
        const effectiveInitText =
          stripped.text === null ? source.getText(stripped.node) : stripped.text;

        const needsParens = !BARE_CAST_SAFE_NODE_TYPES.has(effectiveInitNode.type);
        const initForCast = needsParens ? `(${effectiveInitText})` : effectiveInitText;

        const replacement = `${idText}: ${annotText} = ${initForCast} as ${annotText}`;

        context.report({
          node,
          message: NO_NARROWING_LET_MESSAGE,
          fix(fixer) {
            return fixer.replaceText(node, replacement);
          },
        });
      },
    };
  },
};

const plugin = {
  meta: {
    name: 'vertz-rules',
  },
  rules: {
    'no-double-cast': noDoubleCast,
    'no-internals-import': noInternalsImport,
    'no-throw-plain-error': noThrowPlainError,
    'no-wrong-effect': noWrongEffect,
    'no-body-jsx': noBodyJsx,
    'no-try-catch-result': noTryCatchResult,
    'no-narrowing-let': noNarrowingLet,
  },
};

export default plugin;
