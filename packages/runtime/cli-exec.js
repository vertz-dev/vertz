#!/usr/bin/env node
// vtzx is shorthand for `vtz exec` — fall back to bunx when native binary is unavailable
import { spawnSync } from 'node:child_process';
import { getBinaryPath } from './index.js';

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.signal) {
    process.kill(process.pid, result.signal);
  }
  process.exit(result.status ?? 1);
}

let binary;
try {
  binary = getBinaryPath();
} catch {
  // Native binary not available — vtzx = bunx
  run('bunx', process.argv.slice(2));
}

run(binary, ['exec', ...process.argv.slice(2)]);
