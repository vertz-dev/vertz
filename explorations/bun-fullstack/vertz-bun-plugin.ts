/**
 * Bun plugin that wraps the Vertz compiler pipeline.
 *
 * Replaces the Vite plugin's `transform()` hook with Bun's `onLoad` hook.
 * Chains 4 transforms in the same order as the Vite plugin:
 *
 * 1. Hydration transform — adds `data-v-id` markers to interactive components
 * 2. Compile — reactive + component + JSX transforms
 * 3. Source map chaining — hydration map + compile map → original source
 * 4. CSS extraction — extracts static css() calls (tracked for production build)
 *
 * Usage:
 *   import { vertzBunPlugin, fileExtractions } from './vertz-bun-plugin';
 *   Bun.plugin(vertzBunPlugin());
 *
 * Or as auto-registering preload:
 *   bunfig.toml: preload = ["./vertz-bun-plugin.ts"]
 */

import remapping from '@ampproject/remapping';
import type { BunPlugin } from 'bun';
import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';

// Use relative source imports since explorations/ is outside the workspace
import { compile } from '../../packages/ui-compiler/src/compiler';
import { CSSExtractor } from '../../packages/ui-compiler/src/css-extraction/extractor';
import type { CSSExtractionResult } from '../../packages/ui-compiler/src/css-extraction/extractor';
import { HydrationTransformer } from '../../packages/ui-compiler/src/transformers/hydration-transformer';

export interface VertzBunPluginOptions {
  /** Regex filter for files to transform. Defaults to .tsx files. */
  filter?: RegExp;
  /** Compilation target. 'dom' (default) or 'tui'. */
  target?: 'dom' | 'tui';
}

/** CSS extractions tracked across all transformed files (for production build). */
export const fileExtractions = new Map<string, CSSExtractionResult>();

/**
 * Create a Bun plugin that runs the full Vertz compiler pipeline on .tsx files.
 */
export function vertzBunPlugin(options?: VertzBunPluginOptions): BunPlugin {
  const filter = options?.filter ?? /\.tsx$/;
  const cssExtractor = new CSSExtractor();

  return {
    name: 'vertz-compiler',
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        const source = await Bun.file(args.path).text();

        // 1. Hydration transform — add data-v-id markers to interactive components
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

        // Generate hydration source map (maps hydratedCode -> original code)
        const hydrationMap = hydrationS.generateMap({
          source: args.path,
          includeContent: true,
        });

        // 2. Run the main compile pipeline (reactive + component + JSX transforms)
        const compileResult = compile(hydratedCode, {
          filename: args.path,
          target: options?.target,
        });

        // 3. Chain source maps: compile map (final -> hydrated) + hydration map
        //    (hydrated -> original) = chained map (final -> original)
        const remapped = remapping(
          [
            compileResult.map as import('@ampproject/remapping').EncodedSourceMap,
            hydrationMap as import('@ampproject/remapping').EncodedSourceMap,
          ],
          () => null,
        );

        // 4. CSS extraction (run on original code to find css() calls)
        const extraction = cssExtractor.extract(source, args.path);
        if (extraction.css.length > 0) {
          fileExtractions.set(args.path, extraction);
        }

        // Inline source map as data URL (Bun's onLoad has no `map` field)
        // Use Buffer for base64 encoding since btoa() chokes on non-ASCII chars
        const mapBase64 = Buffer.from(remapped.toString()).toString('base64');
        const sourceMapComment = `\n//# sourceMappingURL=data:application/json;base64,${mapBase64}`;
        const contents = compileResult.code + sourceMapComment;

        return { contents, loader: 'tsx' };
      });
    },
  };
}

// Default export for bunfig.toml [serve.static] plugins
export default vertzBunPlugin();
