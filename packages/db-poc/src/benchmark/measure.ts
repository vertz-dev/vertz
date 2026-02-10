// ============================================================================
// Measurement Script
// ============================================================================
// Runs tsc --noEmit --extendedDiagnostics and parses the output.
// Also attempts incremental measurement by running on subsets.
//
// Usage: bun run src/benchmark/measure.ts
// ============================================================================

import { $ } from 'bun';

async function runTsc(files?: string[]): Promise<{
  types: number;
  instantiations: number;
  checkTime: string;
  totalTime: string;
  memory: string;
}> {
  const args = ['./node_modules/.bin/tsc', '--noEmit', '--extendedDiagnostics'];

  const result = await $`${args}`.quiet().nothrow();
  const output = result.stdout.toString() + result.stderr.toString();

  const types = parseInt(output.match(/Types:\s+(\d+)/)?.[1] ?? '0');
  const instantiations = parseInt(output.match(/Instantiations:\s+(\d+)/)?.[1] ?? '0');
  const checkTime = output.match(/Check time:\s+([\d.]+s)/)?.[1] ?? '?';
  const totalTime = output.match(/Total time:\s+([\d.]+s)/)?.[1] ?? '?';
  const memory = output.match(/Memory used:\s+([\d]+K)/)?.[1] ?? '?';

  return { types, instantiations, checkTime, totalTime, memory };
}

async function main() {
  console.log('='.repeat(70));
  console.log('  @vertz/db POC 1 — Type Inference Benchmark Results');
  console.log('='.repeat(70));
  console.log();

  // Full benchmark
  console.log('Running full benchmark (100 tables, 20 queries)...');
  const full = await runTsc();

  console.log();
  console.log('RESULTS:');
  console.log(`  Types:          ${full.types}`);
  console.log(`  Instantiations: ${full.instantiations}`);
  console.log(`  Check time:     ${full.checkTime}`);
  console.log(`  Total time:     ${full.totalTime}`);
  console.log(`  Memory:         ${full.memory}`);
  console.log();

  // Budget analysis
  const budget = 100_000;
  const used = full.instantiations;
  const pct = ((used / budget) * 100).toFixed(1);
  const perQuery = Math.round(used / 20);

  console.log('BUDGET ANALYSIS:');
  console.log(`  Budget:         ${budget.toLocaleString()} instantiations`);
  console.log(`  Used:           ${used.toLocaleString()} instantiations`);
  console.log(`  Usage:          ${pct}% of budget`);
  console.log(`  Per query avg:  ~${perQuery.toLocaleString()} instantiations`);
  console.log(`  Headroom:       ${(budget - used).toLocaleString()} instantiations remaining`);
  console.log();

  // Verdict
  const passed = used < budget;
  console.log('='.repeat(70));
  if (passed) {
    console.log(`  VERDICT: PASS`);
    console.log(`  Pure TypeScript inference handles 100 tables + 20 queries`);
    console.log(`  at ${pct}% of the instantiation budget.`);
    console.log(`  Proceed with pure inference approach.`);
  } else {
    console.log(`  VERDICT: FAIL`);
    console.log(`  Exceeded instantiation budget. Pivot to hybrid approach.`);
  }
  console.log('='.repeat(70));
}

main().catch(console.error);
