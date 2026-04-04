import { cond, pipe, task } from './index';
import type { DepEdge } from './types';

// Valid: command task
pipe({ tasks: { build: task({ command: 'bun run build' }) } });

// Valid: steps task
pipe({ tasks: { checks: task({ steps: ['lint', 'test'] }) } });

// Valid: task shorthand
pipe({ tasks: { build: task('bun run build') } });

// @ts-expect-error — command and steps are mutually exclusive
pipe({ tasks: { build: task({ command: 'build', steps: ['a'] }) } });

// @ts-expect-error — cache requires both inputs AND outputs
pipe({ tasks: { build: task({ command: 'build', cache: { inputs: ['src/**'] } }) } });

// Valid: all dep edge types
pipe({
  tasks: {
    build: task('build'),
    test: task({
      command: 'test',
      deps: [
        'build', // bare string
        { task: 'build', on: 'success' }, // shortcut
        { task: 'build', on: 'always' }, // shortcut
        { task: 'build', on: 'failure' }, // shortcut
        { task: 'build', on: (r) => r.cached }, // callback
      ],
    }),
  },
});

// @ts-expect-error — invalid on value
const _badEdge: DepEdge = { task: 'build', on: 'maybe' };

// Valid: all condition types
cond.changed('src/**', 'package.json');
cond.branch('main', 'release/*');
cond.env('CI');
cond.env('NODE_ENV', 'production');
cond.all(cond.changed('native/**'), cond.branch('main'));
cond.any(cond.env('CI'), cond.branch('main'));

// Valid: secrets
pipe({ secrets: ['NPM_TOKEN'], tasks: {} });

// Valid: workflow filter types
pipe({
  tasks: { build: task('build') },
  workflows: {
    ci: { run: ['build'], filter: 'affected' },
    full: { run: ['build'], filter: 'all' },
    subset: { run: ['build'], filter: ['@vertz/ui', '@vertz/core'] },
  },
});

// Valid: cache config
pipe({
  tasks: {
    build: task({
      command: 'bun run build',
      cache: { inputs: ['src/**'], outputs: ['dist/**'] },
    }),
  },
  cache: { maxSize: 2048, remote: 'auto' },
});

// Valid: workspace config
pipe({
  tasks: {},
  workspace: {
    packages: ['packages/*'],
    native: { root: 'native', members: ['vtz'] },
  },
});

// Valid: workflow with rootAffectsAll
pipe({
  tasks: { build: task('build') },
  workflows: {
    ci: { run: ['build'], filter: 'affected', rootAffectsAll: true },
    full: { run: ['build'], filter: 'all', rootAffectsAll: false },
  },
});

// Valid: workflow without rootAffectsAll (defaults to false)
pipe({
  tasks: { build: task('build') },
  workflows: {
    ci: { run: ['build'], filter: 'affected' },
  },
});

// @ts-expect-error — rootAffectsAll must be a boolean
pipe({
  tasks: { build: task('build') },
  workflows: { ci: { run: ['build'], rootAffectsAll: 'yes' } },
});

// Valid: root-scoped task
pipe({
  tasks: {
    fmt: task({ command: 'bun run format', scope: 'root' }),
  },
});

// Valid: task with condition
pipe({
  tasks: {
    build: task({
      command: 'bun run build',
      cond: cond.changed('src/**'),
    }),
  },
});

// Valid: task with env and timeout
pipe({
  tasks: {
    test: task({
      command: 'bun test',
      env: { NODE_ENV: 'test' },
      timeout: 60000,
    }),
  },
});
