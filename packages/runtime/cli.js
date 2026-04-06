#!/usr/bin/env node
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
  // Native binary not available — fall back to bun for supported subcommands
  const [sub, ...rest] = process.argv.slice(2);
  if (sub === 'run') run('bun', ['run', ...rest]);
  if (sub === 'exec') run('bunx', rest);
  if (sub === 'test') run('bun', ['test', ...rest]);
  console.error(
    `vtz: native binary not available and '${sub ?? ''}' has no bun fallback.\n` +
      'Build the native runtime: cd native && cargo build --release',
  );
  process.exit(1);
}

run(binary, process.argv.slice(2));
