# CamelCase Style Migration

> Migrate all string-based inline styles and imperative DOM style assignments to camelCase style objects across the entire codebase.
> Prerequisite: #1332 (style object support — already shipped)

## API Surface

### What changes for developers

**Before (dash-case strings):**
```tsx
// String style attribute — no type safety, no autocomplete
<div style="font-size: 16px; background-color: red;">

// Conditional visibility — fragile string toggling
<div style={isOpen ? '' : 'display: none'}>

// Template literal with interpolation
<div style={`width: ${pct}%`}>

// Imperative DOM manipulation in event handlers
thumb.style.left = `${pct}%`;
fill.style.width = `${pct}%`;
```

**After (camelCase objects):**
```tsx
// Object style — type-checked, autocomplete, camelCase
<div style={{ fontSize: '16px', backgroundColor: 'red' }}>

// Conditional visibility — clean object expression
<div style={{ display: isOpen ? '' : 'none' }}>

// Interpolated value — type-safe numeric auto-px
<div style={{ width: `${pct}%` }}>

// Reactive style via JSX (where compiler transforms apply)
// For imperative contexts (event handlers with refs), keep `.style.prop = value`
// but ensure property names are already camelCase (they are — this is standard DOM API)
thumb.style.left = `${pct}%`;
fill.style.width = `${pct}%`;
```

### Convention: when to use what

| Scenario | Use |
|----------|-----|
| Static inline styles in JSX | `style={{ camelCase: 'value' }}` |
| Conditional styles in JSX | `style={{ display: condition ? '' : 'none' }}` |
| Conditionally omitting a property | `style={{ pointerEvents: disabled ? 'none' : undefined }}` — `undefined` values are skipped by `styleObjectToString()`, so the property is not emitted |
| Dynamic values in JSX | `style={{ width: \`\${pct}%\` }}` |
| Mixed static + dynamic properties | `style={{ position: 'absolute', width: \`\${pct}%\`, transform: \`translateX(\${x}px)\` }}` — static and dynamic in the same object is fine |
| Imperative updates via refs (event handlers, animations) | `el.style.camelCase = value` (already camelCase — this is the DOM API) |
| CSS custom properties via refs | `el.style.setProperty('--var-name', value)` (unchanged) |
| Raw HTML strings (dev-server overlays, non-JSX) | Dash-case is correct — these aren't TypeScript objects |

### `style={{}}` vs `css()` / `variants()` boundary

`css()` and `variants()` remain the primary styling mechanism for static, design-token-based styles. Use `style={{}}` only when:
- Values are computed at runtime (e.g., dynamic widths, positions from calculations)
- One-off layout adjustments that don't warrant a named style block
- Visibility toggling (`display: 'none'`) that can't use a CSS class

Do NOT replace `css()` blocks with inline style objects. The migration only targets existing string-based `style` attributes — it does not move class-based styles to inline.

### What NOT to change

- **`css()` / `variants()` token syntax** — `['bg:primary', 'p:4']` is a design token system, not CSS properties. It stays as-is.
- **Dev server HTML strings** (`bun-dev-server.ts`) — Raw HTML, not JSX. Dash-case is correct.
- **OG templates** (`packages/og/`) — Already use camelCase objects. No changes needed.
- **`el.style.setProperty('--var', value)`** — CSS custom property API. Already correct.
- **Imperative `.style.camelCase = value`** — Already camelCase (DOM API standard). Only the JSX string attributes need migration.

### Invalid patterns after migration

```tsx
// WRONG — string style in JSX (post-migration)
<div style="font-size: 16px">

// RIGHT — object style in JSX
<div style={{ fontSize: '16px' }}>

// WRONG — object style with dash-case keys (quoted)
<div style={{ 'font-size': '16px' }}>

// RIGHT — object style with camelCase keys
<div style={{ fontSize: '16px' }}>
```

## Manifesto Alignment

### Principle 2: One way to do things
This migration enforces a single convention for inline styles: **camelCase objects**. String styles technically still work (backward compat), but all framework code, examples, and primitives will use objects exclusively. One pattern in the codebase, one pattern LLMs learn from.

### Principle 1: If it builds, it works
Object styles get TypeScript autocomplete and type checking. `style={{ backgroundColour: 'red' }}` gets caught at compile time. String styles can't offer this.

### Principle 3: AI agents are first-class users
LLMs trained on React generate `style={{ fontSize: '16px' }}` by default. Making all Vertz examples match this pattern means zero friction — LLMs produce correct code on the first prompt.

### Tradeoffs accepted
- **Large migration surface** — ~110 string-style instances, ~45 imperative style assignments across 20+ files. Justified because this is a one-time cost that permanently improves consistency.
- **Slightly more verbose for simple cases** — `style={{ display: 'none' }}` vs `style="display: none"`. Justified by type safety and consistency.

### What was rejected
- **Lint rule to ban string styles** — Good future follow-up, but not part of this migration. Focus on converting existing code first. A lint rule issue should be created as part of Phase 4 to prevent regression.
- **Compile-time string-to-object conversion** — Over-engineering. Just fix the source code.
- **Converting all imperative `.style.x = value` to reactive JSX** — Some imperative style updates (slider thumb positioning, carousel transforms, scroll-area calculations) happen in pointer event handlers where they need to update a single property efficiently. Converting these to reactive style objects would require restructuring the component's state model. That's the primitives JSX migration project, not this one.

## Non-Goals

- **Changing the `css()` / `variants()` API** — Token syntax is a separate concern
- **Removing string style support from the runtime** — Backward compatibility is maintained
- **Adding a lint rule for style conventions** — Future follow-up (issue created in Phase 4)
- **Refactoring primitive components to be fully reactive** — That's the broader JSX migration project
- **Touching dev-server overlay HTML** — Raw HTML strings, not JSX

## Ordering Note

**This migration should land before the primitives JSX migration begins.** Both touch many of the same files in `packages/ui-primitives/`. Landing this first ensures the JSX migration starts from a consistent style convention, avoiding merge conflicts and style inconsistency in the resulting code.

## Unknowns

None identified. The style object support is already shipped and tested. This is a mechanical migration.

## POC Results

No POC needed. Style objects are already fully supported in the runtime, compiler, and SSR. This migration is applying an existing feature consistently.

## Type Flow Map

No new types introduced. The existing `CSSProperties` type (from `packages/ui/src/jsx-runtime/css-properties.ts`) already flows through:

```
CSSProperties (mapped from CSSStyleDeclaration)
  ↓
JSX.HTMLAttributes['style'] = string | CSSProperties
  ↓
Developer writes: style={{ fontSize: '16px' }}
  ↓
TypeScript validates keys + values at compile time
  ↓
Runtime: styleObjectToString() → "font-size: 16px"
  ↓
DOM: element.setAttribute('style', '...')
```

No new generics. No dead type parameters.

## E2E Acceptance Test

```tsx
describe('Feature: CamelCase style migration', () => {
  describe('Given a ui-primitives composed component (e.g. Slider)', () => {
    describe('When rendered with default props', () => {
      it('Then all style attributes use object syntax, not string syntax', () => {
        // Verify: no style="..." string attributes in the rendered output
        // All inline styles are applied via style objects
      });
    });
  });

  describe('Given an example app component (e.g. TodoItem)', () => {
    describe('When rendering conditional visibility', () => {
      it('Then uses style={{ display: condition ? "" : "none" }} not style={string}', () => {
        // Verify: style attribute is applied as an object
      });
    });
  });

  describe('Given the landing site', () => {
    describe('When rendering any component with inline styles', () => {
      it('Then all style attributes use camelCase object syntax', () => {
        // No string-based style attributes in any landing site component
      });
    });
  });

  // Behavioral verification — existing tests still pass
  describe('Given any migrated file', () => {
    it('Then all existing tests for that package continue to pass', () => {
      // bun test on each changed package — no regressions
    });
    it('Then typecheck passes for each changed package', () => {
      // bun run typecheck on each changed package
    });
  });

  // Source-level verification (grep-based)
  describe('Given the migrated codebase', () => {
    it('Then no JSX file in examples/ contains style="..." string attributes', () => {
      // grep -r 'style="' examples/  → 0 matches (excluding non-JSX files)
    });
    it('Then no JSX file in packages/ui-primitives/ contains style="..." string attributes', () => {
      // grep -r 'style="' packages/ui-primitives/src/ → 0 matches
    });
    it('Then no JSX file in packages/ui-auth/ contains style="..." string attributes', () => {
      // grep -r 'style="' packages/ui-auth/src/ → 0 matches
    });
    it('Then no JSX file in sites/landing/ contains style="..." string attributes', () => {
      // grep -r 'style="' sites/landing/src/ → 0 matches
    });
  });
});
```

## Implementation Plan

### Inventory Summary

| Package/Dir | String `style="..."` | Template `style={\`...\`}` | Conditional `style={x ? ... : ...}` | Imperative `.style.x` | `.style.cssText` | `.style.setProperty()` |
|---|---|---|---|---|---|---|
| `packages/ui-primitives/src/` | ~50 | ~8 | ~15 | ~45 | 0 | ~8 |
| `examples/` | ~5 | ~12 | ~5 | 0 | 0 | 0 |
| `sites/landing/src/` | ~15 | 0 | 0 | 0 | 0 | 0 |
| `packages/ui-auth/src/` | ~6 | ~2 | 0 | 0 | ~1 | 0 |
| `packages/icons/src/` | 0 | 0 | 0 | 0 | ~1 | 0 |
| `packages/theme-shadcn/src/` | 0 | 0 | 0 | 0 | ~1 | 0 |

### Phase 1: Examples — Convention showcase (thinnest E2E slice)

Migrate all example apps to camelCase style objects. These are the code developers copy from, so they're the highest-impact, lowest-risk starting point.

**Files:**
- `examples/entity-todo/src/components/todo-item.tsx` — conditional display strings
- `examples/entity-todo/src/pages/todo-list.tsx` — opacity string
- `examples/component-catalog/src/app.tsx` — layout strings
- `examples/component-catalog/src/demos/tabs.tsx` — padding/color strings
- `examples/linear/src/components/issue-card.tsx` — template literal color
- `examples/linear/src/components/loading-skeleton.tsx` — template literal dimensions

**Conversion pattern:**
```tsx
// Before
style={isConfirmOpen ? '' : 'display: none'}
// After
style={{ display: isConfirmOpen ? '' : 'none' }}

// Before
style={todosQuery.revalidating ? 'opacity: 0.6' : ''}
// After
style={{ opacity: todosQuery.revalidating ? 0.6 : 1 }}

// Before
style="padding: 1rem; color: var(--color-muted-foreground); font-size: 14px;"
// After
style={{ padding: '1rem', color: 'var(--color-muted-foreground)', fontSize: '14px' }}

// Before
style={`color: ${PRIORITY_CONFIG[issue.priority].color}`}
// After
style={{ color: PRIORITY_CONFIG[issue.priority].color }}
```

**Acceptance criteria:**
```tsx
describe('Phase 1: Example apps use camelCase style objects', () => {
  describe('Given the entity-todo example', () => {
    describe('When TodoItem renders conditional visibility', () => {
      it('Then uses style={{ display: isConfirmOpen ? "" : "none" }}', () => {});
    });
    describe('When todo-list renders revalidating state', () => {
      it('Then uses style={{ opacity: ... }} with numeric value', () => {});
    });
  });

  describe('Given the component-catalog example', () => {
    describe('When app layout renders', () => {
      it('Then uses style objects for flex layout', () => {});
    });
    describe('When tab demo panels render', () => {
      it('Then uses style objects for padding and typography', () => {});
    });
  });

  describe('Given the linear example', () => {
    describe('When issue-card renders priority color', () => {
      it('Then uses style={{ color: dynamicValue }}', () => {});
    });
    describe('When loading-skeleton renders', () => {
      it('Then uses style objects for dimensions', () => {});
    });
  });

  // Source-level: zero string styles in examples
  describe('Given all example .tsx files', () => {
    it('Then grep for style=" returns 0 matches', () => {});
  });

  // Behavioral: existing tests pass
  describe('Given all changed example packages', () => {
    it('Then bun test passes for each changed package', () => {});
    it('Then bun run typecheck passes', () => {});
  });
});
```

### Phase 2a: ui-primitives composed components — String style attributes

Convert all `style="..."` string attributes and `style={\`...\`}` template literals in ui-primitives **composed** components to camelCase objects. Composed components have the most complex patterns (template literals, conditionals, multi-property). This phase does NOT touch imperative `.style.x = value` assignments.

**Files:**
- `accordion-composed.tsx` — display: none
- `alert-dialog-composed.tsx` — display: contents
- `carousel-composed.tsx` — overflow, transform template
- `checkbox-composed.tsx` — width/height
- `collapsible-composed.tsx` — display: none
- `dialog-composed.tsx` — display: contents
- `dropdown-menu-composed.tsx` — display: contents, display: none
- `hover-card-composed.tsx` — display: contents, display: none
- `popover-composed.tsx` — display: contents, display: none
- `progress-composed.tsx` — width template
- `radio-composed.tsx` — flex layout, pointer-events
- `resizable-panel-composed.tsx` — flex-direction template
- `scroll-area-composed.tsx` — overflow, position
- `select-composed.tsx` — flex, text-overflow, display: none, display: contents
- `sheet-composed.tsx` — display: contents
- `slider-composed.tsx` — position, transform, width templates
- `tabs-composed.tsx` — display: none
- `tooltip-composed.tsx` — display: contents, display: none

**Common conversion patterns:**
```tsx
// display: contents wrapper (many composed components)
// Before
<span style="display: contents">{children}</span>
// After
<span style={{ display: 'contents' }}>{children}</span>

// Conditional visibility
// Before
style={isOpen ? '' : 'display: none'}
// After
style={{ display: isOpen ? '' : 'none' }}

// Static positioning (slider, scroll-area)
// Before
style="position: relative;"
// After
style={{ position: 'relative' }}

// Template literal with interpolation (slider, carousel, progress)
// Before
style={`position: absolute; height: 100%; border-radius: inherit; width: ${initialPct}%`}
// After
style={{ position: 'absolute', height: '100%', borderRadius: 'inherit', width: `${initialPct}%` }}

// Multi-property layout (radio)
// Before
style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;"
// After
style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}

// Conditional multi-property (radio disabled)
// Before
style={isDisabled ? 'pointer-events: none; position: relative;' : 'position: relative;'}
// After — undefined values are skipped by styleObjectToString()
style={{ pointerEvents: isDisabled ? 'none' : undefined, position: 'relative' }}
```

**Acceptance criteria:**
```tsx
describe('Phase 2a: ui-primitives composed components use camelCase style objects', () => {
  describe('Given composed components with display: contents wrappers', () => {
    it('Then all use style={{ display: "contents" }}', () => {});
  });

  describe('Given composed components with conditional visibility', () => {
    it('Then all use style={{ display: condition ? "" : "none" }}', () => {});
  });

  describe('Given slider with template literal styles', () => {
    it('Then track uses style={{ position: "relative" }}', () => {});
    it('Then fill uses style={{ position: "absolute", height: "100%", ... }}', () => {});
    it('Then thumb uses style={{ position: "absolute", transform: "translate(-50%, -50%)", ... }}', () => {});
  });

  describe('Given radio with multi-property layout styles', () => {
    it('Then item wrapper uses style={{ display: "flex", alignItems: "center", ... }}', () => {});
    it('Then disabled state uses conditional object properties with undefined omission', () => {});
  });

  // Behavioral: existing tests pass
  describe('Given ui-primitives package', () => {
    it('Then bun test passes for @vertz/ui-primitives', () => {});
    it('Then bun run typecheck passes', () => {});
  });

  // Source-level: zero string styles in composed components
  describe('Given all ui-primitives *-composed.tsx files', () => {
    it('Then grep for style=" returns 0 matches', () => {});
  });
});
```

### Phase 2b: ui-primitives low-level components — String style attributes

Convert remaining `style="..."` string attributes in low-level primitives. These are mostly simple patterns (`style="display: none"`, `style="overflow: hidden"`).

**Files:**
- `accordion.tsx`, `alert-dialog.tsx`, `carousel.tsx`, `collapsible.tsx`, `combobox.tsx`, `command.tsx`, `context-menu.tsx`, `dialog.tsx`, `hover-card.tsx`, `menu.tsx`, `navigation-menu.tsx`, `popover.tsx`, `resizable-panel.tsx`, `scroll-area.tsx`, `select.tsx`, `sheet.tsx`, `slider.tsx`, `tabs.tsx`, `tooltip.tsx`

**Acceptance criteria:**
```tsx
describe('Phase 2b: ui-primitives low-level components use camelCase style objects', () => {
  describe('Given low-level primitives with visibility toggling', () => {
    it('Then all use style={{ display: condition ? "" : "none" }}', () => {});
  });

  describe('Given low-level primitives with static styles', () => {
    it('Then all use camelCase object syntax', () => {});
  });

  // Behavioral: existing tests pass
  describe('Given ui-primitives package', () => {
    it('Then bun test passes for @vertz/ui-primitives', () => {});
    it('Then bun run typecheck passes', () => {});
  });

  // Source-level: zero string styles in ALL ui-primitives
  describe('Given all ui-primitives .tsx files', () => {
    it('Then grep for style=" returns 0 matches in JSX attributes', () => {});
  });
});
```

### Phase 3: Landing site + remaining packages

Convert all remaining string styles in the landing site, ui-auth, icons, and theme-shadcn.

**Files:**
- `sites/landing/src/components/hero.tsx` — font-family, font-size, background
- `sites/landing/src/components/schema-flow.tsx` — font-family, color, border-color
- `sites/landing/src/components/why-vertz.tsx` — font-family, background, border-color
- `packages/ui-auth/src/avatar.tsx` — cssText string for container and img
- `packages/ui-auth/src/auth-gate.tsx` — display: contents
- `packages/ui-auth/src/access-gate.tsx` — display: contents
- `packages/ui-auth/src/protected-route.tsx` — display: contents
- `packages/ui-auth/src/oauth-button.tsx` — cssText for icon sizing
- `packages/icons/src/render-icon.ts` — cssText for icon container
- `packages/theme-shadcn/src/badge.ts` — cssText for inline style

**Special cases — `cssText` migration:**

`.style.cssText = '...'` **replaces** the entire inline style (clears previous properties then applies new ones). `Object.assign(el.style, { ... })` **merges** (sets each property without clearing others). These are NOT equivalent in general.

However, all `.style.cssText` usages in scope are on **freshly created elements** (`document.createElement`), so there are no pre-existing styles to worry about. `Object.assign` is equivalent here.

- `avatar.tsx` — backtick string with interpolated size → convert to style object with dynamic values
- `oauth-button.tsx` and `render-icon.ts` — `.style.cssText` on fresh `document.createElement` → `Object.assign(el.style, { ... })`
- `badge.ts` — `.style.cssText` on fresh element → `Object.assign(el.style, { ... })`

**Note:** These files use imperative DOM creation (`.ts` files, not compiled by the Vertz compiler). `Object.assign(el.style, {...})` is the accepted pattern for non-JSX contexts. These files are candidates for full JSX conversion in the broader primitives migration, but that is out of scope here.

**Acceptance criteria:**
```tsx
describe('Phase 3: Landing + remaining packages', () => {
  describe('Given the landing site components', () => {
    it('Then hero uses style objects for typography', () => {});
    it('Then schema-flow uses style objects for font and colors', () => {});
    it('Then why-vertz uses style objects for layout', () => {});
  });

  describe('Given ui-auth components', () => {
    it('Then avatar uses style objects instead of cssText strings', () => {});
    it('Then gate components use style={{ display: "contents" }}', () => {});
  });

  describe('Given icons package', () => {
    it('Then render-icon uses style object instead of cssText', () => {});
  });

  // Behavioral: existing tests pass
  describe('Given all changed packages', () => {
    it('Then bun test passes for each changed package', () => {});
    it('Then bun run typecheck passes', () => {});
  });

  // Source-level: zero string styles or cssText in these packages
  describe('Given all migrated files', () => {
    it('Then grep for style=" in sites/landing/src/ returns 0 matches', () => {});
    it('Then grep for .style.cssText in packages/ui-auth/ returns 0 matches', () => {});
    it('Then grep for .style.cssText in packages/icons/ returns 0 matches', () => {});
  });
});
```

### Phase 4: Convention documentation + follow-ups

Update conventions, create a lint rule issue to prevent regression, and close the loop on the style-object-support design doc.

**Deliverables:**
- Update `.claude/rules/ui-components.md` — Add inline style convention: prefer `style={{ camelCase }}` over `style="dash-case"` for all JSX, with examples of correct/incorrect patterns
- Update any code snippets in rules files that use string styles
- Create a GitHub issue for a Biome lint rule (or GritQL plugin) that flags `style="..."` string attributes in JSX files — to prevent regression
- Add a note to `plans/style-object-support.md` stating that all first-party code now uses object syntax exclusively

**Acceptance criteria:**
- `ui-components.md` documents the camelCase style object convention with WRONG/RIGHT examples
- All code examples in rules files use camelCase style objects
- GitHub issue exists for lint rule follow-up
- `style-object-support.md` updated with migration completion note
