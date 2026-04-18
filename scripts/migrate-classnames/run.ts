import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { rewriteSource } from './rewriter';

const TARGET_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.vertz', '__fixtures__']);

interface Summary {
  changedFiles: string[];
  totalRewrittenSites: number;
  totalTokensUsed: number;
  errors: Array<{ file: string; message: string }>;
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!st.isFile()) continue;
    if (!TARGET_EXTENSIONS.has(extname(name))) continue;
    out.push(full);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('usage: run.ts <path> [<path> ...]');
    process.exit(2);
  }

  const files: string[] = [];
  for (const arg of args) {
    const p = resolve(arg);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (st.isFile() && TARGET_EXTENSIONS.has(extname(p))) files.push(p);
  }

  const summary: Summary = {
    changedFiles: [],
    totalRewrittenSites: 0,
    totalTokensUsed: 0,
    errors: [],
  };

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    try {
      const result = rewriteSource(source, file);
      if (!result.changed) continue;
      writeFileSync(file, result.code);
      summary.changedFiles.push(file);
      summary.totalRewrittenSites += result.rewrittenSites;
      summary.totalTokensUsed += result.tokensUsed;
    } catch (err) {
      summary.errors.push({ file, message: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log(`scanned: ${files.length}`);
  console.log(`changed: ${summary.changedFiles.length}`);
  console.log(`rewritten sites: ${summary.totalRewrittenSites}`);
  console.log(`tokens used: ${summary.totalTokensUsed}`);
  if (summary.errors.length > 0) {
    console.error(`\nERRORS (${summary.errors.length}):`);
    for (const { file, message } of summary.errors) {
      console.error(`  ${file}: ${message}`);
    }
    process.exit(1);
  }
}

main();
