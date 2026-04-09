/**
 * Cloudflare Deploy Tests
 *
 * Tests for deploying Vertz apps to Cloudflare Workers:
 * - Manifest validation (exists, correct target)
 * - Dry-run mode (show plan without executing)
 * - Wrangler availability check
 * - Actual deployment via wrangler
 * - Custom config override
 * - D1 provisioning
 */

import { describe, expect, it } from '@vertz/test';
import type { DeploymentManifest } from '../../production-build/cloudflare/types';
import {
  type CloudflareDeployOptions,
  deployCloudflare,
  formatDeployPlan,
  validateManifest,
} from '../cloudflare';

function createTestManifest(overrides: Partial<DeploymentManifest> = {}): DeploymentManifest {
  return {
    version: 1,
    target: 'cloudflare',
    generatedAt: '2026-03-30T00:00:00.000Z',
    entities: [
      {
        name: 'todo',
        table: 'todos',
        tenantScoped: false,
        operations: ['list', 'get', 'create', 'update', 'delete'],
        accessRules: {
          list: { type: 'function' },
          get: { type: 'function' },
          create: { type: 'function' },
          update: { type: 'function' },
          delete: { type: 'function' },
        },
      },
    ],
    routes: [
      { method: 'GET', path: '/api/todo', entity: 'todo', operation: 'list' },
      { method: 'GET', path: '/api/todo/:id', entity: 'todo', operation: 'get' },
      { method: 'POST', path: '/api/todo', entity: 'todo', operation: 'create' },
      { method: 'PATCH', path: '/api/todo/:id', entity: 'todo', operation: 'update' },
      { method: 'DELETE', path: '/api/todo/:id', entity: 'todo', operation: 'delete' },
    ],
    bindings: [{ type: 'd1', name: 'DB', purpose: 'Primary database' }],
    assets: { hasClient: false },
    ssr: { enabled: false },
    ...overrides,
  };
}

describe('Feature: Cloudflare deployment', () => {
  describe('validateManifest', () => {
    describe('Given a valid cloudflare manifest', () => {
      describe('When validating', () => {
        it('returns ok', () => {
          const manifest = createTestManifest();
          const result = validateManifest(manifest);
          expect(result.ok).toBe(true);
        });
      });
    });

    describe('Given a manifest with wrong target', () => {
      describe('When validating', () => {
        it('returns error about incompatible target', () => {
          const manifest = createTestManifest({
            target: 'node' as DeploymentManifest['target'],
          });
          const result = validateManifest(manifest);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.message).toContain('incompatible');
            expect(result.error.message).toContain('cloudflare');
          }
        });
      });
    });

    describe('Given a manifest with unsupported version', () => {
      describe('When validating', () => {
        it('returns error about unsupported version', () => {
          const manifest = createTestManifest({ version: 99 as 1 });
          const result = validateManifest(manifest);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.message).toContain('version');
          }
        });
      });
    });
  });

  describe('formatDeployPlan', () => {
    describe('Given a valid manifest', () => {
      describe('When formatting the deploy plan', () => {
        it('includes worker name', () => {
          const manifest = createTestManifest();
          const plan = formatDeployPlan(manifest, 'my-app');
          expect(plan).toContain('my-app');
        });

        it('includes entity count', () => {
          const manifest = createTestManifest();
          const plan = formatDeployPlan(manifest, 'my-app');
          expect(plan).toContain('1');
          expect(plan).toContain('todo');
        });

        it('includes route count', () => {
          const manifest = createTestManifest();
          const plan = formatDeployPlan(manifest, 'my-app');
          expect(plan).toContain('5');
        });

        it('includes binding information', () => {
          const manifest = createTestManifest();
          const plan = formatDeployPlan(manifest, 'my-app');
          expect(plan).toContain('D1');
          expect(plan).toContain('DB');
        });
      });
    });
  });

  describe('deployCloudflare', () => {
    describe('Given no manifest exists', () => {
      describe('When running deploy', () => {
        it('returns error with build instruction', async () => {
          const options: CloudflareDeployOptions = {
            projectRoot: '/tmp/nonexistent',
            dryRun: false,
          };
          const result = await deployCloudflare(options);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.message).toContain('No deployment manifest found');
            expect(result.error.message).toContain('vertz build --target cloudflare');
          }
        });
      });
    });

    describe('Given a manifest with wrong target', () => {
      describe('When running deploy', () => {
        it('returns error about incompatible build target', async () => {
          const manifest = createTestManifest({
            target: 'node' as DeploymentManifest['target'],
          });
          const options: CloudflareDeployOptions = {
            projectRoot: '/tmp/test',
            dryRun: false,
            _testManifest: manifest,
          };
          const result = await deployCloudflare(options);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.message).toContain('incompatible');
          }
        });
      });
    });

    describe('Given a valid manifest and dry-run mode', () => {
      describe('When running deploy', () => {
        it('returns ok with the deployment plan', async () => {
          const manifest = createTestManifest();
          const options: CloudflareDeployOptions = {
            projectRoot: '/tmp/test',
            dryRun: true,
            _testManifest: manifest,
          };
          const result = await deployCloudflare(options);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value.dryRun).toBe(true);
            expect(result.value.plan).toContain('my-app');
          }
        });
      });
    });

    describe('Given a valid manifest and wrangler is not available', () => {
      describe('When running deploy (not dry-run)', () => {
        it('returns error with wrangler install instructions', async () => {
          const manifest = createTestManifest();
          const options: CloudflareDeployOptions = {
            projectRoot: '/tmp/test',
            dryRun: false,
            _testManifest: manifest,
            _execCommand: async () => {
              throw new Error('command not found: wrangler');
            },
          };
          const result = await deployCloudflare(options);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.message).toContain('wrangler');
            expect(result.error.message).toContain('npm install');
          }
        });
      });
    });

    describe('Given a valid manifest and custom config path', () => {
      describe('When running deploy', () => {
        it('uses the custom config path for wrangler', async () => {
          const manifest = createTestManifest();
          let capturedArgs: string[] = [];
          const options: CloudflareDeployOptions = {
            projectRoot: '/tmp/test',
            dryRun: false,
            config: '/tmp/test/custom-wrangler.toml',
            _testManifest: manifest,
            _execCommand: async (_cmd: string, args?: string[]) => {
              capturedArgs = args ?? [];
              return { stdout: 'https://my-app.workers.dev', stderr: '' };
            },
          };
          const result = await deployCloudflare(options);
          expect(result.ok).toBe(true);
          expect(capturedArgs).toContain('/tmp/test/custom-wrangler.toml');
        });
      });
    });

    describe('Given a valid manifest and wrangler is available', () => {
      describe('When running deploy successfully', () => {
        it('returns the deployment URL', async () => {
          const manifest = createTestManifest();
          const options: CloudflareDeployOptions = {
            projectRoot: '/tmp/test',
            dryRun: false,
            _testManifest: manifest,
            _execCommand: async () => ({
              stdout: 'Published my-app (1.5s)\nhttps://my-app.workers.dev',
              stderr: '',
            }),
          };
          const result = await deployCloudflare(options);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value.url).toContain('workers.dev');
          }
        });
      });
    });

    describe('Given wrangler deploy fails', () => {
      describe('When running deploy', () => {
        it('returns structured error from wrangler output', async () => {
          const manifest = createTestManifest();
          const options: CloudflareDeployOptions = {
            projectRoot: '/tmp/test',
            dryRun: false,
            _testManifest: manifest,
            _execCommand: async (_cmd: string, args?: string[]) => {
              if (args?.includes('--version')) {
                return { stdout: 'wrangler 3.0.0', stderr: '' };
              }
              throw new Error('Authentication error: You must be logged in. Run `wrangler login`.');
            },
          };
          const result = await deployCloudflare(options);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.message).toContain('Authentication');
          }
        });
      });
    });
  });
});
