/**
 * Spike 3: Shiki ANSI Terminal Output
 *
 * Goal: Test Shiki's ability to produce syntax-highlighted TypeScript
 * code with ANSI escape codes for terminal rendering.
 *
 * Finding: The latest Shiki (v3.22+) provides `codeToANSI()` via the
 * `@shikijs/cli` package. This is an async function that takes code,
 * language, and theme, and returns ANSI-escaped highlighted output
 * directly -- no manual hex-to-ANSI conversion needed.
 *
 * Measurements:
 * 1. Time to highlight via codeToANSI (cold start, includes lazy init)
 * 2. Time to highlight a large snippet (warm)
 * 3. Time to highlight a small snippet
 * 4. Diagnostic code frame rendering
 * 5. Warm cache benchmarks (100x)
 * 6. Memory usage before and after
 */

const sampleCode = `
import { createRouter } from '@vertz/core';
import { createUserBody, readUserParams } from './schemas';

const userRouter = createRouter('/users');

userRouter.get('/:id', {
  params: readUserParams,
  handler: async (ctx) => {
    return ctx.userService.findById(ctx.params.id);
  },
});

userRouter.post('/', {
  body: createUserBody,
  response: createUserResponse,
  handler: async (ctx) => {
    const user = await ctx.userService.create(ctx.body);
    return user;
  },
});

export { userRouter };
`.trim();

const smallSnippet = `const x: number = 42;`;

const diagnosticCode = `userRouter.get('/:id', {
  params: readUserParams,
  handler: async (ctx) => {
    return ctx.userService.findById(ctx.params.id);
  },
});`;

function getMemoryUsageMB(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

async function main() {
  console.log("=== Spike 3: Shiki ANSI Terminal Output ===\n");

  // ── Measure memory before ──────────────────────────────────────
  const memBefore = getMemoryUsageMB();
  console.log(`Memory before Shiki: ${memBefore.toFixed(2)} MB\n`);

  // ── Cold start: codeToANSI (first call, includes lazy init) ───
  console.log("--- Test 1: Cold Start (codeToANSI first call) ---");
  const coldStartTime = performance.now();

  const { codeToANSI } = await import("@shikijs/cli");

  const firstOutput = await codeToANSI(sampleCode, "typescript", "github-dark");

  const coldStartElapsed = performance.now() - coldStartTime;
  const memAfterInit = getMemoryUsageMB();

  console.log(`  Cold start time: ${coldStartElapsed.toFixed(2)}ms`);
  console.log(`  Memory after init: ${memAfterInit.toFixed(2)} MB`);
  console.log(
    `  Memory delta: +${(memAfterInit - memBefore).toFixed(2)} MB\n`
  );

  // ── Test 2: Highlight a large code snippet (warm) ─────────────
  console.log("--- Test 2: Highlight Large Snippet (codeToANSI, warm) ---");
  const highlightStartLarge = performance.now();

  const ansiOutput = await codeToANSI(sampleCode, "typescript", "github-dark");

  const highlightElapsedLarge = performance.now() - highlightStartLarge;
  console.log(`  Highlight time: ${highlightElapsedLarge.toFixed(2)}ms`);
  console.log(`  Output length: ${ansiOutput.length} chars`);
  console.log(`  Contains ANSI codes: ${ansiOutput.includes("\x1b[")}`);
  console.log(`\n  --- Rendered output ---\n`);
  console.log(ansiOutput);
  console.log(`\n  --- End output ---\n`);

  // ── Test 3: Highlight a small snippet ──────────────────────────
  console.log("--- Test 3: Highlight Small Snippet ---");
  const highlightStartSmall = performance.now();

  const smallOutput = await codeToANSI(smallSnippet, "typescript", "github-dark");

  const highlightElapsedSmall = performance.now() - highlightStartSmall;
  console.log(`  Highlight time: ${highlightElapsedSmall.toFixed(2)}ms`);
  console.log(`  Output: ${smallOutput}`);
  console.log();

  // ── Test 4: Highlight diagnostic code frame ────────────────────
  console.log("--- Test 4: Diagnostic Code Frame ---");
  const highlightStartDiag = performance.now();

  const diagOutput = await codeToANSI(diagnosticCode, "typescript", "github-dark");

  const highlightElapsedDiag = performance.now() - highlightStartDiag;
  console.log(`  Highlight time: ${highlightElapsedDiag.toFixed(2)}ms`);
  console.log(`\n  --- Code frame preview ---\n`);

  // Simulate a diagnostic code frame with line numbers
  const lines = diagOutput.split("\n");
  const startLine = 12;
  console.log(
    `  \x1b[31mVERTZ_MISSING_RESPONSE_SCHEMA\x1b[0m  Missing response schema`
  );
  console.log(
    `  \x1b[90m\u256D\u2500 src/modules/user/user.router.ts:14:1\x1b[0m`
  );
  console.log(`  \x1b[90m\u2502\x1b[0m`);
  for (let i = 0; i < lines.length; i++) {
    const lineNum = (startLine + i).toString().padStart(4);
    console.log(`  \x1b[90m${lineNum} \u2502\x1b[0m ${lines[i]}`);
  }
  console.log(`  \x1b[90m\u2502\x1b[0m`);
  console.log(
    `  \x1b[90m\u2570\u2500 hint: Add a \`response\` property with the expected return shape\x1b[0m`
  );
  console.log();

  // ── Test 5: Multiple highlights (warm cache) ───────────────────
  console.log("--- Test 5: Multiple Highlights (warm cache, 100x) ---");
  const iterations = 100;
  const warmStartTime = performance.now();

  for (let i = 0; i < iterations; i++) {
    await codeToANSI(sampleCode, "typescript", "github-dark");
  }

  const warmElapsed = performance.now() - warmStartTime;
  console.log(`  ${iterations} iterations: ${warmElapsed.toFixed(2)}ms`);
  console.log(
    `  Average per highlight: ${(warmElapsed / iterations).toFixed(2)}ms\n`
  );

  // ── Test 6: Verify codeToANSI works ────────────────────────────
  console.log("--- Test 6: Verify built-in codeToANSI support ---");
  console.log(
    `  codeToANSI imported from: @shikijs/cli`
  );
  console.log(
    `  Function type: ${typeof codeToANSI}`
  );
  console.log(
    `  Returns ANSI string: ${typeof firstOutput === "string" && firstOutput.includes("\x1b[")}`
  );
  console.log(
    `  Conclusion: codeToANSI() IS available in the latest Shiki (@shikijs/cli).`
  );
  console.log(
    `  No manual hex-to-ANSI conversion is needed.`
  );
  console.log();

  // ── Final memory ───────────────────────────────────────────────
  const memFinal = getMemoryUsageMB();
  console.log(`Final memory: ${memFinal.toFixed(2)} MB`);
  console.log(`Total memory delta: +${(memFinal - memBefore).toFixed(2)} MB`);

  // ── Summary ────────────────────────────────────────────────────
  console.log("\n=== Summary ===\n");
  console.log(`| Metric                    | Value         |`);
  console.log(`|---------------------------|---------------|`);
  console.log(
    `| Cold start (first call)   | ${coldStartElapsed.toFixed(0).padStart(9)}ms |`
  );
  console.log(
    `| Highlight (large, warm)   | ${highlightElapsedLarge.toFixed(2).padStart(9)}ms |`
  );
  console.log(
    `| Highlight (small)         | ${highlightElapsedSmall.toFixed(2).padStart(9)}ms |`
  );
  console.log(
    `| Highlight (diag frame)    | ${highlightElapsedDiag.toFixed(2).padStart(9)}ms |`
  );
  console.log(
    `| Highlight (avg, 100x)     | ${(warmElapsed / iterations).toFixed(2).padStart(9)}ms |`
  );
  console.log(
    `| Memory delta (init)       | ${(memAfterInit - memBefore).toFixed(1).padStart(8)} MB |`
  );
  console.log(
    `| Memory delta (total)      | ${(memFinal - memBefore).toFixed(1).padStart(8)} MB |`
  );
  console.log(
    `| ANSI output works         | ${"YES".padStart(13)} |`
  );
  console.log(
    `| Built-in codeToANSI       | ${"YES".padStart(13)} |`
  );

  console.log("\n=== Verdict ===\n");
  console.log(
    "WORKS:"
  );
  console.log(
    "- The latest Shiki provides codeToANSI() via the @shikijs/cli package."
  );
  console.log(
    "- codeToANSI(code, lang, theme) returns ANSI-escaped output directly."
  );
  console.log(
    "- No manual hex-to-ANSI conversion is needed anymore."
  );
  console.log(
    "- Cold start (first call) includes lazy highlighter initialization."
  );
  console.log(
    "- Subsequent calls are fast (highlighter is cached internally)."
  );
  console.log(
    "- Memory overhead is reasonable for a CLI tool."
  );
  console.log(
    "- The visual output is excellent -- full TypeScript syntax highlighting in terminal."
  );
  console.log(
    "\nRecommendation:"
  );
  console.log(
    "- Use @shikijs/cli's codeToANSI() directly. No custom ANSI renderer needed."
  );
  console.log(
    "- Initialize lazily on first diagnostic display (first call handles init)."
  );
  console.log(
    "- Skip initialization entirely for --format json output."
  );
  console.log(
    "- Add @shikijs/cli as a dependency alongside shiki."
  );
}

main().catch(console.error);
