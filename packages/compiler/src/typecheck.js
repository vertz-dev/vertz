import { execFile, spawn } from 'node:child_process';
export function parseTscOutput(output) {
  const diagnostics = [];
  const pattern = /^(.+)\((\d+),(\d+)\): error TS(\d+): (.+)$/gm;
  let match = pattern.exec(output);
  while (match !== null) {
    diagnostics.push({
      file: match[1],
      line: Number.parseInt(match[2], 10),
      column: Number.parseInt(match[3], 10),
      code: Number.parseInt(match[4], 10),
      message: match[5],
    });
    match = pattern.exec(output);
  }
  return diagnostics;
}
export function parseWatchBlock(block) {
  const diagnostics = parseTscOutput(block);
  const foundMatch = /Found (\d+) error/.exec(block);
  const errorCount = foundMatch ? Number.parseInt(foundMatch[1], 10) : diagnostics.length;
  return {
    success: errorCount === 0,
    diagnostics,
  };
}
export async function* typecheckWatch(options = {}) {
  const proc =
    options.spawner?.() ??
    spawn(
      'tsc',
      ['--noEmit', '--watch', ...(options.tsconfigPath ? ['--project', options.tsconfigPath] : [])],
      {
        cwd: process.cwd(),
      },
    );
  const completionMarker = /Found \d+ error/;
  let buffer = '';
  const results = [];
  let resolve = null;
  let done = false;
  const onData = (chunk) => {
    buffer += chunk.toString();
    if (completionMarker.test(buffer)) {
      const result = parseWatchBlock(buffer);
      buffer = '';
      results.push(result);
      resolve?.();
    }
  };
  proc.stdout?.on('data', onData);
  proc.stderr?.on('data', onData);
  proc.on('close', () => {
    done = true;
    resolve?.();
  });
  try {
    while (!done || results.length > 0) {
      const next = results.shift();
      if (next) {
        yield next;
      } else if (!done) {
        await new Promise((r) => {
          resolve = r;
        });
      }
    }
  } finally {
    proc.kill();
  }
}
export async function typecheck(options = {}) {
  const args = ['--noEmit'];
  if (options.tsconfigPath) {
    args.push('--project', options.tsconfigPath);
  }
  return new Promise((resolve) => {
    execFile('tsc', args, { cwd: process.cwd() }, (error, stdout, stderr) => {
      const output = stdout + stderr;
      const diagnostics = parseTscOutput(output);
      resolve({
        success: !error,
        diagnostics,
      });
    });
  });
}
//# sourceMappingURL=typecheck.js.map
