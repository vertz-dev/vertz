import type { CompileOutput } from './types';
/**
 * Main compile pipeline.
 *
 * 1. Parse → 2. Component analysis → 3. Reactivity analysis →
 * 4. Mutation analysis + transform → 5. Signal transform →
 * 6. Computed transform → 7. JSX analysis →
 * 8. JSX transform (includes prop transform) →
 * 9. Diagnostics → 10. Add imports → 11. Return { code, map, diagnostics }
 */
export declare function compile(source: string, filename?: string): CompileOutput;
//# sourceMappingURL=compiler.d.ts.map
