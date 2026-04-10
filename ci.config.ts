import { pipe } from '@vertz/ci';

// Packages with build + typecheck + test scripts that participate in CI.
// Excludes: examples, benchmarks, docs-only sites, runtime platform binaries,
// build-only packages (@vertz/runtime, @vertz/site), and dev-orchestrator.
const CI_PACKAGES = [
  '@vertz/agents',
  '@vertz/ci',
  '@vertz/cli',
  '@vertz/cli-runtime',
  '@vertz/cloudflare',
  '@vertz/codegen',
  '@vertz/compiler',
  '@vertz/core',
  '@vertz/create-vertz-app',
  '@vertz/db',
  '@vertz/desktop',
  '@vertz/docs',
  '@vertz/errors',
  '@vertz/fetch',
  '@vertz/icons',
  '@vertz/mdx',
  '@vertz/openapi',
  '@vertz/schema',
  '@vertz/server',
  '@vertz/test',
  '@vertz/testing',
  '@vertz/theme-shadcn',
  '@vertz/tui',
  '@vertz/ui',
  '@vertz/ui-auth',
  '@vertz/ui-canvas',
  '@vertz/ui-primitives',
  '@vertz/ui-server',
  'vertz',
];

// Packages excluded from tests (but still build + typecheck)
const TEST_EXCLUDED = ['@vertz/ui-primitives'];

const TEST_PACKAGES = CI_PACKAGES.filter((p) => !TEST_EXCLUDED.includes(p));

export default pipe({
  tasks: {
    build: {
      command: 'bun run build',
      deps: ['^build'],
      cache: {
        inputs: ['src/**', 'package.json', 'tsconfig.json', 'bunup.config.ts'],
        outputs: ['dist/**'],
      },
    },

    typecheck: {
      command: 'bun run typecheck',
      deps: ['^build'],
      cache: {
        inputs: ['src/**', 'package.json', 'tsconfig.json', 'tsconfig.typecheck.json'],
        outputs: [],
      },
    },

    test: {
      command: 'bun run test',
      deps: ['^build'],
      env: { DATABASE_TEST_URL: process.env.DATABASE_TEST_URL ?? '' },
      timeout: 300_000,
      cache: {
        inputs: ['src/**', '__tests__/**', 'tests/**', 'package.json', 'tsconfig.json', 'bunfig.toml'],
        outputs: [],
      },
    },
  },

  workflows: {
    // Full CI: build + typecheck + test (push to main)
    ci: {
      run: ['build', 'typecheck', 'test'],
      filter: CI_PACKAGES,
    },

    // PR CI: only affected packages
    'ci:affected': {
      run: ['build', 'typecheck', 'test'],
      filter: 'affected',
      rootAffectsAll: true,
    },

    // Build + typecheck only (no tests)
    'build-typecheck': {
      run: ['build', 'typecheck'],
      filter: CI_PACKAGES,
    },

    'build-typecheck:affected': {
      run: ['build', 'typecheck'],
      filter: 'affected',
      rootAffectsAll: true,
    },

    // Test only
    test: {
      run: ['test'],
      filter: TEST_PACKAGES,
    },

    'test:affected': {
      run: ['test'],
      filter: 'affected',
      rootAffectsAll: true,
    },
  },

  workspace: {
    packages: ['packages/*'],
    native: { root: 'native', members: ['vtz', 'vertz-compiler', 'vertz-compiler-core'] },
  },

  cache: {
    local: '.pipe/cache',
  },
});
