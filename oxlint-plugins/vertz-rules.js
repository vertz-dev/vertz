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
  'Identifier',
  'ThisExpression',
  'MemberExpression',
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
      current.type === 'ArrowFunctionExpression' ||
      current.type === 'MethodDefinition'
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

        // @ts-expect-error - oxlint .d.ts types `typeAnnotation` as null on
        // BindingIdentifier, but it's populated at runtime. See design doc
        // Rev 2, Unknowns #2.
        const typeAnnotationNode = node.id.typeAnnotation;
        if (!typeAnnotationNode || typeAnnotationNode.type !== 'TSTypeAnnotation') return;
        const innerType = typeAnnotationNode.typeAnnotation;
        if (!innerType || innerType.type !== 'TSUnionType') return;

        // Skip if initializer is already cast to a union — the user (or our
        // own autofix) already widened the type away from the literal.
        if (
          node.init.type === 'TSAsExpression' &&
          node.init.typeAnnotation &&
          node.init.typeAnnotation.type === 'TSUnionType'
        ) {
          return;
        }

        const enclosingFn = walkToEnclosingFunction(node);
        if (!enclosingFn) return;
        if (!isTopLevelComponent(enclosingFn)) return;

        const source = context.sourceCode;
        const idText = node.id.name;
        const annotText = source.getText(innerType);

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
          message:
            'Union-typed `let` in a top-level component narrows to its initializer type. Use `let x: T = v as T` to prevent TS2367 on later comparisons.',
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
