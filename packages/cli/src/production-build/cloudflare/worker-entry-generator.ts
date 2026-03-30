/**
 * WorkerEntryGenerator — generates Cloudflare Worker entry point code
 *
 * Generates an index.js that:
 * - Uses createHandler() from @vertz/cloudflare (existing handler)
 * - Uses createDb({ d1 }) from @vertz/db (existing D1 support)
 * - Initializes createServer() once per cold start (lazy init)
 * - Imports entities from their source files
 */

import { relative } from 'node:path';
import type { EntityIR } from '@vertz/compiler';

export class WorkerEntryGenerator {
  /** Output directory for the generated entry (used to compute relative imports) */
  private outputDir: string;

  constructor(
    private readonly entities: EntityIR[],
    outputDir: string = '.vertz/build/worker',
  ) {
    this.outputDir = outputDir;
  }

  generate(): string {
    const imports = this.generateImports();
    const entityNames = this.entities.map((e) => this.entityVarName(e.name));
    const entityArrayLiteral = entityNames.join(', ');

    return `${imports}

let cachedApp = null;
let cachedEnv = null;

function initApp(env) {
  const db = createDb({ dialect: 'sqlite', d1: env.DB });
  return createServer({ entities: [${entityArrayLiteral}], db });
}

export default createHandler({
  app: (env) => {
    if (!cachedApp || cachedEnv !== env) {
      cachedApp = initApp(env);
      cachedEnv = env;
    }
    return cachedApp;
  },
});
`;
  }

  private generateImports(): string {
    const lines: string[] = [];

    lines.push("import { createHandler } from '@vertz/cloudflare';");
    lines.push("import { createServer } from '@vertz/server';");
    lines.push("import { createDb } from '@vertz/db';");

    // Group entities by source file
    const byFile = new Map<string, EntityIR[]>();
    for (const entity of this.entities) {
      const file = entity.file;
      const existing = byFile.get(file) ?? [];
      existing.push(entity);
      byFile.set(file, existing);
    }

    for (const [file, entities] of byFile) {
      const names = entities.map((e) => this.entityVarName(e.name));
      const importPath = this.resolveImportPath(file);
      lines.push(`import { ${names.join(', ')} } from '${importPath}';`);
    }

    return lines.join('\n');
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
