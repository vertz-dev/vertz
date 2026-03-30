/**
 * WorkerEntryGenerator — generates Cloudflare Worker entry point code
 *
 * Two modes:
 * 1. Server entry mode (default): wraps the user's existing server module with createHandler.
 *    The server module already has entities, db, and models wired — no re-creation needed.
 *
 * 2. Standalone mode (D1 override): imports entities and models individually, creates a fresh
 *    server with D1 database. Used when the build pipeline needs to swap sqlite for D1.
 *
 * The generated code:
 * - Uses createHandler() from @vertz/cloudflare (existing handler)
 * - Caches the app per-isolate (lazy init on first request)
 * - Provides SSR fallback for API-only workers
 */

import { relative } from 'node:path';
import type { EntityIR } from '@vertz/compiler';

export interface WorkerEntryConfig {
  /** Path to the user's server entry file (e.g., 'src/api/server.ts') */
  serverEntry?: string;
}

export class WorkerEntryGenerator {
  /** Output directory for the generated entry (used to compute relative imports) */
  private outputDir: string;

  constructor(
    private readonly entities: EntityIR[],
    outputDir: string = '.vertz/build/worker',
    private readonly config: WorkerEntryConfig = {},
  ) {
    this.outputDir = outputDir;
  }

  generate(): string {
    if (this.config.serverEntry) {
      return this.generateServerEntryWrapper();
    }
    return this.generateStandalone();
  }

  /**
   * Server entry wrapper: imports the user's server module and wraps with createHandler.
   * The server module exports a default app with .handler — we just wrap it.
   */
  private generateServerEntryWrapper(): string {
    const serverImportPath = this.resolveImportPath(this.config.serverEntry!);

    return `import { createHandler } from '@vertz/cloudflare';
import app from '${serverImportPath}';

export default createHandler(app);
`;
  }

  /**
   * Standalone: imports entities and models individually, creates server with D1.
   * Uses model variable names and import sources from EntityIR.
   */
  private generateStandalone(): string {
    const imports = this.generateStandaloneImports();
    const modelEntries = this.generateModelEntries();
    const entityNames = this.entities.map((e) => this.entityVarName(e.name));

    return `${imports}

let cachedApp = null;
let cachedEnv = null;

function initApp(env) {
  const db = createDb({ models: { ${modelEntries} }, dialect: 'sqlite', d1: env.DB });
  return createServer({ entities: [${entityNames.join(', ')}], db });
}

export default createHandler({
  app: (env) => {
    if (!cachedApp || cachedEnv !== env) {
      cachedApp = initApp(env);
      cachedEnv = env;
    }
    return cachedApp;
  },
  ssr: () => Promise.resolve(new Response('Not Found', { status: 404 })),
});
`;
  }

  private generateStandaloneImports(): string {
    const lines: string[] = [];

    lines.push("import { createHandler } from '@vertz/cloudflare';");
    lines.push("import { createServer } from '@vertz/server';");
    lines.push("import { createDb } from '@vertz/db';");

    // Import models by their variable names from their source files
    const modelImports = new Map<string, Set<string>>();
    for (const entity of this.entities) {
      const source = entity.modelRef.importSource;
      if (!source) continue;
      const existing = modelImports.get(source) ?? new Set<string>();
      existing.add(entity.modelRef.variableName);
      modelImports.set(source, existing);
    }

    for (const [source, vars] of modelImports) {
      const importPath = this.resolveImportPath(source);
      lines.push(`import { ${[...vars].join(', ')} } from '${importPath}';`);
    }

    // Import entities by their export variable names from their source files
    // Convention: entity exported variable = entity name (camelCase of kebab-case name)
    const entityImports = new Map<string, Set<string>>();
    for (const entity of this.entities) {
      const existing = entityImports.get(entity.sourceFile) ?? new Set<string>();
      existing.add(this.entityVarName(entity.name));
      entityImports.set(entity.sourceFile, existing);
    }

    for (const [file, vars] of entityImports) {
      const importPath = this.resolveImportPath(file);
      lines.push(`import { ${[...vars].join(', ')} } from '${importPath}';`);
    }

    return lines.join('\n');
  }

  /**
   * Generate model entries for createDb({ models: { ... } }).
   * Maps entity name → model variable name.
   */
  private generateModelEntries(): string {
    return this.entities
      .map((e) => {
        const key = e.modelRef.tableName ?? e.name;
        const value = e.modelRef.variableName;
        return key === value ? key : `${key}: ${value}`;
      })
      .join(', ');
  }

  private resolveImportPath(sourceFile: string): string {
    // Strip .ts/.tsx extension for import
    const withoutExt = sourceFile.replace(/\.(ts|tsx)$/, '');
    // Compute relative path from output dir to source
    const rel = relative(this.outputDir, withoutExt);
    // Ensure it starts with ./ or ../
    return rel.startsWith('.') ? rel : `./${rel}`;
  }

  private entityVarName(entityName: string): string {
    // Convert kebab-case entity name to camelCase variable name
    // e.g., 'todo-item' → 'todoItem', 'todo' → 'todo'
    return entityName.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  }
}
