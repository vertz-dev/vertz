# Breadcrumb Component with Router Integration

**Issue:** [#1668](https://github.com/vertz-dev/vertz/issues/1668)

## API Surface

### Basic Usage

```tsx
import { Breadcrumb } from '@vertz/ui/components';

<Breadcrumb>
  <Breadcrumb.Item href="/projects">Projects</Breadcrumb.Item>
  <Breadcrumb.Item href={`/projects/${projectId}`}>{project.name}</Breadcrumb.Item>
  <Breadcrumb.Item current>{issue.title}</Breadcrumb.Item>
</Breadcrumb>
```

### Custom Separator

```tsx
<Breadcrumb separator="›">
  <Breadcrumb.Item href="/">Home</Breadcrumb.Item>
  <Breadcrumb.Item current>Settings</Breadcrumb.Item>
</Breadcrumb>
```

### Plain Text Item (no link, not current)

```tsx
<Breadcrumb>
  <Breadcrumb.Item href="/">Home</Breadcrumb.Item>
  <Breadcrumb.Item>Disabled Section</Breadcrumb.Item>
  <Breadcrumb.Item current>Page</Breadcrumb.Item>
</Breadcrumb>
```

### Props

```ts
interface ComposedBreadcrumbProps {
  children?: ChildValue;
  /** Separator character between items. Default: "/" */
  separator?: string;
  classes?: BreadcrumbClasses;
  className?: string;
  class?: string;
}

interface BreadcrumbItemProps {
  children?: ChildValue;
  /** Target path — renders as Link (SPA navigation). Omit for non-linked items. */
  href?: string;
  /** Marks this item as the current page (aria-current="page", no link). */
  current?: boolean;
  className?: string;
  class?: string;
}
```

### Invalid Usage

```tsx
// @ts-expect-error — items prop no longer exists (excess property error)
<Breadcrumb items={[{ label: 'Home' }]} />
```

### Runtime Precedence

When both `href` and `current` are provided, `current` takes precedence (renders as `<span aria-current="page">`, not a link). This is not a type error but is semantically contradictory. A dev-mode console warning is emitted.

## Manifesto Alignment

### One Way to Do Things (Principle 2)
The old data-driven `items` array API is replaced by the compound sub-component API. One pattern for breadcrumbs — compose `Breadcrumb.Item` children. Pre-v1, breaking changes are encouraged.

### AI Agents Are First-Class Users (Principle 3)
`<Breadcrumb.Item href="/path">Label</Breadcrumb.Item>` is immediately intuitive. An LLM that has seen `<Link href="...">` will correctly guess `<Breadcrumb.Item href="...">` — consistent prop naming across the framework.

### If It Builds, It Works (Principle 1)
TypeScript enforces that `children` and `href` are valid. The compound API composes naturally with the Vertz JSX model.

### Tradeoff: Breaking Change
The `items: BreadcrumbItem[]` data-driven API is removed. This is correct pre-v1 — the compound API is strictly better for composability, flexibility (arbitrary children), and router integration.

## Non-Goals

- **Breadcrumb collapsing/truncation** — no ellipsis pattern for many items. Can be added later.
- **Route-based auto-generation** — breadcrumbs from route hierarchy. Useful but separate feature.
- **Custom separator components** — only string separators. JSX separator (e.g., icon) can be added later.
- **Active state highlighting** — breadcrumb items don't track active route state. The `current` prop is explicit.

## Unknowns

None identified. The patterns (compound components, Link, context-based classes, theme wiring) are well-established in the codebase.

## Type Flow Map

```
BreadcrumbClasses (ui-primitives)
  → BreadcrumbContext.Provider value (ui-primitives)
    → useContext(BreadcrumbContext) in Breadcrumb.Item (ui-primitives)
      → cn(classes?.item) applied to <li>

ComposedBreadcrumbProps (ui-primitives)
  → withStyles() strips `classes` → StyledPrimitive<typeof ComposedBreadcrumb> (theme-shadcn)
    → ThemeComponentMap['Breadcrumb'] augmentation (theme-shadcn)
      → Breadcrumb export from @vertz/ui/components

BreadcrumbItemProps.href (ui-primitives)
  → Link({ href }) (@vertz/ui → router)
    → useContext(RouterContext).navigate()
```

## E2E Acceptance Test

```tsx
import { describe, it, expect } from 'bun:test';

describe('Feature: Breadcrumb with router integration', () => {
  describe('Given a Breadcrumb with three items', () => {
    describe('When rendered', () => {
      it('Then renders nav with aria-label="Breadcrumb" and ol structure', () => {
        // nav > ol > li*3
      });

      it('Then items with "href" prop render as Link (anchor with href)', () => {
        // <a> elements with href, click intercepted by router
      });

      it('Then the "current" item renders as span with aria-current="page"', () => {
        // <span aria-current="page">
      });

      it('Then separators are automatically rendered between items', () => {
        // separator elements with aria-hidden="true"
      });
    });
  });

  describe('Given a Breadcrumb.Item with no href and no current', () => {
    describe('When rendered', () => {
      it('Then renders as plain span (no link, no aria-current)', () => {});
    });
  });

  describe('Given a Breadcrumb with custom separator', () => {
    describe('When rendered with separator="›"', () => {
      it('Then separators display the custom character', () => {});
    });
  });

  describe('Given Breadcrumb.Item with "href" prop', () => {
    describe('When clicked', () => {
      it('Then navigates via router (not full page load)', () => {
        // Link intercepts click, calls router.navigate()
      });
    });
  });
});
```

## Architecture

### Component Structure

The compound `Breadcrumb` lives in `@vertz/ui-primitives` (which already depends on `@vertz/ui` for `createContext`, `useContext`, `ChildValue`, and now `Link`).

```
ui-primitives/src/breadcrumb/breadcrumb-composed.tsx
├── BreadcrumbContext (classes + separator, stableId: '@vertz/ui-primitives::BreadcrumbContext')
├── BreadcrumbItem (sub-component)
│   ├── href prop → Link from @vertz/ui
│   ├── current prop → <span aria-current="page">
│   ├── no href, no current → <span> (plain text)
│   └── Separator rendered inside <li>, hidden for first via CSS :first-child
└── ComposedBreadcrumbRoot (nav > ol > children)
    └── Exported as ComposedBreadcrumb with .Item sub-component
```

### Separator Strategy

Each `Breadcrumb.Item` renders a separator `<span>` inside its `<li>`, before the link/text content. The first item's separator is hidden via a CSS rule on the `<li>:first-child` selector.

```tsx
// Conceptual render of Breadcrumb.Item
<li class={itemClass}>
  <span role="presentation" aria-hidden="true" class={separatorClass}>{separator}</span>
  {href && !current ? <Link href={href}>{children}</Link> : <span ...>{children}</span>}
</li>
```

Theme CSS hides the first separator:
```ts
breadcrumbItem: [
  'inline-flex', 'items:center', 'gap:1.5',
  { '&:first-child > [role="presentation"]': { display: 'none' } },
],
```

**Note:** The `&:first-child > [role="presentation"]` child combinator selector is a novel pattern for the `css()` system. The `replaceAll('&', ...)` substitution should handle it correctly, but an explicit unit test for this selector in `css.test.ts` is required to validate.

This avoids child scanning/reorganization (per project convention) and works naturally with Vertz's JSX rendering model.

### Theme Wiring

- `BreadcrumbClasses` gains no new keys — reuses existing: `nav`, `list`, `item`, `link`, `page`, `separator`
- `theme-shadcn` updates from manual function wrapper to `withStyles(ComposedBreadcrumb, {...})`
- `@vertz/ui/components` changes from `createComponentProxy` to `createCallableSuiteProxy` with `['Item']`
- Module augmentation type: `Breadcrumb: StyledPrimitive<typeof ComposedBreadcrumb>`

### Export Type Signature

The `ComposedBreadcrumb` export must include `Item` as a typed property (following the Card pattern):

```ts
export const ComposedBreadcrumb = Object.assign(ComposedBreadcrumbRoot, {
  Item: BreadcrumbItem,
}) as ((props: ComposedBreadcrumbProps) => HTMLElement) & {
  __classKeys?: BreadcrumbClassKey;
  Item: (props: BreadcrumbItemProps) => HTMLElement;
};
```

This ensures `withStyles()` and `StyledPrimitive<>` correctly forward the `.Item` sub-component property.

### Test Strategy for Link/RouterContext

`Link` throws when `RouterContext` is absent. Unit tests in `ui-primitives` must provide a minimal `RouterContext.Provider` mock:

```tsx
import { RouterContext } from '@vertz/ui';

const mockRouter = {
  current: '/',
  navigate: ({ to }: { to: string }) => { /* no-op or record */ },
  // ... minimal Router shape
};

function RenderWithRouter(children: ChildValue) {
  return <RouterContext.Provider value={mockRouter}>{children}</RouterContext.Provider>;
}
```

This pattern is documented here for reuse by future primitives that depend on `Link`.

### Changes by Package

| Package | File | Change |
|---------|------|--------|
| `ui-primitives` | `src/breadcrumb/breadcrumb-composed.tsx` | Rewrite: compound sub-component API with Link |
| `ui-primitives` | `src/__tests__/breadcrumb-composed.test.tsx` | Rewrite tests for new API (with RouterContext mock) |
| `theme-shadcn` | `src/styles/breadcrumb.ts` | Add `:first-child` separator hiding rule |
| `theme-shadcn` | `src/configure.ts` | Switch to `withStyles()` |
| `theme-shadcn` | `src/index.ts` | Update module augmentation to `StyledPrimitive<typeof ComposedBreadcrumb>` |
| `theme-shadcn` | `src/__tests__/breadcrumb.test.ts` | Rewrite tests for new API |
| `ui` | `src/components/index.ts` | `createCallableSuiteProxy('Breadcrumb', ['Item'])` |
| `examples` | `component-catalog/src/demos/breadcrumb.tsx` | Update to compound API |

---

## Implementation Plan

### Phase 1: Compound Breadcrumb with Router Integration

**Scope:** Full vertical slice — rewrite primitive, update theme, update export, update examples, all tests.

#### Step-by-step:

1. **Rewrite `breadcrumb-composed.tsx`** in `ui-primitives`:
   - Add `BreadcrumbContext` with stable ID `'@vertz/ui-primitives::BreadcrumbContext'` (classes + separator)
   - New `BreadcrumbItem` sub-component: reads context, renders separator + Link/span
   - Three render paths: `href` → `Link`, `current` → `<span aria-current="page">`, neither → plain `<span>`
   - Dev-mode warning when both `href` and `current` are provided
   - `ComposedBreadcrumbRoot` renders `<nav>` + `<ol>`, provides context
   - Export as `Object.assign(root, { Item })` with typed sub-component property

2. **Update `ui-primitives` tests** (with RouterContext mock):
   - Test compound API (Breadcrumb + Breadcrumb.Item children)
   - Test `href` prop renders `<a>` (Link output)
   - Test `current` prop renders span with `aria-current="page"`
   - Test plain item (no href, no current) renders as span
   - Test automatic separators between items
   - Test custom separator string
   - Test separator hidden for first item
   - Test class distribution via context
   - Test without classes (unstyled)
   - Negative type test: `@ts-expect-error` for old `items` prop

3. **Update `theme-shadcn` styles**:
   - Add `:first-child > [role="presentation"]` display-none rule to item styles
   - Add unit test for the child combinator CSS selector in theme tests

4. **Update `theme-shadcn` configure**:
   - Switch from manual wrapper to `withStyles(ComposedBreadcrumb, {...})`
   - Update module augmentation type to `StyledPrimitive<typeof ComposedBreadcrumb>`

5. **Update `@vertz/ui/components/index.ts`**:
   - Change `Breadcrumb` from `createComponentProxy` to `createCallableSuiteProxy('Breadcrumb', ['Item'])`

6. **Update theme tests**:
   - Rewrite breadcrumb tests for compound API

7. **Update example apps**:
   - Update `examples/component-catalog/src/demos/breadcrumb.tsx` to compound API

#### Acceptance Criteria:

```typescript
describe('Feature: Compound Breadcrumb with router integration', () => {
  describe('Given a Breadcrumb with Item children', () => {
    describe('When rendered', () => {
      it('Then wraps in nav[aria-label="Breadcrumb"] > ol', () => {});
      it('Then each Item renders as an li', () => {});
    });
  });

  describe('Given Breadcrumb.Item with href prop', () => {
    describe('When rendered', () => {
      it('Then renders an anchor element with href', () => {});
    });
  });

  describe('Given Breadcrumb.Item with current prop', () => {
    describe('When rendered', () => {
      it('Then renders span with aria-current="page"', () => {});
      it('Then does not render a link', () => {});
    });
  });

  describe('Given Breadcrumb.Item with no href and no current', () => {
    describe('When rendered', () => {
      it('Then renders as plain span (no link, no aria-current)', () => {});
    });
  });

  describe('Given multiple Breadcrumb.Item children', () => {
    describe('When rendered', () => {
      it('Then separator elements appear between items', () => {});
      it('Then first item has no visible separator', () => {});
      it('Then separators are aria-hidden', () => {});
    });
  });

  describe('Given a custom separator prop', () => {
    describe('When rendered', () => {
      it('Then separators use the custom character', () => {});
    });
  });

  describe('Given theme classes are registered', () => {
    describe('When Breadcrumb is imported from @vertz/ui/components', () => {
      it('Then Breadcrumb is callable', () => {});
      it('Then Breadcrumb.Item is accessible as sub-component', () => {});
      it('Then theme classes are applied to all parts', () => {});
    });
  });
});
```

---

## Review Sign-offs

### DX Review — APPROVED (after `to` → `href` rename)
- **Blocker resolved:** Renamed `to` to `href` for consistency with `Link` component
- **Suggestion adopted:** Dev-mode warning for `href` + `current` together
- Separator strategy, compound pattern, LLM first-try success all approved

### Product/Scope Review — APPROVED WITH SUGGESTIONS
- **Adopted:** Example app updates added to scope
- **Adopted:** Plain text item edge case (no href, no current) added to API and acceptance criteria
- **Adopted:** Negative type test for old `items` prop

### Technical Review — APPROVED WITH SUGGESTIONS
- **Blocker resolved:** RouterContext mock strategy documented for tests
- **Blocker resolved:** Explicit `ComposedBreadcrumb` type signature with `Item` property specified
- **Adopted:** Exact stable ID `'@vertz/ui-primitives::BreadcrumbContext'` specified
- **Adopted:** Exact augmentation type `StyledPrimitive<typeof ComposedBreadcrumb>` specified
- **Adopted:** CSS selector validation test for child combinator noted
- **Adopted:** Invalid Usage section corrected (removed incorrect `@ts-expect-error`)
