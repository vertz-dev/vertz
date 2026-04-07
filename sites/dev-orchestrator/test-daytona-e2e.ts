/**
 * E2E test: workflow with REAL Daytona sandbox + real MiniMax + real GitHub.
 *
 * Runs Phase 1 (plan + reviews + publish PR → approval gate) against a given issue,
 * with the actual vertz repo cloned in the sandbox so agents can read real source files.
 *
 * Usage: doppler run --project vertz -c dev -- bun run sites/dev-orchestrator/test-daytona-e2e.ts [issueNumber]
 */
import { runWorkflow, createMinimaxAdapter } from '@vertz/agents';
import type { AdapterFactory, ToolProvider } from '@vertz/agents';
import { createGitHubClient } from './src/lib/github-client';
import { featureWorkflow } from './src/workflows/feature';
import { createSandboxProvider } from './src/tools/sandbox-tools';
import { createGitHubProvider } from './src/tools/github';
import { createBuildProvider } from './src/tools/build';
import { createGitProvider } from './src/tools/git';
import { wrapSandbox } from './src/lib/sandbox-client';
import type { SandboxClient, DaytonaSandbox } from './src/lib/sandbox-client';

const WORK_DIR = '/home/daytona/workspace';
const ISSUE_NUMBER = parseInt(process.argv[2] ?? '1748', 10);
const REPO = 'vertz-dev/vertz';

async function createRealSandbox(): Promise<{ client: SandboxClient; raw: DaytonaSandbox }> {
  const { Daytona } = await import('@daytonaio/sdk');

  console.log('Creating Daytona sandbox...');
  const daytona = new Daytona({
    apiKey: process.env.DAYTONA_API_KEY!,
    apiUrl: process.env.DAYTONA_API_URL,
  });

  const sandbox = await daytona.create({ language: 'typescript' });
  console.log('Sandbox created.');

  const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT;
  const cloneUrl = token
    ? `https://x-access-token:${token}@github.com/${REPO}.git`
    : `https://github.com/${REPO}.git`;

  // Shallow clone (depth 1) — fast enough, avoids sparse checkout issues
  console.log('Cloning repo (depth 1)...');
  const cloneResult = await sandbox.process.executeCommand(
    `git clone --depth 1 ${cloneUrl} ${WORK_DIR}`,
    '/home/daytona',
    undefined,
    120,
  );
  console.log(`Clone exit: ${cloneResult.exitCode}`);

  // Configure git identity for commits
  await sandbox.process.executeCommand(
    'git config user.email "viniciusldacal@gmail.com" && git config user.name "Vinicius Dacal"',
    WORK_DIR,
  );

  // Verify
  const verify = await sandbox.process.executeCommand('ls packages/', WORK_DIR);
  console.log(`Packages: ${verify.result.trim().split('\n').slice(0, 5).join(', ')}...`);

  const raw = sandbox as unknown as DaytonaSandbox;
  return { client: wrapSandbox(raw), raw };
}

async function main() {
  console.log(`=== E2E: Design workflow for issue #${ISSUE_NUMBER} ===\n`);

  const github = createGitHubClient(process.env.GITHUB_PAT!);
  let raw: DaytonaSandbox | undefined;

  try {
    const { client: sandbox, raw: rawSandbox } = await createRealSandbox();
    raw = rawSandbox;

    // Compose tool providers from real sandbox + GitHub
    const tools: ToolProvider = {
      ...createSandboxProvider(sandbox),
      ...createGitHubProvider(github),
      ...createBuildProvider(sandbox),
      ...createGitProvider(sandbox),
    };

    const adapterFactory: AdapterFactory = (opts) => createMinimaxAdapter(opts);
    const fallbackLlm = createMinimaxAdapter({
      config: { provider: 'minimax' as const, model: 'MiniMax-M2.7' },
      tools: {},
    });

    console.log('\n=== Running: plan → reviews → publish-design-pr → (approval gate) ===\n');
    const t1 = Date.now();

    const result = await runWorkflow(featureWorkflow, {
      input: { issueNumber: ISSUE_NUMBER, repo: REPO },
      llm: fallbackLlm,
      createAdapter: adapterFactory,
      tools,
    });

    const elapsed = ((Date.now() - t1) / 1000).toFixed(1);
    console.log(`\n=== Result: ${result.status} (${elapsed}s) ===\n`);

    for (const [name, sr] of Object.entries(result.stepResults)) {
      console.log(`  ${name}: ${sr.status} (${sr.iterations} iter)`);
      if (sr.response.length > 0) {
        const preview = sr.response.slice(0, 200).replace(/\n/g, ' ');
        console.log(`    ${preview}${sr.response.length > 200 ? '...' : ''}`);
      }
    }

    if (result.status === 'pending') {
      console.log(`\nWorkflow paused at: ${result.pendingStep}`);
      console.log(`Message: ${result.approvalMessage}`);
    }

    // Check artifacts
    const planFile = await sandbox.exec(
      `test -f plans/issue-${ISSUE_NUMBER}.md && wc -c plans/issue-${ISSUE_NUMBER}.md || echo "not found"`,
    );
    console.log(`\nDesign doc: ${planFile.stdout.trim()}`);

    const reviewFiles = await sandbox.exec(
      `find reviews/issue-${ISSUE_NUMBER}/ -name "*.md" 2>/dev/null || echo "none"`,
    );
    console.log(`Reviews: ${reviewFiles.stdout.trim()}`);

    // Download artifacts locally
    const artifactDir = `${import.meta.dir}/e2e-artifacts`;
    const { mkdirSync, writeFileSync } = await import('fs');
    mkdirSync(`${artifactDir}/reviews`, { recursive: true });

    const filesToDownload = [
      { remote: `plans/issue-${ISSUE_NUMBER}.md`, local: 'design-doc.md' },
      { remote: `reviews/issue-${ISSUE_NUMBER}/dx.md`, local: 'reviews/dx.md' },
      { remote: `reviews/issue-${ISSUE_NUMBER}/product.md`, local: 'reviews/product.md' },
      { remote: `reviews/issue-${ISSUE_NUMBER}/technical.md`, local: 'reviews/technical.md' },
    ];

    for (const f of filesToDownload) {
      try {
        const content = await sandbox.readFile(`${WORK_DIR}/${f.remote}`);
        writeFileSync(`${artifactDir}/${f.local}`, content);
        console.log(`  Saved: ${f.local} (${content.length} bytes)`);
      } catch (e) {
        console.log(`  Skip: ${f.local} (${(e as Error).message})`);
      }
    }

    console.log('\nDone. Check the PR on GitHub.');

  } finally {
    if (raw) {
      console.log('\nDestroying sandbox...');
      await raw.delete();
      console.log('Sandbox destroyed.');
    }
  }
}

main().catch((e) => {
  console.error('FAILED:', e.message ?? e);
  process.exit(1);
});
