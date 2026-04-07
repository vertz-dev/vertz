/**
 * Quick probe: verify Daytona sandbox directory structure.
 * Usage: doppler run --project vertz -c dev -- bun run sites/dev-orchestrator/test-daytona-probe.ts
 */

async function main() {
  const { Daytona } = await import('@daytonaio/sdk');

  console.log('Creating Daytona sandbox...');
  const daytona = new Daytona({
    apiKey: process.env.DAYTONA_API_KEY!,
    apiUrl: process.env.DAYTONA_API_URL,
  });

  const sandbox = await daytona.create({ language: 'typescript' });
  console.log('Sandbox created.\n');

  try {
    // Check default directory structure
    const pwd = await sandbox.process.executeCommand('pwd');
    console.log('pwd:', pwd.result.trim());

    const home = await sandbox.process.executeCommand('ls -la /home/daytona/');
    console.log('\n/home/daytona/:\n', home.result);

    const wsExists = await sandbox.process.executeCommand('test -d /home/daytona/workspace && echo "exists" || echo "not found"');
    console.log('/home/daytona/workspace:', wsExists.result.trim());

    // Clone a small part of the repo to test paths
    const token = process.env.GITHUB_TOKEN ?? process.env.GITHUB_PAT;
    const cloneUrl = token
      ? `https://x-access-token:${token}@github.com/vertz-dev/vertz.git`
      : 'https://github.com/vertz-dev/vertz.git';

    console.log('\nCloning repo (sparse, depth 1)...');
    // Use sparse checkout to avoid cloning the entire monorepo
    await sandbox.process.executeCommand(
      `git clone --depth 1 --filter=blob:none --sparse ${cloneUrl} /home/daytona/workspace`,
      '/home/daytona',
      undefined,
      60,
    );
    await sandbox.process.executeCommand(
      'git sparse-checkout set packages/openapi',
      '/home/daytona/workspace',
    );
    console.log('Clone done.');

    // Verify structure
    const ls = await sandbox.process.executeCommand('ls -la', '/home/daytona/workspace');
    console.log('\n/home/daytona/workspace/:\n', ls.result);

    const lsPkgs = await sandbox.process.executeCommand('ls packages/', '/home/daytona/workspace');
    console.log('packages/:\n', lsPkgs.result);

    const lsOpenapi = await sandbox.process.executeCommand('find packages/openapi -type f | head -20', '/home/daytona/workspace');
    console.log('packages/openapi files:\n', lsOpenapi.result);

    // Test file read via SDK
    const pkg = await sandbox.fs.downloadFile('/home/daytona/workspace/packages/openapi/package.json');
    console.log('\npackages/openapi/package.json:\n', pkg.toString().slice(0, 200));

    // Test search via SDK
    const results = await sandbox.fs.findFiles('/home/daytona/workspace/packages/openapi', 'operationId');
    console.log('\nSearch "operationId" in openapi:', results.length, 'matches');
    for (const r of results.slice(0, 5)) {
      console.log(`  ${r.file}:${r.line} ${r.content.trim().slice(0, 80)}`);
    }

  } finally {
    console.log('\nDestroying sandbox...');
    await sandbox.delete();
    console.log('Done.');
  }
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
