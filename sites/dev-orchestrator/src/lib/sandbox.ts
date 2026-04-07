export type {
  SandboxConfig,
  ExecResult,
  SearchMatch,
  SandboxClient,
  DaytonaSandbox,
} from './sandbox-client';
export { wrapSandbox } from './sandbox-client';

const WORK_DIR = '/home/daytona/workspace';

export async function createSandbox(
  config: import('./sandbox-client').SandboxConfig,
): Promise<import('./sandbox-client').SandboxClient> {
  const { Daytona } = await import('@daytonaio/sdk');
  const { wrapSandbox } = await import('./sandbox-client');

  const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY! });
  const sandbox = await daytona.create({ language: 'typescript' });

  const githubToken = process.env.GITHUB_TOKEN;
  const cloneUrl = githubToken
    ? `https://x-access-token:${githubToken}@github.com/${config.repo}.git`
    : `https://github.com/${config.repo}.git`;

  await sandbox.process.executeCommand(`git clone ${cloneUrl} workspace`, WORK_DIR);

  if (config.branch) {
    await sandbox.process.executeCommand(`git checkout -b ${config.branch}`, WORK_DIR);
  }

  await sandbox.process.executeCommand('vtz install', WORK_DIR);

  return wrapSandbox(
    sandbox as unknown as import('./sandbox-client').DaytonaSandbox,
  );
}
