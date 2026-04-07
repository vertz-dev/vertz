#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { getBinaryPath } from './index.js';

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.signal) {
    process.kill(process.pid, result.signal);
  }
  process.exit(result.status ?? 1);
}

function binEnv() {
  const binDir = join(process.cwd(), 'node_modules', '.bin');
  return { ...process.env, PATH: `${binDir}${delimiter}${process.env.PATH || ''}` };
}

function execCommand(command, args) {
  if (!command) {
    console.error('vtz exec: no command specified');
    process.exit(1);
  }
  run(command, args, { env: binEnv() });
}

function runScript(scriptName, extraArgs) {
  if (!scriptName) {
    console.error('vtz run: no script name specified');
    process.exit(1);
  }
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
  } catch {
    console.error('vtz run: no package.json found in current directory');
    process.exit(1);
  }
  const scriptCmd = pkg.scripts?.[scriptName];
  if (!scriptCmd) {
    console.error(`vtz run: script not found: "${scriptName}"`);
    process.exit(1);
  }
  const fullCmd = extraArgs.length > 0 ? `${scriptCmd} ${extraArgs.join(' ')}` : scriptCmd;
  run(fullCmd, [], { shell: true, env: binEnv() });
}

let binary;
try {
  binary = getBinaryPath();
} catch {
  // Native binary not available — handle subcommands directly
  const [sub, ...rest] = process.argv.slice(2);
  if (sub === 'run') {
    runScript(rest[0], rest.slice(1));
  } else if (sub === 'exec') {
    execCommand(rest[0], rest.slice(1));
  } else {
    console.error(
      sub
        ? `vtz: native binary not available and '${sub}' has no fallback.\n`
        : 'vtz: native binary not available and no subcommand specified.\n',
    );
    console.error('Build the native runtime: cd native && cargo build --release');
    process.exit(1);
  }
}

run(binary, process.argv.slice(2));
