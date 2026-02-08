/**
 * Spike 2: Config Loading with jiti on Bun
 *
 * Goal: Test different approaches for loading a TypeScript config file
 * at runtime. The plan calls for `jiti`, but Bun has native TS support.
 *
 * Approaches tested:
 * 1. jiti (the planned approach — same as Vite, Nuxt, Astro)
 * 2. Dynamic import() with Bun's native TS support
 * 3. Direct require-style (Bun supports .ts natively)
 *
 * For each approach, measure:
 * - Does it work?
 * - Load time
 * - Does it handle `export default defineConfig(...)` pattern?
 * - Does it handle TypeScript types?
 */

import { resolve } from "node:path";

const configPath = resolve(import.meta.dir, "sample-vertz.config.ts");

console.log("=== Spike 2: Config Loading ===\n");
console.log(`Config file: ${configPath}\n`);

// ── Approach 1: jiti ───────────────────────────────────────────────

async function testJiti() {
  console.log("--- Approach 1: jiti ---");
  const startTime = performance.now();

  try {
    const { createJiti } = await import("jiti");
    const jiti = createJiti(import.meta.url);
    const loaded = await jiti.import(configPath);
    const config = (loaded as { default?: unknown }).default ?? loaded;

    const elapsed = (performance.now() - startTime).toFixed(2);
    console.log(`  Status: SUCCESS`);
    console.log(`  Load time: ${elapsed}ms`);
    console.log(`  Config:`, JSON.stringify(config, null, 4));
    console.log(`  Type of result: ${typeof config}`);
    console.log(
      `  Has expected fields: strict=${(config as any).strict}, port=${(config as any).dev?.port}`
    );
    return { works: true, time: elapsed };
  } catch (err) {
    const elapsed = (performance.now() - startTime).toFixed(2);
    console.log(`  Status: FAILED`);
    console.log(`  Load time: ${elapsed}ms`);
    console.log(`  Error:`, (err as Error).message);
    return { works: false, time: elapsed, error: (err as Error).message };
  }
}

// ── Approach 2: Dynamic import() ──────────────────────────────────

async function testDynamicImport() {
  console.log("\n--- Approach 2: Dynamic import() (Bun native TS) ---");
  const startTime = performance.now();

  try {
    const loaded = await import(configPath);
    const config = loaded.default ?? loaded;

    const elapsed = (performance.now() - startTime).toFixed(2);
    console.log(`  Status: SUCCESS`);
    console.log(`  Load time: ${elapsed}ms`);
    console.log(`  Config:`, JSON.stringify(config, null, 4));
    console.log(`  Type of result: ${typeof config}`);
    console.log(
      `  Has expected fields: strict=${config.strict}, port=${config.dev?.port}`
    );
    return { works: true, time: elapsed };
  } catch (err) {
    const elapsed = (performance.now() - startTime).toFixed(2);
    console.log(`  Status: FAILED`);
    console.log(`  Load time: ${elapsed}ms`);
    console.log(`  Error:`, (err as Error).message);
    return { works: false, time: elapsed, error: (err as Error).message };
  }
}

// ── Approach 3: Bun.file + eval (not recommended, but testing) ────

async function testBunFile() {
  console.log(
    "\n--- Approach 3: Bun.file read (checking if Bun API exists) ---"
  );
  const startTime = performance.now();

  try {
    if (typeof Bun === "undefined") {
      console.log("  Status: SKIPPED (not running in Bun)");
      return { works: false, time: "0", error: "Not Bun runtime" };
    }

    // Bun can import .ts files directly, so let's just confirm it
    // The dynamic import approach (Approach 2) already tests this
    console.log(
      "  Bun is available. Dynamic import() (Approach 2) covers this."
    );
    console.log(
      "  Bun.file() reads raw text — not useful for config loading."
    );
    const elapsed = (performance.now() - startTime).toFixed(2);
    console.log(`  Conclusion: Use dynamic import() on Bun, jiti on Node.`);
    return { works: true, time: elapsed };
  } catch (err) {
    const elapsed = (performance.now() - startTime).toFixed(2);
    console.log(`  Status: FAILED`);
    console.log(`  Error:`, (err as Error).message);
    return { works: false, time: elapsed, error: (err as Error).message };
  }
}

// ── Run all approaches ────────────────────────────────────────────

async function main() {
  const results: Record<string, any> = {};

  results.jiti = await testJiti();
  results.dynamicImport = await testDynamicImport();
  results.bunFile = await testBunFile();

  console.log("\n=== Summary ===\n");
  console.log("| Approach        | Works | Time     | Notes |");
  console.log("|-----------------|-------|----------|-------|");

  for (const [name, result] of Object.entries(results)) {
    const works = result.works ? "YES" : "NO";
    const notes = result.error || "OK";
    console.log(
      `| ${name.padEnd(15)} | ${works.padEnd(5)} | ${result.time.padStart(6)}ms | ${notes} |`
    );
  }

  console.log("\n=== Recommendation ===\n");
  console.log(
    "For Bun: Use dynamic import() — it's native, zero-dependency, and fast."
  );
  console.log(
    "For Node: Use jiti — it handles TypeScript config without requiring"
  );
  console.log("the user to have tsx or ts-node installed globally.");
  console.log(
    "Strategy: Runtime-detect Bun vs Node, use import() on Bun, jiti on Node."
  );
}

main().catch(console.error);
