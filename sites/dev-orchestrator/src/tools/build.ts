import { tool } from '@vertz/agents';
import type { InferToolProvider } from '@vertz/agents';
import { s } from '@vertz/schema';
import type { SandboxClient } from '../lib/sandbox-client';

// ---------------------------------------------------------------------------
// Tool declarations
// ---------------------------------------------------------------------------

export const runTests = tool({
  description: 'Run tests in the sandbox',
  input: s.object({
    packages: s.array(s.string()).optional(),
  }),
  output: s.object({ passed: s.boolean(), output: s.string() }),
});

export const runTypecheck = tool({
  description: 'Run TypeScript typecheck in the sandbox',
  input: s.object({
    packages: s.array(s.string()).optional(),
  }),
  output: s.object({ passed: s.boolean(), output: s.string() }),
});

export const runLint = tool({
  description: 'Run linter in the sandbox',
  input: s.object({
    files: s.array(s.string()).optional(),
  }),
  output: s.object({ passed: s.boolean(), output: s.string() }),
});

// ---------------------------------------------------------------------------
// Tool provider
// ---------------------------------------------------------------------------

const buildTools = { runTests, runTypecheck, runLint };

export function createBuildProvider(sandbox: SandboxClient): InferToolProvider<typeof buildTools> {
  return {
    runTests: async ({ packages }) => {
      const cmd = packages?.length
        ? `vtz test ${packages.join(' ')}`
        : 'vtz test';
      const result = await sandbox.exec(cmd);
      return { passed: result.exitCode === 0, output: result.stdout };
    },
    runTypecheck: async ({ packages: _packages }) => {
      const result = await sandbox.exec('vtz run typecheck');
      return { passed: result.exitCode === 0, output: result.stdout };
    },
    runLint: async ({ files }) => {
      const target = files?.length ? files.join(' ') : 'src/';
      const result = await sandbox.exec(`vtz exec oxlint --fix ${target}`);
      return { passed: result.exitCode === 0, output: result.stdout };
    },
  };
}
