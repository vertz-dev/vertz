import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import type { Plugin, ResolvedConfig } from 'vite';
import { compile } from './compiler';
import { CSSCodeSplitter } from './css-extraction/code-splitting';
import { DeadCSSEliminator } from './css-extraction/dead-css';
import type { CSSExtractionResult } from './css-extraction/extractor';
import { CSSExtractor } from './css-extraction/extractor';
import { CSSHMRHandler } from './css-extraction/hmr';
import { RouteCSSManifest } from './css-extraction/route-css-manifest';
import { HydrationTransformer } from './transformers/hydration-transformer';

/** Virtual module prefix for extracted CSS. */
const VIRTUAL_CSS_PREFIX = '\0vertz-css:';

/** Default file extensions for component files. */
const DEFAULT_INCLUDE = ['**/*.tsx', '**/*.jsx'];

/** Options for the Vertz Vite plugin. */
export interface VertzPluginOptions {
  /** Glob patterns for component files. Defaults to tsx and jsx. */
  include?: string[];
  /** Glob patterns to exclude. */
  exclude?: string[];
  /** Enable CSS extraction in production. Defaults to true. */
  cssExtraction?: boolean;
  /** Route-to-file mapping for CSS code splitting (production only). */
  routeMap?: Map<string, string[]>;
}

/**
 * Vite plugin that transforms tsx/jsx files using the vertz/ui compiler.
 *
 * Chains all compiler passes: reactive transforms, component transforms,
 * hydration markers, and CSS extraction. In dev mode, provides HMR for
 * both component code and CSS changes. In production, extracts CSS to
 * virtual modules and performs dead CSS elimination and route-level
 * code splitting.
 */
export default function vertzPlugin(options?: VertzPluginOptions): Plugin {
  const include = options?.include ?? DEFAULT_INCLUDE;
  const exclude = options?.exclude ?? [];
  const enableCssExtraction = options?.cssExtraction ?? true;

  let resolvedConfig: ResolvedConfig;
  let isProduction = false;

  // CSS tracking for HMR and extraction
  const cssHmrHandler = new CSSHMRHandler();
  const cssExtractor = new CSSExtractor();
  const fileExtractions = new Map<string, CSSExtractionResult>();

  /** Check if a file ID matches our include/exclude patterns. */
  function shouldTransform(id: string): boolean {
    // Strip query strings (e.g., ?v=123)
    const cleanId = id.split('?')[0] ?? id;

    // Check exclude patterns first
    for (const pattern of exclude) {
      if (matchGlob(cleanId, pattern)) return false;
    }

    // Check include patterns
    for (const pattern of include) {
      if (matchGlob(cleanId, pattern)) return true;
    }

    return false;
  }

  return {
    name: 'vertz',

    configResolved(cfg) {
      resolvedConfig = cfg;
      isProduction = resolvedConfig.command === 'build' || resolvedConfig.mode === 'production';
    },

    resolveId(id) {
      if (id.startsWith(VIRTUAL_CSS_PREFIX)) {
        return id;
      }
      return undefined;
    },

    load(id) {
      if (id.startsWith(VIRTUAL_CSS_PREFIX)) {
        const sourceFile = id.slice(VIRTUAL_CSS_PREFIX.length);
        const extraction = fileExtractions.get(sourceFile);
        if (extraction) {
          return extraction.css;
        }
        return '';
      }
      return undefined;
    },

    transform(code: string, id: string) {
      if (!shouldTransform(id)) {
        return undefined;
      }

      const cleanId = id.split('?')[0] ?? id;

      // 1. Run hydration transformer on the original source (BEFORE compile,
      //    because compile transforms JSX to DOM helpers and JSX nodes are gone)
      const hydrationS = new MagicString(code);
      const hydrationProject = new Project({
        useInMemoryFileSystem: true,
        compilerOptions: {
          jsx: ts.JsxEmit.Preserve,
          strict: true,
        },
      });
      const hydrationSourceFile = hydrationProject.createSourceFile(cleanId, code);
      const hydrationTransformer = new HydrationTransformer();
      hydrationTransformer.transform(hydrationS, hydrationSourceFile);
      const hydratedCode = hydrationS.toString();

      // 2. Run the main compile pipeline (reactive + component + JSX transforms)
      const compileResult = compile(hydratedCode, cleanId);

      let transformedCode = compileResult.code;

      // 3. CSS extraction (run on original code to find css() calls)
      const extraction = cssExtractor.extract(code, cleanId);
      if (extraction.css.length > 0) {
        fileExtractions.set(cleanId, extraction);

        if (isProduction && enableCssExtraction) {
          // In production: inject import of the virtual CSS module
          transformedCode = `import '${VIRTUAL_CSS_PREFIX}${cleanId}';\n${transformedCode}`;
        }

        // Register/update CSS for HMR tracking
        cssHmrHandler.register(cleanId, extraction.css);
      }

      return {
        code: transformedCode,
        map: compileResult.map,
      };
    },

    handleHotUpdate(ctx) {
      const { file, modules } = ctx;

      // 1. Handle .vertz/generated/ file changes -- invalidate importing modules
      if (file.includes('.vertz/generated/') || file.includes('.vertz\\generated\\')) {
        const affectedModules = [];
        for (const mod of modules) {
          affectedModules.push(mod);
          // Also invalidate modules that import the changed module
          for (const importer of mod.importers) {
            affectedModules.push(importer);
          }
        }
        return affectedModules.length > 0 ? affectedModules : undefined;
      }

      // 2. Handle tsx/jsx file changes -- check for CSS-only updates
      if (!shouldTransform(file)) return undefined;

      const content = ctx.read();

      // read() may return string or Promise<string>
      const processContent = (newCode: string) => {
        const extraction = cssExtractor.extract(newCode, file);
        const hmrResult = cssHmrHandler.update(file, extraction.css);

        if (hmrResult.hasChanged) {
          fileExtractions.set(file, extraction);

          // Find the virtual CSS module and invalidate it
          const virtualId = VIRTUAL_CSS_PREFIX + file;
          const cssModule = ctx.server.moduleGraph.getModuleById(virtualId);

          if (cssModule) {
            // CSS-only change: invalidate only the virtual CSS module
            ctx.server.moduleGraph.invalidateModule(cssModule);
            return [cssModule, ...modules];
          }
        }

        // For non-CSS changes, let Vite handle the standard HMR
        return undefined;
      };

      if (typeof content === 'string') {
        return processContent(content);
      }

      return content.then(processContent);
    },

    generateBundle() {
      if (!isProduction || !enableCssExtraction) return;

      // 1. Collect used files from the module graph (all files we have seen)
      const usedFiles = new Set(fileExtractions.keys());

      // 2. Dead CSS elimination
      const deadCssEliminator = new DeadCSSEliminator();
      const liveCSS = deadCssEliminator.eliminate(fileExtractions, usedFiles);

      // 3. Route-level code splitting (if route map is provided)
      if (options?.routeMap && options.routeMap.size > 0) {
        const routeManifest = new RouteCSSManifest();
        const manifest = routeManifest.build(options.routeMap, fileExtractions);

        const codeSplitter = new CSSCodeSplitter();
        const chunks = codeSplitter.split(manifest, fileExtractions);

        // Emit per-route CSS assets
        for (const [route, css] of Object.entries(chunks)) {
          if (css.length === 0) continue;

          const fileName =
            route === '__common' ? 'assets/common.css' : `assets/route-${sanitizeRoute(route)}.css`;

          this.emitFile({
            type: 'asset',
            fileName,
            source: css,
          });
        }
      } else if (liveCSS.length > 0) {
        // No route map: emit a single combined CSS file
        this.emitFile({
          type: 'asset',
          fileName: 'assets/vertz.css',
          source: liveCSS,
        });
      }
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────────

/** Simple glob matching that handles common patterns. */
function matchGlob(filePath: string, pattern: string): boolean {
  // Handle **/<segment>/** patterns (e.g., "**/vendor/**")
  if (pattern.startsWith('**/') && pattern.endsWith('/**')) {
    const segment = pattern.slice(3, -3);
    return filePath.includes(`/${segment}/`) || filePath.includes(`\\${segment}\\`);
  }

  // Handle recursive glob patterns like "**/*.tsx" or "**/*.ui.tsx"
  if (pattern.startsWith('**/')) {
    const suffix = pattern.slice(3);
    if (suffix.startsWith('*.')) {
      const ext = suffix.slice(1);
      return filePath.endsWith(ext);
    }
    return filePath.includes(suffix);
  }

  // Handle extension patterns like "*.tsx"
  if (pattern.startsWith('*.')) {
    const ext = pattern.slice(1);
    return filePath.endsWith(ext);
  }

  // Handle exact path patterns
  return filePath.includes(pattern);
}

/** Sanitize a route path for use as a filename. */
function sanitizeRoute(route: string): string {
  return route
    .replace(/^\//, '')
    .replace(/\//g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '_')
    .replace(/^$/, 'index');
}
