export type {
  SandboxConfig,
  ExecResult,
  SearchMatch,
  SandboxClient,
  DaytonaSandbox,
} from './sandbox-client';
export { wrapSandbox } from './sandbox-client';

const HOME_DIR = '/home/daytona';
const WORK_DIR = '/home/daytona/workspace';

export async function createSandbox(
  config: import('./sandbox-client').SandboxConfig,
): Promise<import('./sandbox-client').SandboxClient> {
  const { Daytona } = await import('@daytonaio/sdk');
  const { wrapSandbox } = await import('./sandbox-client');

  const daytona = new Daytona({
    apiKey: process.env.DAYTONA_API_KEY!,
    apiUrl: process.env.DAYTONA_API_URL,
  });
  const sandbox = await daytona.create({ language: 'typescript' });

  const githubToken = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT;
  const cloneUrl = githubToken
    ? `https://x-access-token:${githubToken}@github.com/${config.repo}.git`
    : `https://github.com/${config.repo}.git`;

  // Clone into /home/daytona/workspace (the default workdir for all commands)
  await sandbox.process.executeCommand(
    `git clone ${cloneUrl} workspace`,
    HOME_DIR,
    undefined,
    120,
  );

  if (config.branch) {
    await sandbox.process.executeCommand(`git checkout -b ${config.branch}`, WORK_DIR);
  }

  // Install dependencies (bun is available in TypeScript sandboxes)
  await sandbox.process.executeCommand('bun install', WORK_DIR, undefined, 120);

  return wrapSandbox(
    sandbox as unknown as import('./sandbox-client').DaytonaSandbox,
  );
}
