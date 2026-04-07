#!/usr/bin/env node
// vtzx is shorthand for `vtz exec` — resolves commands from node_modules/.bin
import { spawnSync } from 'node:child_process';
import { join, delimiter } from 'node:path';

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.signal) {
    process.kill(process.pid, result.signal);
  }
  process.exit(result.status ?? 1);
}

function execFromBinPath(argv) {
  const [command, ...args] = argv;
  if (!command) {
    console.error('vtzx: no command specified');
    process.exit(1);
  }
  const binDir = join(process.cwd(), 'node_modules', '.bin');
  const env = { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH || ''}` };
  run(command, args, { env });
}

let binary;
try {
  const { getBinaryPath } = await import('./index.js');
  binary = getBinaryPath();
} catch {
  // Native binary not available or index.js not built — resolve from node_modules/.bin
  execFromBinPath(process.argv.slice(2));
}

run(binary, ['exec', ...process.argv.slice(2)]);
