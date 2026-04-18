# Signal-compiled `let` variables cause incorrect type narrowing

**Status:** Draft (Rev 2 — addressing DX, Product, and Technical review feedback)
**Issue:** #2779
**Tier:** Tier 2 (breaks a documented idiom in `guides/ui/reactivity.mdx`; fix touches user-facing error surface)
**Date:** 2026-04-18

## Revision History

- **Rev 1 (2026-04-18)** — Initial proposal: `no-narrowing-let` oxlint rule + autofix to `let x = v as T` + docs section.
- **Rev 2 (2026-04-18)** — Addresses three adversarial reviews:
  - Autofix form changed from `let x = v as T` to **`let x: T = v as T`** (hybrid: annotation on variable **and** on initializer). Preserves declarative typing idiom, reads like a widening hint, matches the DX counter-proposal. Verified against `tsc@5.5.4` to prevent narrowing.
  - Operator-precedence–safe initializer rewrite: allowlist of init node types safe to emit bare; others wrapped in parens.
  - Prior-art telemetry added: **17 real occurrences** of the trap pattern in our own packages/examples.
  - Scope framing: new "Family analysis" section — is this the first of many TS-vs-Vertz-compiler traps, and is a one-off rule the right precedent?
  - Tier classification added.
  - Test-helper plan corrected: `lintFixture` is the existing harness; this PR adds `lintFixtureWithFix` (spawn `oxlint --fix`, read file back) and a minimal `tscFixture` helper.
  - `typeAnnotation` runtime vs. d.ts mismatch documented with `@ts-expect-error`.
  - Component-body heuristic replaced with a strict, implementable rule: walk ancestors to nearest enclosing function; rule fires only if that function's parent is `Program` / `ExportNamedDeclaration` / `ExportDefaultDeclaration`.
  - `meta.fixable: 'code'` added to the rule skeleton.
  - `.tsx`-only gating: early-return empty visitor on non-`.tsx` filenames (not gate at report site).
  - Edge cases for multi-declarator, destructuring, `as const`, and `SequenceExpression` initializers addressed.
  - Lint message rewritten to include *why* (not just *what*).
  - Existing-docs audit: `reactivity.mdx` has `let items: CartItem[] = []`-style examples that the rule would flag — audit and update in phase 1.
  - Phase 2 collapsed into Phase 1 (autofix API verified on oxlint 1.57.0).

## Problem

Vertz's "just write `let`" idiom for reactive state collides with TypeScript's control-flow narrowing. When a user declares a union-typed `let` in a component and mutates it only inside a callback (the typical pattern), TypeScript narrows the variable to its initializer's literal type and flags any comparison against a *different* member of the union as `TS2367`:

```tsx
export function SplitView() {
  let panel: 'code' | 'spec' = 'code';
  // TS narrows panel → 'code' (literal), then flags:
  //   TS2367: This comparison appears to be unintentional because
  //   the types '"code"' and '"spec"' have no overlap.
  const isSpec = panel === 'spec';

  return (
    <button onClick={() => { panel = 'spec'; }}>Switch</button>
  );
}
```

### This is standard TypeScript behavior, not a compiler bug

Verified against vanilla `tsc@5.5.4` (no Vertz compiler involved): the same `.ts` source (no JSX) emits `TS2367` on the comparison. TypeScript's control-flow narrowing assigns the narrowed type from the initializer and does not widen back on writes inside closures.

**The Vertz native compiler cannot fix this.** TypeScript's type checker runs against the original `.tsx` source — the `let`→`signal()` transform happens in a separate pass that TypeScript never sees. We can't change what `tsc` reads.

### Why it's painful in Vertz (with numbers)

A grep of union-annotated `let` declarations in `.tsx` files in this monorepo finds **17 occurrences** across `packages/ui-primitives`, `packages/landing`, `sites/dev-orchestrator`, `examples/linear`, `examples/task-manager`, and `native/vtz/tests/fixtures/linear-clone-app`. Representative:

```
packages/ui-primitives/src/tooltip/tooltip.tsx:63
  let showTimeout: ReturnType<typeof setTimeout> | null = null;
examples/task-manager/src/pages/task-list.tsx:44
  let statusFilter: TaskStatus | 'all' = 'all';
sites/dev-orchestrator/src/pages/agent-detail.tsx:71
  let editedPrompt: string | undefined = undefined;
```

Most of these don't currently *hit* the TS2367 trap (they don't compare against another union member in the outer scope), but any of them would the moment a user adds a comparison. External users arriving in 2026 writing state-machine-style `'idle' | 'loading' | 'error'` variables will hit it immediately — this is the canonical FE UI pattern.

### Why it's painful in Vertz (qualitative)

1. **Vertz's idiom is `let` for reactive state** — taught as "the one obvious way" in `guides/ui/reactivity.mdx`.
2. **Mutation-in-closure is the common case** — button handlers, effects, event listeners all mutate via closure.
3. **The error message points the wrong direction** — TS2367 says the comparison is "unintentional". The comparison is the user's intent; the narrowing is the surprise.
4. **"If it builds, it works" is violated today.** A user following the documented idiom gets a TS error with no framework-level guidance. This is a Tier 2 issue.

After this change:
- A user who writes `let panel: 'code' | 'spec' = 'code'` in a component function gets an **oxlint warning** (`vertz-rules/no-narrowing-let`) with an **autofix** that rewrites to `let panel: 'code' | 'spec' = 'code' as 'code' | 'spec'`.
- A new docs section ("Union-typed state") under `guides/ui/reactivity` explains why, with the recommended pattern.
- Zero new runtime API, zero new imports, zero compiler changes. One new oxlint rule.

## Family Analysis — Is This the First of Many?

**The product reviewer asked whether this is a symptom of a broader "TS vs. compiler transform" class of issues and whether one-off rules are the right precedent.** Four candidates considered:

| Transform                         | TS-visible trap?                                                                                 | Rule warranted?                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `let` → `signal()` (this issue)   | **Yes** — narrowing on union-typed `let` with closure mutation                                   | **Yes** — affects every component with state-machine state                               |
| `const derived = x * 2` → `computed()` | No — TS sees plain `const`; no narrowing relevant (value is assigned once)                   | No                                                                                       |
| Reactive JSX children (`{x}`)     | No — TS sees expression; reactivity is a runtime/render concern                                  | No                                                                                       |
| Getter-based props                | Maybe — if a parent passes `count * 2` and child expects a stable value. Not narrowing-related.  | Out of scope for this rule; separate concern (stability, not types)                      |

**Conclusion:** `let` → `signal()` is the only transform whose runtime semantics (assignment-in-closure widens the type) contradict TS's default behavior. This is **not** the first of a family — it's the one place where our transform diverges enough from TS's narrowing model that users notice. Precedent cost of adding a 7th `vertz-rules` rule is accepted with no expectation of rules #8/#9 following the same pattern.

## Tier Classification

**Tier 2** per `.claude/rules/policies.md`:
- Public API surface affected: user-facing error messages and the documented "just write `let`" idiom.
- Needs tech-lead validation of the approach before implementation (user sign-off requested after the three agent sign-offs).
- Docs must be updated alongside the rule.

## Design Goals

1. **Zero new runtime APIs.** No `state()` helper, no new import, no new type. The `let` idiom stays unchanged.
2. **Autofix preserves the TS idiom of annotation-on-variable.** The output looks like something a TS veteran would write.
3. **Detect the trap, don't let users fall into it silently.**
4. **Explain the *why*.** Docs cover the TS behavior, the fix, and when NOT to apply it.
5. **LLM-friendly.** Lint message contains the fix verbatim; the autofix is mechanical.

## API Surface

No new runtime API. Three additions:

### 1. `oxlint` rule — `vertz-rules/no-narrowing-let`

Detects `let` variable declarations in **`.tsx`** files whose type annotation is a union type, **inside the top-level function of the file** (which is the component). Reports with an autofix that adds an `as <annotation>` cast to the initializer while keeping the variable annotation.

**Trigger:**

- File extension: `.tsx` (early-return empty visitor object otherwise).
- Declaration keyword: `let` (not `const`, not `var`).
- Identifier pattern: a single `BindingIdentifier` (not `ObjectPattern` / `ArrayPattern` — see Non-Goals).
- Annotation: `TSTypeAnnotation` whose `typeAnnotation.type === 'TSUnionType'`.
- Initializer: present (any expression).
- Scope: nearest enclosing function of the `VariableDeclarator` is the file's top-level function. Walk `node.parent` until hitting a `FunctionDeclaration` / `FunctionExpression` / `ArrowFunctionExpression` / `MethodDefinition`, then verify that function's parent is `Program`, `ExportNamedDeclaration`, or `ExportDefaultDeclaration`.

**Autofix (form B: annotation-on-variable + annotation-on-initializer):**

```tsx
// Before (reported):
let panel: 'code' | 'spec' = 'code';
let status: 'idle' | 'loading' | 'error' = 'idle';
let selectedId: string | null = null;
let items: CartItem[] = [];         // not a union — NOT flagged (see Non-Goals)

// After (autofix):
let panel: 'code' | 'spec' = 'code' as 'code' | 'spec';
let status: 'idle' | 'loading' | 'error' = 'idle' as 'idle' | 'loading' | 'error';
let selectedId: string | null = null as string | null;
```

**Why form B and not form A (`let x = v as T`)?** DX review flagged that form A reads like a "trust me" type assertion, not a widening hint, and conflicts with common TS style-guide advice to prefer `let x: T = v`. Form B keeps the annotation on the variable — matching TS idioms and MEMORY feedback `feedback-docs-developer-facing-types` — and uses the value-side cast purely as a widening marker. Both forms prevent narrowing (verified against `tsc@5.5.4`); form B is clearer.

**Precedence handling.** `as` has low operator precedence, so for initializers that aren't simple, the cast may bind wrong. The rule uses an allowlist of "cast-safe" init node types (no parens needed):

```
Literal, TemplateLiteral, Identifier, ThisExpression,
MemberExpression, CallExpression, NewExpression,
ObjectExpression, ArrayExpression, RegExpLiteral,
ArrowFunctionExpression, FunctionExpression,
TSAsExpression, TSTypeAssertion, TSNonNullExpression,
TSSatisfiesExpression
```

Anything else (`SequenceExpression`, `ConditionalExpression`, `AssignmentExpression`, `YieldExpression`, `LogicalExpression`, `BinaryExpression`, etc.) is wrapped in parens by the autofix:

```tsx
// SequenceExpression initializer — parens required:
let x: 'a' | 'b' = (sideEffect(), 'a');
// Autofix:
let x: 'a' | 'b' = ((sideEffect(), 'a')) as 'a' | 'b';
```

The outer parens look awkward but the alternative (breaking the code) is worse. A stylistic follow-up rule could clean them up; not in scope here.

**`as const` de-duplication.** If the initializer is already `TSAsExpression` with `TSConstType` (`'code' as const`), the autofix replaces the `const` cast with the union cast (`'code' as 'code' | 'spec'`) rather than producing `'code' as const as 'code' | 'spec'`. Other `TSAsExpression` initializers (e.g., `someValue as SomeType`) are left alone and the widening cast is appended, producing `someValue as SomeType as T`. The existing `no-double-cast` rule matches only `as unknown as T`, so these chained casts do NOT trip it; they compile cleanly and narrowing is resolved.

**Multi-declarator declarations.** For `let a: T1 = x, b: T2 = y;`, the rule fires once per `VariableDeclarator` and replaces the declarator nodes individually. Result: `let a: T1 = x as T1, b: T2 = y as T2;`. Each declarator is a separate report, each with its own autofix.

**Lint message:**

```
Union-typed `let` in a Vertz component narrows to the initializer's type, which
can break equality checks against other union members (TS2367). Keep the
annotation on the variable and cast the initializer to the full union:

  - let panel: 'code' | 'spec' = 'code';
  + let panel: 'code' | 'spec' = 'code' as 'code' | 'spec';

TypeScript applies control-flow narrowing after the initializer. Closure
mutations don't widen the type back, so reads in the outer scope see only the
narrowed type. Casting the initializer tells TS to use the full union from the
start.

See https://vertz.dev/guides/ui/reactivity#union-typed-state
```

**Severity:** `warn` (matches existing `vertz-rules`). Not an error — users can opt out per-occurrence with `// oxlint-disable-next-line vertz-rules/no-narrowing-let`.

**Rule skeleton (illustrative; not final source):**

```js
import { extname } from 'node:path';

const noNarrowingLet = {
  meta: { fixable: 'code' },
  create(context) {
    if (extname(context.filename).toLowerCase() !== '.tsx') return {};
    return {
      VariableDeclarator(node) {
        // 1. Parent is `let` VariableDeclaration
        // 2. `node.id.typeAnnotation?.typeAnnotation.type === 'TSUnionType'`
        //    (runtime has typeAnnotation; d.ts types it as `null` — see Unknowns #2)
        // 3. Enclosing function's parent is Program / Export{Named,Default}Declaration
        // 4. Initializer present
        // Report with fix:
        //   - range = node.range (the declarator, not the declaration)
        //   - replace text = `${idText}: ${annotText} = ${maybeParens(initText)} as ${annotText}`
      },
    };
  },
};
```

### 2. Docs section — `guides/ui/reactivity` § "Union-typed state"

Insert after "State with `let`" (before "Derived values with `const`"). Roughly:

```mdx
### Union-typed state

When a `let` variable has a union type, cast the initializer to the full union
so TypeScript doesn't narrow it:

```tsx
// ✅ Recommended — the full union is preserved at every read
let panel: 'code' | 'spec' = 'code' as 'code' | 'spec';
let status: 'idle' | 'loading' | 'error' = 'idle' as 'idle' | 'loading' | 'error';
let selectedId: string | null = null as string | null;

// ⚠ Flagged by the `no-narrowing-let` lint rule
let panel: 'code' | 'spec' = 'code';
```

TypeScript applies control-flow narrowing to `let` declarations: the initializer
(`'code'`) narrows the type to its literal, so comparisons against `'spec'`
fail with `TS2367`. Reassigning inside a callback (the typical component
pattern) doesn't widen the type back, because TS can't prove the callback runs
before the comparison.

Casting the initializer (`as 'code' | 'spec'`) gives TS the full union up
front — there's nothing to narrow — and reads see the full type at every point.

Run `vtz run lint:fix` to apply the rewrite across your codebase.
```

Also: **audit existing `let x: T = v` examples in `reactivity.mdx`** that the rule would flag (e.g., `let statusFilter: TaskStatus | 'all' = 'all'`-style in other doc pages). Update in the same phase.

### 3. `.oxlintrc.json` — register the new rule

```jsonc
{
  "rules": {
    "vertz-rules/no-double-cast": "warn",
    "vertz-rules/no-internals-import": "warn",
    "vertz-rules/no-throw-plain-error": "warn",
    "vertz-rules/no-wrong-effect": "warn",
    "vertz-rules/no-body-jsx": "warn",
    "vertz-rules/no-try-catch-result": "warn",
    "vertz-rules/no-narrowing-let": "warn"   // ← new
  }
}
```

## Manifesto Alignment

- **"One obvious way."** The idiom is still `let` for reactive state. The lint rule surfaces the TS-level narrowing trap and autofixes to a form that preserves the annotation on the variable — same shape, slightly more explicit on the initializer. Not a second idiom; a more robust spelling of the same one.
- **"If it builds, it works."** Today's idiomatic Vertz code **doesn't build** when paired with union annotations. After this change, `vtz run lint` (and `lint:fix` in CI) catch and fix the pattern before `tsc` runs.
- **"LLM-native."** An LLM writing Vertz code hits TS2367, reads the lint message (or follows the docs link), applies the value-side cast, and ships. No new API to learn.
- **"Type safety wins."** The autofix preserves full type information (`'code' | 'spec'`) at every read, instead of lossy narrowing.

**Tradeoffs accepted:**

- The fixed form `let x: T = v as T` repeats the type. For unions of 2-3 members this is trivial; for deeply nested types (`Array<{ a: number; b: 'x' | 'y' }>`) it's verbose but still correct. Alternatives ( `state<T>()` helper, TS plugin) are worse. Verbosity is accepted.
- Adds a 7th `vertz-rules` rule. Precedent cost of 20 LoC is low; the family analysis above shows this is unlikely to multiply.
- The `SequenceExpression` corner case emits doubled parens. Acceptable — that pattern is rare.

## Non-Goals

- **Not "fix TypeScript."** Narrowing is standard, documented TS behavior.
- **Not introducing a `state<T>()` helper.** Forks the `let` idiom, requires an import per file.
- **Not autofixing `.ts` files.** Only `.tsx` gets the signal transform; in `.ts` the user may intentionally want narrowing.
- **Not rewriting user source inside the native compiler.** TS sees the source, not compiler output.
- **Not flagging `const x: UnionType = literal`.** `const` narrowing is intentional.
- **Not flagging `let x: T[] = []` or other non-union annotations.** The trap is specific to unions.
- **Not flagging destructuring patterns** (`let { a }: { a: 'x' | 'y' } = obj`). These are rare in reactive state; complex autofix; the trap is less common because destructured bindings are usually `const`. Deferred.
- **Not flagging `let` at module scope or inside nested functions.** Only top-level of the component function — matches the signal transform's scope.
- **Not a TypeScript Language Service plugin.** Fragile IDE integration, opaque tooling.
- **Not a compiler-level diagnostic.** Same build-time firing as lint, doesn't help the IDE's live TS2367.
- **Not checking that union members are "useful" relative to the initializer.** The autofix is always semantically equivalent regardless of initializer shape.
- **Not adding telemetry / phone-home** on how often users trip the rule.

## Unknowns

1. **Does oxlint's JS plugin `fix` API work in the installed version?**
   - **Resolved.** oxlint 1.57.0 is installed; the Technical reviewer verified with a live POC that `meta.fixable: 'code'` + `context.report({ fix: fixer => ... })` works. Phase 2 (autofix as a follow-up) collapsed back into Phase 1.

2. **Runtime vs. d.ts mismatch for `typeAnnotation` on `BindingIdentifier`.**
   - **Resolved with note.** `node_modules/oxlint/dist/plugins-dev.d.ts:1166` types `BindingIdentifier.typeAnnotation?: null`, but oxlint 1.57.0 populates the field at runtime with the actual `TSTypeAnnotation`. Rule implementation will use `// @ts-expect-error` or `as unknown as` cast with a comment explaining the d.ts drift. An upstream issue may be filed but is not a dependency for this PR.

3. **Component-body heuristic correctness.**
   - **Resolved.** Walk ancestors to nearest enclosing function; fire only if that function's parent is `Program` / `ExportNamedDeclaration` / `ExportDefaultDeclaration`. False positives are possible for non-component top-level functions (e.g., module-scope helpers), but these typically don't use reactive-style `let`, and the autofix is always semantically correct even when applied out of scope.

4. **Test harness: `lintFixture` exists; `runOxlintFix` / `typecheck` do not.**
   - **Resolved.** Phase 1 explicitly includes building a `lintFixtureWithFix` helper (spawn `oxlint --fix` on a temp file, read content back) and a small `tscFixture` helper (spawn `tsc --noEmit` with an in-memory tsconfig). Both mirror the existing `lintFixture` pattern.

5. **Interaction with `no-double-cast`.**
   - **Resolved.** No conflict. `no-double-cast` flags ONLY `as unknown as T` (double cast via `unknown`). The autofix emits single-cast `as T` for most cases; for a `let x: T = v as OtherT;` initializer, it produces `v as OtherT as T`, which does NOT match the `as unknown as T` pattern and therefore does not trip `no-double-cast`. Both rules coexist cleanly.

6. **`context.filename` on Windows.**
   - **Resolved.** Use `path.extname(context.filename).toLowerCase() === '.tsx'` rather than `endsWith('.tsx')`.

## POC Results

The Technical reviewer performed a live POC on oxlint 1.57.0:

- `meta.fixable: 'code'` + `context.report({ fix })` — **works**.
- `BindingIdentifier.typeAnnotation` — **present at runtime**, absent in `.d.ts`.
- `context.filename` — available, absolute path.
- Autofix application via `oxlint --fix` — **works**.

Risks noted: `SequenceExpression` init rewrite corrupts without parens (handled in Rev 2); ancestor-walk required (handled); multi-declarator replacement must target declarator not declaration (handled).

## Type Flow Map

No generics. The change is lint-level + docs.

```
User writes (.tsx, top-level component body):
  let panel: 'code' | 'spec' = 'code';
            └────────┬─────────┘    └──┬──┘
            TSUnionType annot    Literal 'code'

no-narrowing-let rule (AST match):
  1. context.filename endsWith .tsx ............ (else: return {})
  2. VariableDeclaration.kind === 'let'
  3. VariableDeclarator.id is BindingIdentifier (not destructuring)
  4. VariableDeclarator.id.typeAnnotation.typeAnnotation.type === 'TSUnionType'
  5. VariableDeclarator.init != null
  6. Walk VariableDeclarator.parent → nearest fn → its parent ∈
       { Program, ExportNamedDeclaration, ExportDefaultDeclaration }
  → Report with fix:
       range = VariableDeclarator.range
       replace = `${id}: ${annotText} = ${maybeParens(initText, initNode)} as ${annotText}`
       (if initNode is TSAsExpression with TSConstType: strip the `as const`)

User runs `vtz run lint:fix`:
  let panel: 'code' | 'spec' = 'code' as 'code' | 'spec';

TypeScript sees:
  let panel: 'code' | 'spec' = 'code' as 'code' | 'spec';
            └────────┬─────────┘    └────────┬──────────┘
              Variable annot       Init typed as full union
            → TS does not narrow → TS2367 never fires
```

## E2E Acceptance Test

Located in `oxlint-plugins/__tests__/vertz-rules.test.ts` (extends the existing file). Uses the existing `lintFixture(src, rules, filename)` helper for report-only assertions and a new `lintFixtureWithFix(src, rules, filename)` helper (built in Phase 1) for autofix assertions. One test uses a minimal `tscFixture(src, filename)` helper (also built in Phase 1).

```ts
describe('Feature: no-narrowing-let oxlint rule', () => {
  describe('Given a .tsx component with a union-typed let', () => {
    describe('When oxlint runs', () => {
      it('then reports the declaration', async () => {
        const src = `
          export function Panel() {
            let panel: 'code' | 'spec' = 'code';
            return <button onClick={() => { panel = 'spec'; }}>{panel}</button>;
          }
        `;
        const out = await lintFixture(
          src,
          { 'vertz-rules/no-narrowing-let': 'warn' },
          'panel.tsx',
        );
        expect(out).toMatch(/no-narrowing-let/);
        expect(out).toMatch(/as 'code' \| 'spec'/); // suggestion is in the message
      });
    });

    describe('When oxlint --fix runs', () => {
      it('then rewrites to the hybrid-annotation form', async () => {
        const src = `
          export function Panel() {
            let panel: 'code' | 'spec' = 'code';
            return <button onClick={() => { panel = 'spec'; }}>{panel}</button>;
          }
        `;
        const fixed = await lintFixtureWithFix(
          src,
          { 'vertz-rules/no-narrowing-let': 'warn' },
          'panel.tsx',
        );
        expect(fixed).toContain(`let panel: 'code' | 'spec' = 'code' as 'code' | 'spec';`);
      });
    });
  });

  describe('Given the autofix output', () => {
    it('then tsc produces no TS2367 on an equality check', async () => {
      const src = `
        export function Panel() {
          let panel: 'code' | 'spec' = 'code' as 'code' | 'spec';
          const isSpec = panel === 'spec';
          const setup = () => { panel = 'spec'; };
          return { isSpec, setup };
        }
      `;
      const diagnostics = await tscFixture(src, 'panel.tsx');
      expect(diagnostics.filter((d) => d.code === 2367)).toEqual([]);
    });
  });

  describe('Given a .ts file', () => {
    it('then the rule does NOT fire', async () => {
      const src = `
        export function pick(): 'code' | 'spec' {
          let panel: 'code' | 'spec' = 'code';
          return panel;
        }
      `;
      const out = await lintFixture(
        src,
        { 'vertz-rules/no-narrowing-let': 'warn' },
        'panel.ts',
      );
      expect(out).not.toMatch(/no-narrowing-let/);
    });
  });

  describe('Given a union-typed let inside a nested function', () => {
    it('then the rule does NOT fire', async () => {
      const src = `
        export function Outer() {
          function helper() {
            let panel: 'code' | 'spec' = 'code';
            return panel;
          }
          return <div>{helper()}</div>;
        }
      `;
      const out = await lintFixture(
        src,
        { 'vertz-rules/no-narrowing-let': 'warn' },
        'outer.tsx',
      );
      expect(out).not.toMatch(/no-narrowing-let/);
    });
  });

  describe('Given a const with a union annotation', () => {
    it('then the rule does NOT fire', async () => {
      const src = `
        export function C() {
          const mode: 'code' | 'spec' = 'code';
          return <div>{mode}</div>;
        }
      `;
      const out = await lintFixture(
        src,
        { 'vertz-rules/no-narrowing-let': 'warn' },
        'c.tsx',
      );
      expect(out).not.toMatch(/no-narrowing-let/);
    });
  });

  describe('Given a non-union annotation', () => {
    it('then the rule does NOT fire (e.g., T[])', async () => {
      const src = `
        export function L() {
          let items: number[] = [];
          return <div>{items.length}</div>;
        }
      `;
      const out = await lintFixture(
        src,
        { 'vertz-rules/no-narrowing-let': 'warn' },
        'l.tsx',
      );
      expect(out).not.toMatch(/no-narrowing-let/);
    });
  });

  describe('Given a destructuring binding with union annotation', () => {
    it('then the rule does NOT fire (deferred)', async () => {
      const src = `
        export function D() {
          let { mode }: { mode: 'a' | 'b' } = { mode: 'a' };
          return <div>{mode}</div>;
        }
      `;
      const out = await lintFixture(
        src,
        { 'vertz-rules/no-narrowing-let': 'warn' },
        'd.tsx',
      );
      expect(out).not.toMatch(/no-narrowing-let/);
    });
  });

  describe('Given an as const initializer', () => {
    it('then the autofix replaces as const with the union cast', async () => {
      const src = `
        export function P() {
          let panel: 'code' | 'spec' = 'code' as const;
          return <div>{panel}</div>;
        }
      `;
      const fixed = await lintFixtureWithFix(
        src,
        { 'vertz-rules/no-narrowing-let': 'warn' },
        'p.tsx',
      );
      expect(fixed).toContain(`let panel: 'code' | 'spec' = 'code' as 'code' | 'spec';`);
      expect(fixed).not.toContain(`as const`);
    });
  });

  describe('Given a SequenceExpression initializer', () => {
    it('then the autofix wraps in parens', async () => {
      const src = `
        export function S() {
          let x: 'a' | 'b' = (globalThis.k = 1, 'a');
          return <div>{x}</div>;
        }
      `;
      const fixed = await lintFixtureWithFix(
        src,
        { 'vertz-rules/no-narrowing-let': 'warn' },
        's.tsx',
      );
      expect(fixed).toMatch(/let x: 'a' \| 'b' = \(\(globalThis\.k = 1, 'a'\)\) as 'a' \| 'b';/);
    });
  });

  describe('Given a multi-declarator statement', () => {
    it('then fixes each declarator independently', async () => {
      const src = `
        export function M() {
          let a: 'x' | 'y' = 'x', b: 1 | 2 = 1;
          return <div>{a}{b}</div>;
        }
      `;
      const fixed = await lintFixtureWithFix(
        src,
        { 'vertz-rules/no-narrowing-let': 'warn' },
        'm.tsx',
      );
      expect(fixed).toContain(`let a: 'x' | 'y' = 'x' as 'x' | 'y', b: 1 | 2 = 1 as 1 | 2;`);
    });
  });
});
```

## Alternatives Considered

### A. TypeScript Language Service plugin that rewrites ASTs pre-check
- ✅ Zero user-visible changes; "it just works."
- ❌ Fragile IDE integration, opaque tooling, community has repeatedly burned on this pattern. **Rejected.**

### B. `state<T>(initial: T): T` runtime helper
- ✅ Explicit, no narrowing.
- ❌ New import per file, forks the `let` idiom. **Rejected.**

### C. Native-compiler injects `as T` cast at build time
- ✅ User writes the obvious form.
- ❌ Doesn't fix TS type-checking (TS sees source, not compiled output). **Rejected — doesn't solve the problem.**

### D. Documentation only, no lint rule
- ✅ Lowest cost.
- ❌ Users don't discover docs until they hit the trap; TS2367 error message doesn't reference Vertz. **Rejected — insufficient.**

### E. Close as "intended TypeScript behavior"
- ❌ Real DX pain for every user writing state-machine state. **Rejected.**

### F. Autofix form A: `let x = v as T` (Rev 1 default)
- ✅ Less verbose.
- ❌ DX review: `as` reads as "trust me" not widening; conflicts with TS style-guide advice. **Rejected in favor of form B.**

### G. Compiler diagnostic instead of lint rule
- ✅ Vertz-branded, appears in dev server output.
- ❌ Same build-time firing as lint; doesn't help IDE live TS2367. **Rejected — no advantage over lint.**

**Chosen:** Lint rule with form-B autofix + docs section (Rev 2).

## Implementation Phases (high-level)

One phase. No conditionals after Rev 2 resolved the autofix unknown.

### Phase 1 — Rule + tests + docs + docs audit

**Files (within the 5-file-per-task budget; splits into 2 tasks):**

Task 1.1 (rule + registration):
- `oxlint-plugins/vertz-rules.js` — add `noNarrowingLet` rule; export via `plugin.rules`.
- `.oxlintrc.json` — register `vertz-rules/no-narrowing-let: warn`.
- `oxlint-plugins/__tests__/vertz-rules.test.ts` — add `lintFixtureWithFix` + `tscFixture` helpers and the E2E test cases above.

Task 1.2 (docs + docs audit):
- `packages/mint-docs/guides/ui/reactivity.mdx` — add "Union-typed state" section; update any existing `let x: T = v` examples that would be flagged.
- `.claude/rules/policies.md` — add one-line entry to the `vertz-rules` list (the canonical in-repo location; not `CLAUDE.md`).

Per `.claude/rules/phase-implementation-plans.md`, each task gets a self-contained phase file at `plans/2779-let-signal-narrowing/phase-NN-<slug>.md` once this design doc is approved by the user.

### Out-of-scope follow-ups (filed as separate issues before the PR merges, linked from the PR description)

- Clean up redundant-paren emissions from the `SequenceExpression` path (stylistic-only, not correctness).
- Support destructuring patterns (`let { a }: { a: 'x' | 'y' } = ...`) in a later rev if real-world occurrences surface.
- Upstream: report the `BindingIdentifier.typeAnnotation: null` vs. runtime mismatch to the oxlint repo.

### Additional test coverage (included in Phase 1, Task 1.1)

Two tests added on top of the E2E block above to close the remaining Rev 2 review nits:

- **`let x: T = v as OtherT` initializer:** assert the autofix produces `v as OtherT as T`. `no-double-cast` only matches `as unknown as T`, so this chained cast compiles cleanly without additional warnings.
- **`tscFixture` on the autofix output (not only on the hand-written form):** run the rule + autofix first, feed the fixed text into `tscFixture`, assert no TS2367. This closes the loop: "the autofix actually solves the original user's typecheck problem."
