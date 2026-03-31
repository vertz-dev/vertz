import { gitignoreTemplate, tsconfigTemplate } from '../templates/index.js';
import type { Feature, FeatureContext } from './types.js';

function claudeMdContent(ctx: FeatureContext): string {
  const isApiOnly = ctx.hasFeature('api') && !ctx.hasFeature('ui');
  const isUiOnly = ctx.hasFeature('ui') && !ctx.hasFeature('api');

  const stackType = isApiOnly ? 'API-only' : isUiOnly ? 'UI-only' : 'full-stack TypeScript';

  const lines = [
    `# ${ctx.projectName}`,
    '',
    `A ${stackType} application built with [Vertz](https://vertz.dev).`,
    '',
    '## Stack',
    '',
    '- Runtime: Bun',
    `- Framework: Vertz (${stackType})`,
    '- Language: TypeScript (strict mode)',
    '- Docs: https://docs.vertz.dev',
    '',
    '## Development',
    '',
    '```bash',
    'bun install          # Install dependencies',
    'bun run dev          # Start dev server with HMR',
    'bun run build        # Production build',
    '```',
    '',
  ];

  if (ctx.hasFeature('api')) {
    lines.push(
      'The dev server automatically runs codegen and migrations when files change.',
      '',
    );
  }

  if (isUiOnly) {
    lines.push(
      '## Adding a Backend',
      '',
      'To add API and database support, see https://docs.vertz.dev/guides/server/overview',
      '',
    );
  }

  if (ctx.hasFeature('router')) {
    lines.push(
      '## Routing',
      '',
      'Routes are defined in `src/router.tsx` using `defineRoutes` and `createRouter`.',
      'To add a new page, create a component in `src/pages/` and add a route entry in `src/router.tsx`.',
      '',
    );
  }

  lines.push(
    '## Conventions',
    '',
    '- See `.claude/rules/` for development conventions',
    '- Refer to https://docs.vertz.dev for full framework documentation',
  );

  if (ctx.hasFeature('ui')) {
    lines.push(
      '- The Vertz compiler handles all reactivity — never use `.value`, `signal()`, or `computed()` manually',
    );
  }

  lines.push('');

  return lines.join('\n');
}

export const coreFeature: Feature = {
  name: 'core',
  dependencies: [],

  files(ctx) {
    return [
      { path: 'tsconfig.json', content: tsconfigTemplate() },
      { path: '.gitignore', content: gitignoreTemplate() },
      { path: 'CLAUDE.md', content: claudeMdContent(ctx) },
    ];
  },

  packages: {
    dependencies: {
      vertz: '^0.2.0',
    },
    devDependencies: {
      'bun-types': '^1.0.0',
      typescript: '^5.8.0',
    },
    scripts: {},
  },
};
