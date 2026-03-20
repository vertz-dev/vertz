# JSX Spread Attributes

**Issue:** [#1633](https://github.com/vertz-dev/vertz/issues/1633)
**Status:** Design
**Priority:** P0

## Problem

The JSX transformer silently drops `JsxSpreadAttribute` nodes on both intrinsic elements (`<button {...rest}>`) and component calls (`<Button {...props}>`). This causes silent data loss — event handlers, data attributes, aria attributes, and any spread props are lost without warning.

Four filter sites in `jsx-transformer.ts` exclude spread attributes:
- Line 305: `if (!attr.isKind(SyntaxKind.JsxAttribute)) continue;` (JsxElement attrs)
- Line 366: same (self-closing intrinsic element attrs)
- Line 986: `.filter((a) => a.isKind(SyntaxKind.JsxAttribute))` (buildPropsObject for components)
- Line 260: same (component children check)

## API Surface

### 1. Component Calls — Object Spread

No new API. Spread attributes are emitted as `...expr` in the generated props object literal, matching standard JS semantics.

```tsx
// Input:
<Button {...props} intent="primary" />

// Current (broken):
Button({ intent: 'primary' })

// Fixed:
Button({ ...props, intent: 'primary' })
```

Source order determines precedence — last-wins, same as JavaScript object spread:

```tsx
// Input:
<Button intent="ghost" {...overrides} disabled />

// Output:
Button({ intent: 'ghost', ...overrides, disabled: true })
// overrides.intent (if present) wins over 'ghost'
```

Reactive getter properties coexist with spread:

```tsx
// Input (reactive count):
<Counter {...baseProps} value={count} />

// Output:
Counter({ ...baseProps, get value() { return count.value; } })
```

### 2. Intrinsic Elements — Runtime `__spread`

New runtime function: `__spread(el, props)`. Applied to DOM elements when spread attributes are encountered.

```tsx
// Input:
<button onClick={handleClick} {...rest}>Click</button>

// Output:
(() => {
  const _el = __element("button");
  __on(_el, "click", handleClick);
  __spread(_el, rest);
  __enterChildren(_el);
  __staticText("Click");
  __exitChildren();
  return _el;
})()
```

`__spread` iterates the object at runtime:
- `children` / `key` keys → skip (framework concepts, not DOM attributes)
- `on*` keys → `el.addEventListener(eventName, handler)`
- `ref` key → `ref.current = el`
- `className` key → normalized to `class`, then `el.setAttribute('class', value)` (replace, not merge)
- `htmlFor` key → normalized to `for`, then `el.setAttribute('for', value)`
- `style` key with object value → `el.setAttribute('style', styleObjectToString(value))` (replace, not merge)
- `style` key with string value → `el.setAttribute('style', value)` (replace, not merge)
- `null`/`undefined`/`false` values → skip (don't set attribute)
- `true` values → `el.setAttribute(key, '')`
- Other keys → `el.setAttribute(attrName, String(value))`, with SVG normalization when on an SVG element

**Class/style use replace, not merge.** This matches last-wins semantics and avoids a hydration bug: during hydration, `__element` claims an existing SSR DOM node that already has attributes set. Merging would produce `"base base"` when re-applying. Replace is idempotent and correct for both CSR and hydration.

**SVG support:** `__spread` detects SVG elements by checking `el.namespaceURI === SVG_NS` and applies `normalizeSVGAttr()` for camelCase → hyphenated attribute names (e.g., `strokeWidth` → `stroke-width`). Both utilities already exist in `packages/ui/src/dom/svg-tags.ts`.

Source order is preserved — explicit attributes before the spread are emitted as individual statements first, spread applies after. Explicit attributes after the spread are emitted after the `__spread` call. Last-wins.

```tsx
// Input:
<button className="base" {...rest} disabled>Click</button>

// Output:
(() => {
  const _el = __element("button");
  _el.setAttribute("class", "base");
  __spread(_el, rest);
  _el.setAttribute("disabled", "");
  ...
})()
```

### 3. `__spread` Signature

```ts
// packages/ui/src/dom/spread.ts
export function __spread(el: Element, props: Record<string, unknown>): void;
```

Uses `Element` (not `HTMLElement`) to support both HTML and SVG elements.

Exported from `@vertz/ui/internals` alongside other compiler output targets. Must also be added to the `DOM_HELPERS` array in `packages/ui-compiler/src/compiler.ts` so the auto-import detects `__spread(` in transformed output.

## Manifesto Alignment

- **"If it builds, it works"** — Currently, spread syntax compiles silently but loses data at runtime. This fix restores correctness: JSX spread works the way every developer expects.
- **"One way to do things"** — Eliminates the `applyProps()` workaround in theme-shadcn. Components can use standard JSX spread instead of an imperative escape hatch.
- **"AI agents are first-class users"** — LLMs generate `{...rest}` naturally from React experience. Silent prop loss forces debugging that's hard for both humans and agents.

## Non-Goals

- **Reactive spread** — Spread props are applied once at element creation time, not tracked reactively. A `__spread` inside `deferredDomEffect` would require tracking the entire object for changes. This matches React's behavior (spread is evaluated once per render).
- **Spread on fragments** — `<>{...items}</>` is not addressed. Fragment children are a different codepath.
- **Dynamic tag spread** — Only standard intrinsic elements and capitalized components. Dynamic tag names via computed expressions are out of scope.
- **Spread-only IDL property handling** — `__spread` uses `setAttribute` for all non-event/non-special keys. It does NOT detect IDL properties like `value`/`checked` that need direct property assignment. If a spread object contains `{ value: 'foo' }` on an `<input>`, it will use `setAttribute("value", "foo")` rather than `el.value = "foo"`. This is acceptable because: (a) explicit JSX attributes already handle IDL properties correctly, (b) spreading IDL-sensitive props is uncommon, and (c) `setAttribute` works correctly for initial render. **Revisit trigger:** if a real-world usage pattern demonstrates breakage (e.g., form libraries spreading `value`/`checked` onto inputs), promote this to a follow-up issue. Note: this also means `<select {...rest}>` with `rest.value` uses `setAttribute` (not IDL assignment), which is safe because `__spread` runs before children — `setAttribute("value", ...)` sets the HTML attribute and the browser resolves it after children render. If IDL support is ever added to `__spread`, the `<select>` deferral concern must be addressed.

## SSR Compatibility

`__spread` works with the SSR DOM shim without changes. During SSR:
- `__element` creates an `SSRElement`
- `SSRElement.setAttribute(...)` sets the `attrs` dict (serialized to HTML attributes)
- `SSRElement.addEventListener(...)` is a no-op on the shim (event handlers are client-only)

No SSR-specific code path is needed in `__spread`.

## Unknowns

None identified. The route-splitting transformer already handles spread in `jsxAttrsToObjectLiteral` (lines 390-393), proving the AST pattern is straightforward. The runtime function is a simple iteration.

## Type Flow Map

No new generics. `__spread` takes `Record<string, unknown>` — intentionally untyped at runtime since it's a dynamic prop bag. Component spread preserves TypeScript's existing type checking on JSX spread attributes (enforced by the type checker, not the compiler transform).

## E2E Acceptance Test

### Component Spread

```tsx
// ✅ Compiles — spread merged into props
function Parent() {
  const shared = { intent: 'primary' as const, size: 'md' as const };
  return <Button {...shared} disabled />;
}
// Generated: Button({ ...shared, disabled: true })

// ✅ Source order precedence
function Override() {
  const overrides = { intent: 'danger' as const };
  return <Button intent="ghost" {...overrides} />;
}
// Generated: Button({ intent: 'ghost', ...overrides })
// At runtime, intent === 'danger' (last wins)
```

### Intrinsic Spread

```tsx
// ✅ Event handlers in spread are attached
function Spread() {
  const rest = { onClick: () => console.log('clicked'), 'data-testid': 'btn' };
  return <button {...rest}>Click</button>;
}
// Generated: __spread(el, rest) → addEventListener + setAttribute

// ✅ Explicit attrs + spread coexist in source order
function Mixed() {
  const rest = { 'aria-label': 'Close' };
  return <button className="base" {...rest} disabled>X</button>;
}
// Generated: setAttribute("class", "base"); __spread(el, rest); setAttribute("disabled", "")
```

### Hydration

```tsx
// ✅ During hydration, __spread attaches event handlers to claimed SSR element
function HydratedButton() {
  const handlers = { onClick: () => {}, onMouseEnter: () => {} };
  return <button {...handlers}>Click</button>;
}
// __element claims existing DOM node, __spread attaches listeners to it
```

### Invalid Usage

```tsx
// @ts-expect-error — TypeScript already catches wrong spread types
<Button {...{ intent: 123 }} />
// Type 'number' is not assignable to type 'ButtonIntent'
```

---

## Implementation Plan

### Phase 1: Component Call Spread in `buildPropsObject`

**Goal:** `<Component {...props} key="val" />` generates `Component({ ...props, key: 'val' })`.

**Changes:**
- `jsx-transformer.ts` `buildPropsObject()`: iterate all attributes (not just `JsxAttribute`). When a `JsxSpreadAttribute` is encountered, emit `...expr.getText()` into the props array.
- Remove the `.filter((a) => a.isKind(SyntaxKind.JsxAttribute))` on line 986 and handle both kinds in the loop.

**Acceptance Criteria:**

```typescript
describe('Feature: Component call spread attributes', () => {
  describe('Given a component with spread-only props', () => {
    describe('When compiled', () => {
      it('Then generates Component({ ...expr })', () => {})
    })
  })
  describe('Given a component with spread before explicit props', () => {
    describe('When compiled', () => {
      it('Then generates Component({ ...expr, key: value })', () => {})
    })
  })
  describe('Given a component with spread after explicit props', () => {
    describe('When compiled', () => {
      it('Then generates Component({ key: value, ...expr })', () => {})
    })
  })
  describe('Given a component with reactive props and spread', () => {
    describe('When compiled', () => {
      it('Then spread and getter props coexist in object literal', () => {})
    })
  })
  describe('Given a component with multiple spreads', () => {
    describe('When compiled', () => {
      it('Then all spreads are emitted in source order', () => {})
    })
  })
})
```

### Phase 2: Intrinsic Element Spread — Runtime `__spread`

**Goal:** `<button {...rest}>` calls `__spread(el, rest)` at the correct position in the statement list.

**Changes:**
- New file: `packages/ui/src/dom/spread.ts` — implements `__spread(el, props)` with SVG detection, className/htmlFor normalization, children/key filtering.
- `packages/ui/src/dom/index.ts` — export `__spread`.
- `packages/ui/src/internals.ts` — export `__spread` for compiler-generated code.
- `packages/ui-compiler/src/compiler.ts` — add `'__spread'` to the `DOM_HELPERS` array so auto-import detects it.
- `jsx-transformer.ts`: In the intrinsic element attribute loops (lines 302-313, 364-369), when a `JsxSpreadAttribute` is encountered, emit `__spread(elVar, expr)` as a statement.

**Acceptance Criteria:**

```typescript
describe('Feature: Intrinsic element spread attributes', () => {
  describe('Given a spread with event handlers', () => {
    describe('When __spread is called', () => {
      it('Then event handlers are attached via addEventListener', () => {})
    })
  })
  describe('Given a spread with data-* attributes', () => {
    describe('When __spread is called', () => {
      it('Then attributes are set via setAttribute', () => {})
    })
  })
  describe('Given a spread with aria-* attributes', () => {
    describe('When __spread is called', () => {
      it('Then attributes are set via setAttribute', () => {})
    })
  })
  describe('Given a spread with style object', () => {
    describe('When __spread is called', () => {
      it('Then style is converted to string and set (replace, not merge)', () => {})
    })
  })
  describe('Given a spread with style string', () => {
    describe('When __spread is called', () => {
      it('Then style string is set directly (replace, not merge)', () => {})
    })
  })
  describe('Given a spread with className key', () => {
    describe('When __spread is called', () => {
      it('Then className is normalized to class and set (replace, not merge)', () => {})
    })
  })
  describe('Given a spread with class key', () => {
    describe('When __spread is called', () => {
      it('Then class is set via setAttribute', () => {})
    })
  })
  describe('Given a spread with htmlFor key', () => {
    describe('When __spread is called', () => {
      it('Then htmlFor is normalized to for', () => {})
    })
  })
  describe('Given a spread with ref', () => {
    describe('When __spread is called', () => {
      it('Then ref.current is set to the element', () => {})
    })
  })
  describe('Given a spread with children or key', () => {
    describe('When __spread is called', () => {
      it('Then children and key are skipped', () => {})
    })
  })
  describe('Given a spread with null/false/undefined values', () => {
    describe('When __spread is called', () => {
      it('Then those keys are skipped', () => {})
    })
  })
  describe('Given a spread with boolean true value', () => {
    describe('When __spread is called', () => {
      it('Then attribute is set as empty string', () => {})
    })
  })
  describe('Given a spread on an SVG element', () => {
    describe('When __spread is called', () => {
      it('Then camelCase attributes are normalized (strokeWidth → stroke-width)', () => {})
    })
  })
  describe('Given explicit attrs before and after spread', () => {
    describe('When compiled', () => {
      it('Then source order determines precedence', () => {})
    })
  })
})
```

### Phase 3: Compiler Integration + Cleanup

**Goal:** Full integration tests, cleanup the `applyProps` workaround in theme-shadcn Button, and verify hydration.

**Changes:**
- Integration test: compile + execute a component with spread on both intrinsic elements and components, verify runtime behavior.
- `packages/theme-shadcn/src/components/button.tsx`: Remove the `applyProps(el, rest)` workaround — use native JSX spread instead.
- `packages/theme-shadcn/src/components/input.ts` and `textarea.ts`: These also use `applyProps` but are `.ts` files (not compiled by Vertz). They remain on `applyProps` until the primitives JSX migration converts them to `.tsx`. This is tracked separately (see project memory: primitives JSX migration).
- `jsx-transformer.ts` `buildPropsObject()`: Verify the `getDescendantsOfKind` fallback path (line 987) — if reachable, it also needs `JsxSpreadAttribute` handling. If dead code, add a comment.
- Verify hydration: `__spread` on a claimed SSR element attaches event handlers correctly. Attribute re-setting is idempotent (replace, not merge) so no duplication issues.

**Acceptance Criteria:**

```typescript
describe('Feature: JSX spread end-to-end', () => {
  describe('Given a theme component using native spread instead of applyProps', () => {
    describe('When rendered', () => {
      it('Then all spread props are applied correctly', () => {})
    })
  })
  describe('Given spread props during hydration', () => {
    describe('When __spread applies to a claimed SSR node', () => {
      it('Then event handlers are attached to the claimed element', () => {})
      it('Then existing SSR attributes are not duplicated', () => {})
    })
  })
  describe('Given the theme-shadcn Button without applyProps', () => {
    describe('When rest props include onClick and data-testid', () => {
      it('Then both are applied via JSX spread', () => {})
    })
  })
})
```

### Phase Dependencies

```
Phase 1 (component spread) ← independent
Phase 2 (intrinsic spread) ← independent of Phase 1
Phase 3 (integration + cleanup) ← depends on Phase 1 + Phase 2
```

Phases 1 and 2 can be implemented in parallel but will be done sequentially for simpler review.
