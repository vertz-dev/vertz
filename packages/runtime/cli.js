#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { getBinaryPath } from './index.js';

const binary = getBinaryPath();
const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
if (result.signal) {
  process.kill(process.pid, result.signal);
}
process.exit(result.status ?? 1);
