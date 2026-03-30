/**
 * Returns the absolute path to the Vertz runtime binary for the current platform.
 *
 * Resolution: looks up `@vertz/runtime-<platform>-<arch>/package.json` via
 * `require.resolve()`, verifies the binary exists on disk, then returns the path.
 *
 * @throws {Error} If no platform package is installed for the current OS/arch.
 * @throws {Error} If the platform package is installed but the binary is missing.
 */
export declare function getBinaryPath(): string;
