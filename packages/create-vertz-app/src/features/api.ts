import {
  apiDevelopmentRuleTemplate,
  envExampleTemplate,
  envModuleTemplate,
  envTemplate,
  vertzConfigTemplate,
} from '../templates/index.js';
import type { Feature, FeatureContext } from './types.js';

function serverContent(ctx: FeatureContext): string {
  const lines: string[] = [];

  lines.push("import { createServer } from 'vertz/server';");

  if (ctx.hasFeature('db')) {
    lines.push("import { db } from './db';");
  }

  lines.push("import { env } from './env';");

  if (ctx.hasFeature('entity-example')) {
    lines.push("import { tasks } from './entities/tasks.entity';");
  }

  lines.push('');
  lines.push('const app = createServer({');
  lines.push("  basePath: '/api',");

  if (ctx.hasFeature('entity-example')) {
    lines.push('  entities: [tasks],');
  } else {
    lines.push('  entities: [],');
  }

  if (ctx.hasFeature('db')) {
    lines.push('  db,');
  }

  lines.push('});');
  lines.push('');
  lines.push('export default app;');
  lines.push('');
  lines.push('if (import.meta.main) {');
  lines.push('  app.listen(env.PORT).then((handle) => {');
  lines.push('    console.log(`Server running at http://localhost:${handle.port}/api`);');
  lines.push('  });');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function devTsContent(ctx: FeatureContext): string {
  const hasUi = ctx.hasFeature('ui');
  const hasDb = ctx.hasFeature('db');
  const hasEntity = ctx.hasFeature('entity-example');

  if (hasUi) {
    // Full-stack: dev server with UI + API
    const lines = [
      '/**',
      ' * Vertz Dev Server — entry point for development.',
      ' *',
      ' * To add a new entity:',
      ' * 1. Add table + model in src/api/schema.ts',
      ' * 2. Create src/api/entities/your.entity.ts',
      ' * 3. Import and add to entities array below',
      ' * 4. Run: bun run dev (tables auto-created)',
      ' */',
      '',
      "import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';",
      "import { createServer } from 'vertz/server';",
    ];

    if (hasDb) {
      lines.push("import { createDb } from 'vertz/db';");
    }

    lines.push("import { resolve } from 'path';");
    lines.push('');

    if (hasEntity) {
      lines.push("import { tasksModel } from './src/api/schema';");
      lines.push("import { tasks } from './src/api/entities/tasks.entity';");
      lines.push('');
    }

    lines.push('const PORT = Number(process.env.PORT ?? 4200);');
    lines.push('');

    if (hasDb) {
      lines.push('const db = createDb({');
      lines.push("  dialect: 'sqlite',");
      lines.push("  path: './data.db',");
      if (hasEntity) {
        lines.push('  models: { tasks: tasksModel },');
      } else {
        lines.push('  models: {},');
      }
      lines.push('  migrations: { autoApply: true },');
      lines.push('});');
      lines.push('');
    }

    lines.push('const app = createServer({');
    if (hasEntity) {
      lines.push('  entities: [tasks],');
    } else {
      lines.push('  entities: [],');
    }
    if (hasDb) {
      lines.push('  db,');
    }
    lines.push('});');
    lines.push('');

    lines.push('const server = createBunDevServer({');
    lines.push("  entry: resolve('./src/app.tsx'),");
    lines.push('  port: PORT,');
    lines.push('  apiHandler: app.handler,');
    lines.push('  projectRoot: process.cwd(),');
    lines.push('});');
    lines.push('');
    lines.push('await server.start();');
    lines.push('');

    return lines.join('\n');
  }

  // API-only: simpler dev server
  const lines = [
    '/**',
    ' * Vertz API Dev Server',
    ' *',
    ' * To add a new entity:',
    ' * 1. Add table + model in src/api/schema.ts',
    ' * 2. Create src/api/entities/your.entity.ts',
    ' * 3. Import and add to entities array below',
    ' */',
    '',
    "import { createServer } from 'vertz/server';",
  ];

  if (hasDb) {
    lines.push("import { createDb } from 'vertz/db';");
  }

  lines.push('');

  if (hasEntity) {
    lines.push("import { tasksModel } from './src/api/schema';");
    lines.push("import { tasks } from './src/api/entities/tasks.entity';");
    lines.push('');
  }

  lines.push('const PORT = Number(process.env.PORT ?? 3000);');
  lines.push('');

  if (hasDb) {
    lines.push('const db = createDb({');
    lines.push("  dialect: 'sqlite',");
    lines.push("  path: './data.db',");
    if (hasEntity) {
      lines.push('  models: { tasks: tasksModel },');
    } else {
      lines.push('  models: {},');
    }
    lines.push('  migrations: { autoApply: true },');
    lines.push('});');
    lines.push('');
  }

  lines.push('const app = createServer({');
  if (hasEntity) {
    lines.push('  entities: [tasks],');
  } else {
    lines.push('  entities: [],');
  }
  if (hasDb) {
    lines.push('  db,');
  }
  lines.push('});');
  lines.push('');
  lines.push('app.listen(PORT).then((handle) => {');
  lines.push('  console.log(`Server running at http://localhost:${handle.port}/api`);');
  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

function apiVertzConfig(ctx: FeatureContext): string {
  if (ctx.hasFeature('entity-example') || ctx.hasFeature('db')) {
    return vertzConfigTemplate();
  }
  return `/** @type {import('@vertz/compiler').VertzConfig} */
export default {
  compiler: {
    entryFile: 'src/api/server.ts',
  },
};
`;
}

export const apiFeature: Feature = {
  name: 'api',
  dependencies: ['core'],

  files(ctx) {
    return [
      { path: 'vertz.config.ts', content: apiVertzConfig(ctx) },
      { path: '.env', content: envTemplate() },
      { path: '.env.example', content: envExampleTemplate() },
      { path: 'dev.ts', content: devTsContent(ctx) },
      { path: 'src/api/server.ts', content: serverContent(ctx) },
      { path: 'src/api/env.ts', content: envModuleTemplate() },
      { path: '.claude/rules/api-development.md', content: apiDevelopmentRuleTemplate() },
    ];
  },

  packages: {
    devDependencies: {
      '@vertz/cli': '^0.2.0',
    },
    scripts: {
      dev: 'bun run dev.ts',
      start: 'vertz start',
      codegen: 'vertz codegen',
    },
  },
};
