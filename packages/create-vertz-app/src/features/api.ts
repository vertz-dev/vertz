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
      start: 'vertz start',
      codegen: 'vertz codegen',
    },
  },
};
