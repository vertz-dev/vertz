/**
 * Vertz framework-specific lint rules for oxlint.
 *
 * Replaces the 7 GritQL plugins previously in biome-plugins/.
 * The 7th rule (no-ts-ignore) maps to the built-in typescript/ban-ts-comment.
 */

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
        if (
          node.callee &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'effect'
        ) {
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
          (init.expression.type === 'JSXElement' ||
            init.expression.type === 'JSXFragment')
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
  },
};

export default plugin;
