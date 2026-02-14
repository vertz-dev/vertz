/**
 * Development version of the server-side JSX runtime.
 * 
 * For SSR, this is identical to jsx-runtime-server.ts.
 * Re-exported for convenience when TypeScript's jsx configuration
 * uses "react-jsx" in development mode.
 */

export { jsx, jsxs, jsxDEV, Fragment } from './jsx-runtime-server';
