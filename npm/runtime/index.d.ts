/**
 * Returns the absolute path to the Vertz runtime binary for the current platform.
 *
 * Resolution: looks up `@vertz/runtime-<platform>-<arch>/package.json` via
 * `require.resolve()`, then returns `<pkgDir>/vertz-runtime`.
 *
 * @throws {Error} If no platform package is installed for the current OS/arch.
 */
export declare function getBinaryPath(): string;
