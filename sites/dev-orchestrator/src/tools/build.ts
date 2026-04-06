import { tool } from '@vertz/agents';
import { s } from '@vertz/schema';
import type { SandboxClient } from '../lib/sandbox-client';

export function createBuildTools(sandbox: SandboxClient) {
  const runTests = tool({
    description: 'Run tests in the sandbox',
    input: s.object({
      packages: s.array(s.string()).optional(),
    }),
    output: s.object({ passed: s.boolean(), output: s.string() }),
    async handler({ packages }) {
      const cmd = packages?.length
        ? `vtz test ${packages.join(' ')}`
        : 'vtz test';
      const result = await sandbox.exec(cmd);
      return {
        passed: result.exitCode === 0,
        output: result.stdout,
      };
    },
  });

  const runTypecheck = tool({
    description: 'Run TypeScript typecheck in the sandbox',
    input: s.object({
      packages: s.array(s.string()).optional(),
    }),
    output: s.object({ passed: s.boolean(), output: s.string() }),
    async handler() {
      const result = await sandbox.exec('vtz run typecheck');
      return {
        passed: result.exitCode === 0,
        output: result.stdout,
      };
    },
  });

  const runLint = tool({
    description: 'Run linter in the sandbox',
    input: s.object({
      files: s.array(s.string()).optional(),
    }),
    output: s.object({ passed: s.boolean(), output: s.string() }),
    async handler({ files }) {
      const target = files?.length ? files.join(' ') : 'src/';
      const result = await sandbox.exec(`vtz exec oxlint --fix ${target}`);
      return {
        passed: result.exitCode === 0,
        output: result.stdout,
      };
    },
  });

  return { runTests, runTypecheck, runLint };
}
