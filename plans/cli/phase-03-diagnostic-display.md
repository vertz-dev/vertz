# Phase 3: DiagnosticDisplay and Syntax Highlighting

**Prerequisites:** [Phase 2 -- Theme and Core UI Components](./phase-02-theme-and-ui-components.md)

**Goal:** Build the code frame renderer with Shiki-based syntax highlighting and the diagnostic summary component. This is the flagship visual feature of the CLI.

---

## What to Implement

1. **Syntax highlighter** -- `src/utils/syntax-highlight.ts` with lazy Shiki initialization and ANSI code generation
2. **DiagnosticDisplay component** -- `src/ui/components/DiagnosticDisplay.tsx` rendering compiler diagnostics as syntax-highlighted code frames
3. **DiagnosticSummary component** -- `src/ui/components/DiagnosticSummary.tsx` rendering aggregated error/warning counts

---

## Files to Create/Modify

### New Files

```
packages/cli/src/
├── utils/
│   └── syntax-highlight.ts
└── ui/
    └── components/
        ├── DiagnosticDisplay.tsx
        └── DiagnosticSummary.tsx
```

### Test Files

```
packages/cli/src/
├── utils/
│   └── __tests__/
│       └── syntax-highlight.test.ts
└── ui/
    └── __tests__/
        └── components/
            ├── diagnostic-display.test.tsx
            └── diagnostic-summary.test.tsx
```

---

## Expected Behaviors to Test

### Syntax Highlighter (`src/utils/__tests__/syntax-highlight.test.ts`)

- [ ] `getHighlighter()` returns a Shiki Highlighter instance
- [ ] `getHighlighter()` returns the same instance on subsequent calls (lazy singleton)
- [ ] `highlightCode(code)` returns a string containing ANSI escape codes
- [ ] `highlightCode(code)` highlights TypeScript syntax (keywords, strings, types)
- [ ] Handles empty string input without errors
- [ ] Handles multi-line code input

### DiagnosticDisplay Component (`src/ui/__tests__/components/diagnostic-display.test.tsx`)

- [ ] Renders the diagnostic error code (e.g., `VERTZ_MISSING_RESPONSE_SCHEMA`)
- [ ] Renders the diagnostic message
- [ ] Renders the file path with line and column
- [ ] Renders the code frame with line numbers
- [ ] Highlights the error span in the code frame (underline characters `^^^^^^^`)
- [ ] Renders the suggestion/hint line when present
- [ ] Uses error color for error severity diagnostics
- [ ] Uses warning color for warning severity diagnostics
- [ ] Uses info color for info severity diagnostics
- [ ] Uses box-drawing characters (`╭`, `│`, `╰`) for the code frame border
- [ ] Handles diagnostics without `sourceContext` gracefully (shows message only)
- [ ] Handles diagnostics without a suggestion gracefully (no hint line)

### DiagnosticSummary Component (`src/ui/__tests__/components/diagnostic-summary.test.tsx`)

- [ ] Renders "0 errors" when there are no errors
- [ ] Renders "1 error" (singular) for one error
- [ ] Renders "3 errors" (plural) for multiple errors
- [ ] Renders "2 warnings" alongside errors
- [ ] Renders only warnings when there are no errors
- [ ] Uses error color when there are errors
- [ ] Uses warning color when there are only warnings
- [ ] Uses success color when there are no errors or warnings

---

## Dependencies to Add

```json
{
  "dependencies": {
    "shiki": "^3.x"
  }
}
```

---

## Quality Gates

After each GREEN:

```bash
bunx biome check --write packages/cli/src/utils/ packages/cli/src/ui/
bun run typecheck
```

---

## Notes

- The `Diagnostic` type comes from `@vertz/compiler`. If the compiler is not ready, define a compatible local type for testing and mark it for replacement.
- Shiki initialization is async and can be slow (loading grammars). Tests should either use a pre-initialized instance or mock it.
- The code frame format should match the examples in the main design doc: error code + message header, `╭─ file:line:col`, numbered source lines with `│` border, underline span, `╰─ hint:`.
- Consider extracting a pure function `formatCodeFrame(diagnostic)` that produces plain text. The Ink component then adds colors. This makes the logic testable without Ink.
