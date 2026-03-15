# Adopt `className` as Standard JSX Prop

**Issue:** [#1331](https://github.com/vertz-dev/vertz/issues/1331)
**Status:** Draft
**Supersedes:** [#1290 / link-class-prop.md](./link-class-prop.md) (reversed direction — PR #1329 made `class` primary on Link; this reverses framework-wide to `className`)

## Problem

Vertz currently uses `class` as the JSX attribute for CSS classes. This diverges from the React convention (`className`), causing friction for both developers and LLMs:

1. **LLMs default to `className`** — trained overwhelmingly on React codebases, every AI tool generates `className`. Fighting this means constant corrections in AI-assisted workflows.
2. **Developer muscle memory** — most frontend developers come from React. `className` is the established JSX convention.
3. **Pragmatism over purity** — `class` is the "correct" HTML attribute, but `className` is the industry standard for JSX.

This change aligns with Vertz's core principle: **AI agents are first-class users** (MANIFESTO.md Principle 3).

## API Surface

### Before (current)

```tsx
<div class={styles.wrapper}>
  <Link href="/about" class={styles.link}>About</Link>
  <Button class="primary">Submit</Button>
</div>
```

### After

```tsx
<div className={styles.wrapper}>
  <Link href="/about" className={styles.link}>About</Link>
  <Button className="primary">Submit</Button>
</div>
```

### JSX Runtime — accepts both, maps to DOM `class`

```ts
// In jsxImpl():
} else if ((key === 'className' || key === 'class') && value != null) {
  element.setAttribute('class', String(value));
}
```

When both `className` and `class` are present, `className` takes precedence. The runtime collects `className` first, then only uses `class` if `className` was not provided.

### Precedence reversal note

The Link component (PR #1329) currently has `class` as primary and `className` as deprecated alias (`classProp ?? className`). This change reverses that to `className ?? classProp`. This is safe because we are pre-v1 with no external users, and the previous direction was only merged days ago.

### Component Props — `className` is primary, `class` is deprecated alias

```ts
export interface ButtonProps extends ElementEventHandlers {
  /** CSS class for the button element. */
  className?: string;
  /**
   * @deprecated Use `className` instead.
   */
  class?: string;
  intent?: ButtonIntent;
  size?: ButtonSize;
}

// Implementation: const effectiveClass = className ?? classProp;
```

### Destructuring simplification

Moving to `className` as primary actually simplifies component destructuring. `class` is a reserved keyword requiring aliasing (`class: classProp`), but `className` is a valid identifier that can be destructured directly.

### Type definition for intrinsic elements

The current `HTMLAttributes` is a permissive `[key: string]: unknown` catch-all, so both `class` and `className` already work at the type level. We will add an explicit `className?: string` to `HTMLAttributes` for IDE autocomplete discoverability, even though the catch-all already covers it.

**Known limitation:** The catch-all also means typos like `classname` (lowercase n) won't trigger type errors. This is a pre-existing issue not introduced by this change.

## Manifesto Alignment

- **Principle 3: AI agents are first-class users** — "Every API decision is evaluated by one question: Can an LLM use this correctly on the first prompt?" LLMs will generate `className`. Accepting it as the primary prop means AI-generated code works without correction.
- **Principle 2: One way to do things** — Making `className` the documented standard and `class` a deprecated alias gives a clear single path. During transition both work, but docs/examples show only `className`.
- **Principle 6: Convention over configuration** — Adopting the most widely-used JSX convention reduces friction.

### What was rejected

- **Keeping `class` as primary** — This is the "pure HTML" approach. Rejected because it fights the entire React/JSX ecosystem and every LLM's training data.
- **Supporting both without preference** — Violates "one way to do things." We need a canonical choice.

## Non-Goals

- Removing `class` support entirely (breaking change, deferred to v1)
- Adding runtime deprecation warnings (too noisy)
- Changing `activeClass` prop on `Link` — this is a behavior prop (applied conditionally based on route matching), not a styling convention like `className`. It follows the `<prefix>Class` pattern common in routing libraries (React Router used `activeClassName` before simplifying). No rename needed.
- Changing the `css()` or `variants()` API — these return class name strings; only the JSX attribute used to apply them changes. `<div className={styles.panel}>` instead of `<div class={styles.panel}>`.
- Adding `htmlFor` → `for` mapping — same React-ism argument applies, but separate scope. Tracked for future.

## Unknowns

None identified. The JSX runtime already has a clear interception point for attribute names. Components already destructure `class: className` internally — the rename is mechanical.

## Type Flow Map

No generics introduced or changed. The `class`/`className` prop is always `string | undefined`.

## E2E Acceptance Test

```ts
describe('Feature: className as standard JSX prop', () => {
  describe('Given a div with className prop', () => {
    describe('When rendered via JSX runtime', () => {
      it('Then applies the class to the DOM element', () => {
        const el = <div className="wrapper">content</div>;
        expect(el.getAttribute('class')).toBe('wrapper');
      });
    });
  });

  describe('Given a div with deprecated class prop', () => {
    describe('When rendered via JSX runtime', () => {
      it('Then still applies the class to the DOM element', () => {
        const el = <div class="wrapper">content</div>;
        expect(el.getAttribute('class')).toBe('wrapper');
      });
    });
  });

  describe('Given a themed Button with className', () => {
    describe('When rendered', () => {
      it('Then merges className with theme styles', () => {
        const el = <Button className="custom">Click</Button>;
        expect(el.classList.contains('custom')).toBe(true);
      });
    });
  });

  describe('Given a Link with className', () => {
    describe('When rendered', () => {
      it('Then applies className to the anchor element', () => {
        const el = <Link href="/" className="nav-link">Home</Link>;
        expect(el.classList.contains('nav-link')).toBe(true);
      });
    });
  });

  // Type-level: className is accepted, class triggers deprecation in IDE
  // @ts-expect-error — className accepts string, not number
  <div className={42}>bad</div>;
});
```

## Implementation Plan

### Phase 1: JSX Runtime + Core Types

Update both JSX runtimes (client + server) to accept `className` and map it to `class`.

**Changes:**
- `packages/ui/src/jsx-runtime/index.ts` — accept `className` (primary) and `class` (deprecated alias). When both are present, `className` takes precedence. Add `className?: string` to `HTMLAttributes` for autocomplete.
- `packages/ui-server/src/jsx-runtime/index.ts` — same pattern: `className` primary, `class` fallback. Precedence: if both are in attrs, `className` wins.
- `packages/ui/src/jsx-runtime/__tests__/jsx-types.test-d.ts` — add `className` type tests
- `packages/ui/src/jsx-runtime/__tests__/jsx-runtime.test.ts` — test `className` → DOM `class`

**Acceptance criteria:**
```ts
describe('Feature: JSX runtime className support', () => {
  describe('Given className prop on intrinsic element', () => {
    describe('When jsx() creates the element', () => {
      it('Then sets the DOM class attribute', () => {});
    });
  });

  describe('Given class prop on intrinsic element (deprecated)', () => {
    describe('When jsx() creates the element', () => {
      it('Then still sets the DOM class attribute', () => {});
    });
  });

  describe('Given both className and class on same element', () => {
    describe('When jsx() creates the element', () => {
      it('Then className takes precedence', () => {});
    });
  });
});
```

### Phase 2: Compiler + SSR DOM Shim + applyAttrs

Update the compiler's attribute handling, SSR element shim, and primitives attr utility.

**Compiler mapping detail:** The `processAttribute` function in `jsx-transformer.ts` has 4 code paths (string literal, reactive `__attr`, static non-literal guarded, literal guarded). ALL use `JSON.stringify(attrName)` directly. The fix: normalize early in `processAttribute`:

```ts
// Map className → class for intrinsic elements (DOM attribute)
const domAttrName = attrName === 'className' ? 'class' : attrName;
```

Then use `domAttrName` in all `setAttribute`/`__attr` calls. This MUST NOT apply to component props — `buildPropsObject` passes props through as-is, so components receive `className` as a prop and handle it themselves.

**Changes:**
- `packages/ui-compiler/src/transformers/jsx-transformer.ts` — normalize `className` → `class` at the top of `processAttribute` for intrinsic elements
- `packages/ui-server/src/dom-shim/ssr-element.ts` — handle `className` in `setAttribute` (map to `class`)
- `packages/ui-compiler/src/__tests__/integration.test.ts` — add `className` transform tests, update existing test that asserts `"className"` to assert `"class"`
- `packages/ui-primitives/src/utils/attrs.ts` — accept `className` in `ElementAttrs`, handle in `applyAttrs` (map `className` to `class` path)
- `packages/ui-server/src/bun-plugin/image-transform.ts` — add `case 'className':` alongside `case 'class':` in attribute extraction

**Acceptance criteria:**
```ts
describe('Feature: Compiler className → class transform', () => {
  describe('Given JSX with className="static"', () => {
    describe('When compiled', () => {
      it('Then emits setAttribute("class", "static")', () => {});
    });
  });

  describe('Given JSX with className={reactive}', () => {
    describe('When compiled', () => {
      it('Then emits __attr(el, "class", () => reactive)', () => {});
    });
  });

  describe('Given JSX with className={staticConst}', () => {
    describe('When compiled', () => {
      it('Then emits guarded setAttribute("class", ...)', () => {});
    });
  });

  describe('Given component JSX with className prop', () => {
    describe('When compiled', () => {
      it('Then passes className as-is in props object (no mapping)', () => {});
    });
  });
});

describe('Feature: applyAttrs className support', () => {
  describe('Given attrs with className', () => {
    describe('When applyAttrs is called', () => {
      it('Then sets DOM class attribute', () => {});
    });
  });
});
```

### Phase 3: Component Props — @vertz/ui

Update Link and Image components to use `className` as primary.

**Note:** PR #1329 recently made `class` the primary prop on Link with `className` as deprecated alias. This phase reverses that — `className` becomes primary, `class` becomes deprecated alias.

**Changes:**
- `packages/ui/src/router/link.ts` — swap: `className` primary, `class` deprecated. Deprecation message: `@deprecated Use className instead.`
- `packages/ui/src/image/types.ts` + `image.ts` — same pattern
- `packages/ui/src/router/__tests__/link.test.ts` — update tests
- `packages/ui/src/image/__tests__/image.test.ts` — update tests

**Acceptance criteria:**
```ts
describe('Feature: Link className prop', () => {
  describe('Given Link with className', () => {
    it('Then applies to anchor element', () => {});
  });
  describe('Given Link with deprecated class prop', () => {
    it('Then still works as fallback', () => {});
  });
  describe('Given Link with both className and class', () => {
    it('Then className takes precedence', () => {});
  });
});
```

### Phase 4: Component Props — @vertz/theme-shadcn

Update all theme component props from `class` to `className`.

**Changes:** All files in `packages/theme-shadcn/src/components/`:
- `button.ts`, `input.ts`, `label.ts`, `textarea.ts`, `card.ts`, `avatar.ts`, `badge.ts`, `alert.ts`, `breadcrumb.ts`, `form-group.ts`, `pagination.ts`, `separator.ts`, `skeleton.ts`, `table.ts`
- All files in `packages/theme-shadcn/src/components/primitives/`:
  - `accordion.ts`, `alert-dialog.ts`, `dialog.ts`, `dropdown-menu.ts`, `popover.ts`, `select.ts`, `sheet.ts`, `tabs.ts`, `tooltip.ts`
- Tests for each component

**Pattern for each component:**
```ts
// Before
export interface ButtonProps {
  class?: string;
}
function Button({ class: className, ...}: ButtonProps) { ... }

// After
export interface ButtonProps {
  className?: string;
  /** @deprecated Use className */
  class?: string;
}
function Button({ className, class: classProp, ...}: ButtonProps) {
  const effectiveClass = className ?? classProp;
  // ... use effectiveClass where className was used before
}
```

**Acceptance criteria:**
- Each component accepts `className` as primary prop
- Each component still accepts `class` as deprecated fallback
- Theme styles correctly merged with `className`

### Phase 5: Component Props — @vertz/ui-primitives, @vertz/ui-auth, @vertz/icons

**Changes:**
- All composed components in `packages/ui-primitives/src/*/` — SlotProps interfaces + destructuring
- `packages/ui-auth/src/avatar.tsx`, `user-avatar.tsx`, `user-name.tsx`
- `packages/icons/src/types.ts`, `render-icon.ts`

**Acceptance criteria:**
- Same pattern: `className` primary, `class` deprecated alias
- All primitives, auth components, and icons accept `className`

### Phase 6: Examples + Docs + CLAUDE.md Rules

Update all examples, documentation, and internal rules to use `className`.

**Migration automation:** Use find-and-replace across all `.tsx` files to convert `class=` (in JSX attribute position) to `className=`. Verify with:
```bash
grep -rn ' class=' --include='*.tsx' examples/ | grep -v activeClass | grep -v className | grep -v '\/\/'
```
Output should be empty after migration.

**Changes:**
- All ~64 example files that use `class=` in JSX
- All ~10 doc files that reference `class=`
- `.claude/rules/ui-components.md` — update all code samples
- `plans/link-class-prop.md` — mark as superseded

**Acceptance criteria:**
- Zero occurrences of `class=` in JSX attributes in examples (verified by grep, excluding `activeClass` and comments)
- All docs show `className`
- CLAUDE.md rules updated
