/**
 * Bun preload plugin that runs the Vertz compiler on .tsx files.
 *
 * This ensures that compiler transforms (let → signal, JSX conditionals,
 * JSX list rendering) are applied during `bun test`, matching the
 * behaviour of the Vite plugin at dev/build time.
 *
 * The Vertz compiler does not transform JSX inside `queryMatch()` callback
 * arguments (only top-level component JSX, .map() callbacks, and
 * conditionals). A second pass through Bun.Transpiler handles any
 * remaining JSX using the @vertz/ui jsx-runtime.
 */
import { compile } from '@vertz/ui-compiler';
import { plugin } from 'bun';

const jsxTranspiler = new Bun.Transpiler({
  loader: 'tsx',
  tsconfig: JSON.stringify({
    compilerOptions: {
      jsx: 'react',
      jsxFactory: '__jsx$',
      jsxFragmentFactory: '__Fragment$',
    },
  }),
});

// Classic JSX: __jsx$(type, props, child1, child2, ...)
// Automatic JSX runtime: jsx(type, { children, ...props })
// This adapter bridges the two calling conventions.
const JSX_ADAPTER = `
import { jsx as __jsx$rt, Fragment as __Fragment$ } from "@vertz/ui/jsx-runtime";
function __jsx$(type, props, ...children) {
  const merged = children.length === 0 ? (props || {})
    : children.length === 1 ? { ...props, children: children[0] }
    : { ...props, children };
  return __jsx$rt(type, merged);
}
`;

plugin({
  name: 'vertz-compiler',
  setup(build) {
    build.onLoad({ filter: /examples\/entity-todo\/src\/.*\.tsx$/ }, async (args) => {
      const source = await Bun.file(args.path).text();
      const result = compile(source, args.path);

      // Second pass: transform any remaining JSX the compiler didn't handle
      // (e.g., JSX inside queryMatch() callbacks)
      let code = jsxTranspiler.transformSync(result.code);

      // Inject the JSX adapter if the second pass produced __jsx$ calls
      if (code.includes('__jsx$(') || code.includes('__Fragment$')) {
        code = JSX_ADAPTER + code;
      }

      return { contents: code, loader: 'ts' };
    });
  },
});
