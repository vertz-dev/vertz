/**
 * Minimal `process` type for dev-mode guards.
 *
 * The UI package targets browsers, so `@types/node` is not included.
 * Bundlers replace `process.env.NODE_ENV` at build time; the `typeof`
 * guard ensures no runtime error in environments where `process` is
 * truly absent.
 */
declare const process: { env: { NODE_ENV?: string } };
