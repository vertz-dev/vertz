import { readFile } from 'node:fs/promises';
import type { EncodedSourceMap } from '@ampproject/remapping';
import remapping from '@ampproject/remapping';
import type { BunPlugin } from 'bun';
import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import { compile } from './compiler';
import { HydrationTransformer } from './transformers/hydration-transformer';

/** Options for the Vertz library compilation plugin. */
export interface VertzLibraryPluginOptions {
  /** File filter regex. Defaults to /\.tsx$/. */
  filter?: RegExp;
  /** Compilation target. Defaults to 'dom'. */
  target?: 'dom' | 'tui';
  /** Files matching this pattern skip reactive/JSX transforms (passed through as plain TSX). */
  exclude?: RegExp;
}

/**
 * Creates a Bun plugin for compiling Vertz library packages.
 *
 * Runs hydration transform + compile on .tsx files during bunup build.
 * CSS extraction is intentionally skipped — CSS hashing is path-dependent
 * and must be done by the consuming app's build pipeline.
 */
export function createVertzLibraryPlugin(options?: VertzLibraryPluginOptions): BunPlugin {
  const filter = options?.filter ?? /\.tsx$/;

  return {
    name: 'vertz-library-plugin',
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        const source = await readFile(args.path, 'utf-8');

        // Skip reactive/JSX transforms for excluded files (e.g., composed primitives).
        // Transpile JSX via Bun's native transpiler with @vertz/ui runtime.
        if (options?.exclude?.test(args.path)) {
          const transpiled = new Bun.Transpiler({
            loader: 'tsx',
            autoImportJSX: true,
            tsconfig: JSON.stringify({
              compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@vertz/ui' },
            }),
          }).transformSync(source);
          return { contents: transpiled, loader: 'js' as const };
        }

        // ── 1. Hydration transform ─────────────────────────────
        const hydrationS = new MagicString(source);
        const hydrationProject = new Project({
          useInMemoryFileSystem: true,
          compilerOptions: {
            jsx: ts.JsxEmit.Preserve,
            strict: true,
          },
        });
        const hydrationSourceFile = hydrationProject.createSourceFile(args.path, source);
        const hydrationTransformer = new HydrationTransformer();
        hydrationTransformer.transform(hydrationS, hydrationSourceFile);

        const hydratedCode = hydrationS.toString();
        const hydrationMap = hydrationS.generateMap({
          source: args.path,
          includeContent: true,
        });

        // ── 2. Compile (reactive + JSX transforms) ─────────────
        const compileResult = compile(hydratedCode, {
          filename: args.path,
          target: options?.target,
        });

        // Check for error-severity diagnostics
        const errors = compileResult.diagnostics.filter((d) => d.severity === 'error');
        if (errors.length > 0) {
          const messages = errors.map((d) => `${d.code}: ${d.message} (line ${d.line})`);
          throw new Error(`Vertz compilation errors in ${args.path}:\n${messages.join('\n')}`);
        }

        // Warn on non-error diagnostics
        for (const d of compileResult.diagnostics) {
          if (d.severity === 'warning') {
            console.warn(`[vertz-library-plugin] ${args.path}:${d.line} ${d.code}: ${d.message}`);
          }
        }

        // ── 3. Source map chaining ──────────────────────────────
        const remapped = remapping(
          [compileResult.map as EncodedSourceMap, hydrationMap as EncodedSourceMap],
          () => null,
        );

        // ── 4. Assemble output with inline source map ──────────
        const mapBase64 = Buffer.from(remapped.toString()).toString('base64');
        const sourceMapComment = `\n//# sourceMappingURL=data:application/json;base64,${mapBase64}`;
        const contents = compileResult.code + sourceMapComment;

        return { contents, loader: 'tsx' as const };
      });
    },
  };
}
