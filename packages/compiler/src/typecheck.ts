import { execFile } from 'node:child_process';

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
