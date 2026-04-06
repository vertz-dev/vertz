#!/usr/bin/env node
// vtzx is shorthand for `vtz exec` — prepend 'exec' to match native binary behavior
import { spawnSync } from 'node:child_process';
import { getBinaryPath } from './index.js';

const binary = getBinaryPath();
const result = spawnSync(binary, ['exec', ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.signal) {
  process.kill(process.pid, result.signal);
}
process.exit(result.status ?? 1);
