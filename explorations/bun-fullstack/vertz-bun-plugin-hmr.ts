/**
 * Bun plugin with CSS sidecar files for HMR support.
 *
 * Instead of virtual CSS modules (Vite approach), this plugin:
 * 1. Writes extracted CSS to real .css files on disk (.vertz/css/)
 * 2. Injects `import '.vertz/css/<hash>.css'` into the compiled JS output
 * 3. Injects `import.meta.hot.accept()` so components self-accept HMR updates
 *
 * Bun's built-in CSS HMR handles <link> tag swapping for the sidecar files,
 * giving us CSS-only hot updates without full page refresh.
 *
 * Usage:
 *   import { vertzBunPluginHMR } from './vertz-bun-plugin-hmr';
 *   // In bunfig.toml [serve.static] plugins or Bun.build({ plugins: [...] })
 */

import remapping from '@ampproject/remapping';
import type { BunPlugin } from 'bun';
import MagicString from 'magic-string';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { Project, ts } from 'ts-morph';

// Use relative source imports since explorations/ is outside the workspace
import { compile } from '../../packages/ui-compiler/src/compiler';
import { CSSExtractor } from '../../packages/ui-compiler/src/css-extraction/extractor';
import type { CSSExtractionResult } from '../../packages/ui-compiler/src/css-extraction/extractor';
import { HydrationTransformer } from '../../packages/ui-compiler/src/transformers/hydration-transformer';

export interface VertzBunPluginHMROptions {
  /** Regex filter for files to transform. Defaults to .tsx files. */
  filter?: RegExp;
  /** Compilation target. 'dom' (default) or 'tui'. */
  target?: 'dom' | 'tui';
  /**
   * Directory for CSS sidecar files.
   * Defaults to `.vertz/css` relative to the project root.
   */
  cssOutDir?: string;
  /** Enable HMR support (import.meta.hot.accept). Defaults to true. */
  hmr?: boolean;
  /** Project root for computing relative paths. */
  projectRoot?: string;
}

/** CSS extractions tracked across all transformed files (for production build). */
export const fileExtractions = new Map<string, CSSExtractionResult>();

/** Map of source file → CSS sidecar file path (for debugging). */
export const cssSidecarMap = new Map<string, string>();

/**
 * Generate a stable hash from a file path for CSS sidecar naming.
 * Uses djb2 to match the CSS extractor's class name hashing.
 */
function filePathHash(filePath: string): string {
  let hash = 5381;
  for (let i = 0; i < filePath.length; i++) {
    hash = ((hash << 5) + hash + filePath.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Create a Bun plugin with CSS sidecar file support for HMR.
 */
export function vertzBunPluginHMR(options?: VertzBunPluginHMROptions): BunPlugin {
  const filter = options?.filter ?? /\.tsx$/;
  const hmr = options?.hmr ?? true;
  const projectRoot = options?.projectRoot ?? resolve(import.meta.dir, '..', '..');
  const cssOutDir = options?.cssOutDir ?? resolve(projectRoot, '.vertz', 'css');
  const cssExtractor = new CSSExtractor();

  // Ensure CSS output directory exists
  mkdirSync(cssOutDir, { recursive: true });

  return {
    name: 'vertz-compiler-hmr',
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        const source = await Bun.file(args.path).text();

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

        // ── 3. Source map chaining ──────────────────────────────
        const remapped = remapping(
          [
            compileResult.map as import('@ampproject/remapping').EncodedSourceMap,
            hydrationMap as import('@ampproject/remapping').EncodedSourceMap,
          ],
          () => null,
        );

        // ── 4. CSS extraction → sidecar file ───────────────────
        const extraction = cssExtractor.extract(source, args.path);
        let cssImportLine = '';

        if (extraction.css.length > 0) {
          fileExtractions.set(args.path, extraction);

          // Write CSS to a sidecar file on disk
          const hash = filePathHash(args.path);
          const cssFileName = `${hash}.css`;
          const cssFilePath = resolve(cssOutDir, cssFileName);

          writeFileSync(cssFilePath, extraction.css);
          cssSidecarMap.set(args.path, cssFilePath);

          // Compute relative import path from the source file to the CSS file
          const relPath = relative(dirname(args.path), cssFilePath);
          const importPath = relPath.startsWith('.') ? relPath : `./${relPath}`;
          cssImportLine = `import '${importPath}';\n`;
        }

        // ── 5. Assemble output ─────────────────────────────────
        const mapBase64 = Buffer.from(remapped.toString()).toString('base64');
        const sourceMapComment = `\n//# sourceMappingURL=data:application/json;base64,${mapBase64}`;

        // Prepend CSS import, append HMR accept
        let contents = '';
        if (cssImportLine) {
          contents += cssImportLine;
        }
        contents += compileResult.code;
        if (hmr) {
          // Bun statically analyzes import.meta.hot.accept() calls.
          // It MUST be called directly (no optional chaining, no variable indirection).
          // Each module that self-accepts will be individually re-evaluated on change.
          contents += '\nimport.meta.hot.accept();\n';
        }
        contents += sourceMapComment;

        return { contents, loader: 'tsx' };
      });
    },
  };
}

export default vertzBunPluginHMR();
