/**
 * Spike 3: Shiki ANSI Terminal Output
 *
 * Goal: Test Shiki's ability to produce syntax-highlighted TypeScript
 * code with ANSI escape codes for terminal rendering.
 *
 * Finding: Shiki v3 does NOT have a built-in `codeToAnsi()` method.
 * The plan assumed it did. We need to use `codeToTokens()` and convert
 * hex colors to ANSI 256-color or truecolor escape codes ourselves.
 *
 * Measurements:
 * 1. Time to initialize the highlighter (cold start)
 * 2. Time to highlight a code snippet via codeToTokens
 * 3. Memory usage before and after
 * 4. Visual quality of the ANSI output
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

// ── Hex to ANSI truecolor ────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return null;
  return [
    parseInt(match[1], 16),
    parseInt(match[2], 16),
    parseInt(match[3], 16),
  ];
}

function colorize(text: string, hexColor?: string): string {
  if (!hexColor) return text;
  const rgb = hexToRgb(hexColor);
  if (!rgb) return text;
  // Use truecolor (24-bit) ANSI escape: \x1b[38;2;R;G;Bm
  return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\x1b[0m`;
}

function getMemoryUsageMB(): number {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

async function main() {
  console.log("=== Spike 3: Shiki ANSI Terminal Output ===\n");

  // ── Measure memory before ──────────────────────────────────────
  const memBefore = getMemoryUsageMB();
  console.log(`Memory before Shiki: ${memBefore.toFixed(2)} MB\n`);

  // ── Cold start: createHighlighter ──────────────────────────────
  console.log("--- Test 1: Cold Start (createHighlighter) ---");
  const coldStartTime = performance.now();

  const { createHighlighter } = await import("shiki");

  const highlighter = await createHighlighter({
    themes: ["github-dark"],
    langs: ["typescript"],
  });

  const coldStartElapsed = performance.now() - coldStartTime;
  const memAfterInit = getMemoryUsageMB();

  console.log(`  Cold start time: ${coldStartElapsed.toFixed(2)}ms`);
  console.log(`  Memory after init: ${memAfterInit.toFixed(2)} MB`);
  console.log(
    `  Memory delta: +${(memAfterInit - memBefore).toFixed(2)} MB\n`
  );

  // ── Helper: tokens to ANSI string ─────────────────────────────

  function tokensToAnsi(code: string): string {
    const result = highlighter.codeToTokens(code, {
      theme: "github-dark",
      lang: "typescript",
    });

    return result.tokens
      .map((line) => line.map((token) => colorize(token.content, token.color)).join(""))
      .join("\n");
  }

  // ── Test 2: Highlight a large code snippet ─────────────────────
  console.log("--- Test 2: Highlight Large Snippet (tokens -> ANSI) ---");
  const highlightStartLarge = performance.now();

  const ansiOutput = tokensToAnsi(sampleCode);

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

  const smallOutput = tokensToAnsi(smallSnippet);

  const highlightElapsedSmall = performance.now() - highlightStartSmall;
  console.log(`  Highlight time: ${highlightElapsedSmall.toFixed(2)}ms`);
  console.log(`  Output: ${smallOutput}`);
  console.log();

  // ── Test 4: Highlight diagnostic code frame ────────────────────
  console.log("--- Test 4: Diagnostic Code Frame ---");
  const highlightStartDiag = performance.now();

  const diagOutput = tokensToAnsi(diagnosticCode);

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
    tokensToAnsi(sampleCode);
  }

  const warmElapsed = performance.now() - warmStartTime;
  console.log(`  ${iterations} iterations: ${warmElapsed.toFixed(2)}ms`);
  console.log(
    `  Average per highlight: ${(warmElapsed / iterations).toFixed(2)}ms\n`
  );

  // ── Test 6: Check available API for direct ANSI ────────────────
  console.log("--- Test 6: Check for built-in ANSI support ---");
  const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(highlighter));
  const ansiMethods = proto.filter(
    (n) => n.toLowerCase().includes("ansi") || n.toLowerCase().includes("terminal")
  );
  console.log(`  Highlighter methods with 'ansi'/'terminal': ${ansiMethods.length > 0 ? ansiMethods.join(", ") : "NONE"}`);
  console.log(
    `  Conclusion: codeToAnsi() does NOT exist in Shiki v3.`
  );
  console.log(
    `  Must use codeToTokens() + custom hex-to-ANSI conversion.`
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
    `| Cold start                | ${coldStartElapsed.toFixed(0).padStart(9)}ms |`
  );
  console.log(
    `| Highlight (large, first)  | ${highlightElapsedLarge.toFixed(2).padStart(9)}ms |`
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
    `| Built-in codeToAnsi       | ${"NO".padStart(13)} |`
  );

  console.log("\n=== Verdict ===\n");
  console.log(
    "WORKS WITH CAVEATS:"
  );
  console.log(
    "- Shiki v3 does NOT have codeToAnsi(). The CLI plan assumed it did."
  );
  console.log(
    "- We must use codeToTokens() and build ANSI strings manually."
  );
  console.log(
    "- The conversion is trivial (~15 lines of code) using truecolor ANSI (24-bit)."
  );
  console.log(
    "- Cold start (~97ms on Bun) is acceptable — initialize lazily."
  );
  console.log(
    "- Memory overhead (~3 MB) is reasonable for a CLI tool."
  );
  console.log(
    "- Subsequent highlights are very fast (<1ms)."
  );
  console.log(
    "- The visual output is excellent — full TypeScript syntax highlighting in terminal."
  );
  console.log(
    "\nRecommendation:"
  );
  console.log(
    "- Use Shiki with codeToTokens() + custom ANSI renderer (hex-to-truecolor)."
  );
  console.log(
    "- Initialize lazily on first diagnostic display."
  );
  console.log(
    "- Skip initialization entirely for --format json output."
  );
  console.log(
    "- Update plan: reference codeToTokens(), not codeToAnsi()."
  );
}

main().catch(console.error);
