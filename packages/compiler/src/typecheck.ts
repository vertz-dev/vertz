import type { ChildProcess } from 'node:child_process';
import { execFile, spawn } from 'node:child_process';

export interface TypecheckDiagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  code: number;
}

export interface TypecheckResult {
  success: boolean;
  diagnostics: TypecheckDiagnostic[];
}

export interface TypecheckOptions {
  tsconfigPath?: string;
}

export function parseTscOutput(output: string): TypecheckDiagnostic[] {
  const diagnostics: TypecheckDiagnostic[] = [];
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

export function parseWatchBlock(block: string): TypecheckResult {
  const diagnostics = parseTscOutput(block);
  const foundMatch = /Found (\d+) error/.exec(block);
  const errorCount = foundMatch ? Number.parseInt(foundMatch[1], 10) : diagnostics.length;
  return {
    success: errorCount === 0,
    diagnostics,
  };
}

export interface TypecheckWatchOptions extends TypecheckOptions {
  spawner?: () => ChildProcess;
}

export async function* typecheckWatch(
  options: TypecheckWatchOptions = {},
): AsyncGenerator<TypecheckResult> {
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

  const results: TypecheckResult[] = [];
  let resolve: (() => void) | null = null;
  let done = false;

  const onData = (chunk: Buffer) => {
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
        await new Promise<void>((r) => {
          resolve = r;
        });
      }
    }
  } finally {
    proc.kill();
  }
}

export async function typecheck(options: TypecheckOptions = {}): Promise<TypecheckResult> {
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
