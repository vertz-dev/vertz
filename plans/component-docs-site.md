# Component Documentation Site

> Build a component documentation site using Vertz itself (dogfooding) with MDX support, replicating ShadCN's per-component documentation pattern one-to-one.

## Motivation

We have ~45 UI components across `@vertz/ui-primitives` and `@vertz/theme-shadcn`, but only a single flat page (`component-library.mdx`) in Mintlify documenting all of them. ShadCN — the gold standard for component docs — has one dedicated page per component with live previews, multiple examples, and API reference tables.

We also can't render Vertz components inside Mintlify because Mintlify runs React. This is a fundamental limitation that can't be worked around with plugins or customization.

**Solution:** Build the component docs as a Vertz app. Components render natively because the docs site IS a Vertz app. MDX provides the authoring experience. SSG provides the deployment story.

---

## API Surface

### 1. MDX Bun Plugin (`@vertz/mdx`)

A new package that provides a Bun plugin for compiling `.mdx` files to Vertz components.

```ts
// bunfig.toml preload or plugin registration
import { createMdxPlugin } from '@vertz/mdx';

// Plugin options
createMdxPlugin({
  remarkPlugins: [],       // remark plugins (operate on markdown AST)
  rehypePlugins: [],       // rehype plugins (operate on HTML AST)
  remarkFrontmatter: true, // extract YAML frontmatter (default: true)
  target: 'client',        // 'client' | 'ssr' — determines jsxImportSource
});
```

**Compilation pipeline:**
```
.mdx file
  → @mdx-js/mdx compile() with jsxImportSource based on target
  → target 'client': import { jsx, jsxs, Fragment } from '@vertz/ui/jsx-runtime'
  → target 'ssr':    import { jsx, jsxs, Fragment } from '@vertz/ui-server/jsx-runtime'
  → JS module loaded by Bun as standard ESM
```

Vertz already exports `@vertz/ui/jsx-runtime` with `jsx()`, `jsxs()`, `jsxDEV()`, and `Fragment` — matching the automatic JSX runtime spec that MDX expects.

**Important: MDX output is NOT processed by the Vertz compiler.** The Vertz compiler transforms `.tsx` files into optimized `__element()` / `__attr()` DOM calls with reactive signal tracking. MDX output uses the raw `jsx()` runtime function instead. This is fine because MDX content is mostly static (headings, paragraphs, lists, code blocks) — it doesn't need reactive signal transforms. Interactive Vertz components imported in MDX (like `<Button>`) are pre-compiled `.tsx` files that have full reactivity.

**Dual runtime swap:** The `target` option determines which `jsxImportSource` is used during compilation. The build pipeline passes `target: 'client'` for the client bundle and `target: 'ssr'` for SSR. This mirrors how the Vertz dev server and build pipeline already handle `.tsx` files through separate compilation passes.

**Dev experience:** The MDX Bun plugin registers `.mdx` as a loadable file type. When a `.mdx` file changes, the Vertz dev server's file watcher triggers the same SSR refresh cycle as `.tsx` files — `require.cache` invalidation → SSR module re-import → browser update. No special HMR integration needed; the existing watcher already handles all file types under `src/`.

### 2. MDX Authoring Format

Each component gets one `.mdx` file. Examples are file-based — each example is a separate `.tsx` file that is imported and rendered live, with its source displayed automatically.

**Simple component page (Button):**

```mdx
---
title: Button
description: Displays a button or a component that looks like a button.
component: Button
category: Form
---

import { ButtonDefault } from './examples/button-default';
import { ButtonSecondary } from './examples/button-secondary';
import { ButtonOutline } from './examples/button-outline';
import { ButtonDestructive } from './examples/button-destructive';
import { ButtonSizes } from './examples/button-sizes';
import { ButtonDisabled } from './examples/button-disabled';
import { buttonProps } from '../data/button-props';

## Preview

<ComponentPreview file="./examples/button-default.tsx">
  <ButtonDefault />
</ComponentPreview>

## Installation

```tsx
import { Button } from '@vertz/ui/components';
```

## Usage

```tsx
<Button intent="primary" size="md">Click me</Button>
```

## Examples

### Secondary

<ComponentPreview file="./examples/button-secondary.tsx">
  <ButtonSecondary />
</ComponentPreview>

### Outline

<ComponentPreview file="./examples/button-outline.tsx">
  <ButtonOutline />
</ComponentPreview>

### Destructive

<ComponentPreview file="./examples/button-destructive.tsx">
  <ButtonDestructive />
</ComponentPreview>

### Sizes

<ComponentPreview file="./examples/button-sizes.tsx">
  <ButtonSizes />
</ComponentPreview>

### Disabled

<ComponentPreview file="./examples/button-disabled.tsx">
  <ButtonDisabled />
</ComponentPreview>

## API Reference

<PropsTable props={buttonProps} />
```

**Compound component page (Dialog):**

```mdx
---
title: Dialog
description: A modal dialog that interrupts the user with important content and expects a response.
component: Dialog
category: Overlay
---

import { DialogDefault } from './examples/dialog-default';
import { DialogCustomClose } from './examples/dialog-custom-close';
import { DialogScrollable } from './examples/dialog-scrollable';
import { dialogProps, dialogTriggerProps, dialogContentProps, dialogTitleProps } from '../data/dialog-props';

## Preview

<ComponentPreview file="./examples/dialog-default.tsx">
  <DialogDefault />
</ComponentPreview>

## Installation

```tsx
import { Dialog } from '@vertz/ui/components';
```

## Usage

```tsx
<Dialog>
  <Dialog.Trigger>
    <Button>Open Dialog</Button>
  </Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Edit Profile</Dialog.Title>
      <Dialog.Description>Make changes to your profile.</Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button intent="primary">Save</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog>
```

## Sub-components

| Component | Description |
|-----------|-------------|
| `Dialog` | Root wrapper. Controls open/close state. |
| `Dialog.Trigger` | Button or element that opens the dialog. |
| `Dialog.Content` | The modal overlay and panel. |
| `Dialog.Header` | Semantic header section. |
| `Dialog.Title` | Accessible title (rendered as heading). |
| `Dialog.Description` | Subtitle or description text. |
| `Dialog.Footer` | Action buttons area. |
| `Dialog.Close` | Closes the dialog. |

## Examples

### Custom Close Button

<ComponentPreview file="./examples/dialog-custom-close.tsx">
  <DialogCustomClose />
</ComponentPreview>

### Scrollable Content

<ComponentPreview file="./examples/dialog-scrollable.tsx">
  <DialogScrollable />
</ComponentPreview>

## API Reference

### Dialog

<PropsTable props={dialogProps} />

### Dialog.Trigger

<PropsTable props={dialogTriggerProps} />

### Dialog.Content

<PropsTable props={dialogContentProps} />

### Dialog.Title

<PropsTable props={dialogTitleProps} />
```

### 3. Documentation Components

Custom components available in MDX for building component pages:

```tsx
// ComponentPreview — live demo with expandable source code
// `file` prop points to the example .tsx file
// The source code is read at build time via a remark plugin
// Children are rendered live as the preview
<ComponentPreview file="./examples/button-default.tsx">
  <ButtonDefault />
</ComponentPreview>

// ComponentPreview also supports layout customization
<ComponentPreview file="./examples/separator-demo.tsx" align="center" padding="lg">
  <SeparatorDemo />
</ComponentPreview>

// CodeBlock — syntax-highlighted code with copy button
// Used by the `pre` MDX override for code fences
// Can also be used directly when explicit control is needed
<CodeBlock language="tsx" title="app.tsx">
  {`import { Button } from '@vertz/ui/components';`}
</CodeBlock>

// PropsTable — component API reference table
// Data imported from centralized prop definition files
// Columns: Name, Type, Default, Description
import { buttonProps } from '../data/button-props';
<PropsTable props={buttonProps} />
```

**PropDefinition type:**

```ts
interface PropDefinition {
  name: string;
  type: string;
  default: string;
  description: string;
}
```

**Centralized prop data files** live in `sites/component-docs/src/data/`:

```ts
// data/button-props.ts — single source of truth for Button's API reference
import type { PropDefinition } from '../types';

export const buttonProps: PropDefinition[] = [
  { name: 'intent', type: '"primary" | "secondary" | "outline" | "ghost" | "destructive" | "link"', default: '"primary"', description: 'Visual style variant of the button.' },
  { name: 'size', type: '"sm" | "md" | "lg"', default: '"md"', description: 'Size of the button.' },
  { name: 'disabled', type: 'boolean', default: 'false', description: 'Whether the button is disabled.' },
  { name: 'onClick', type: '(e: MouseEvent) => void', default: '—', description: 'Click event handler.' },
];
```

This ensures prop data is importable, testable, and a single update propagates to every page that references it.

### 4. MDX Component Overrides

Standard markdown elements get custom renderers for consistent styling. Code fences (`pre`) route through `CodeBlock` internally — there is one code display mechanism, not two.

```tsx
const mdxComponents = {
  h1: DocH1,        // styled heading with anchor link
  h2: DocH2,        // styled section heading with anchor link
  h3: DocH3,        // styled subsection heading
  p: DocParagraph,   // styled paragraph
  code: InlineCode,  // styled inline code
  pre: CodeFence,    // delegates to CodeBlock with language detection + Shiki highlighting
  a: DocLink,        // styled link with external indicator
  ul: DocList,       // styled unordered list
  ol: DocOrderedList,
  table: DocTable,   // styled table matching theme
};
```

**Rule:** Use standard markdown code fences for all code display. The `pre` override renders them through `CodeBlock`. Direct `<CodeBlock>` usage is only needed when you need explicit `title` or `language` override that the code fence meta string doesn't support.

### 5. Route Structure

Flat URLs, categorized sidebar. URLs are `/components/:name` (flat, no category prefix). The sidebar groups components by functional category for discoverability, matching ShadCN's approach.

**URLs (flat):**
```
/                          → redirect to /components/accordion
/components/accordion
/components/alert
/components/alert-dialog
...
/components/tooltip
```

**Sidebar categories:**
```
Form
  Button, Input, Label, Textarea, Checkbox, RadioGroup, Select, Switch, Toggle, Slider

Layout
  Card, Separator, ResizablePanel, ScrollArea, Table, Skeleton

Data Display
  Avatar, Badge, Calendar, Progress

Feedback
  Alert, AlertDialog, Dialog, Toast, Sheet, Drawer

Navigation
  Breadcrumb, Tabs, NavigationMenu, Menubar, Pagination, Command

Overlay
  DropdownMenu, ContextMenu, Popover, Tooltip, HoverCard

Disclosure
  Accordion, Collapsible, Carousel, ToggleGroup
```

### 6. App Layout

Three-column layout matching ShadCN:

```
┌────────────────────────────────────────────────────────┐
│ Header: Logo | "Components" | Docs (→ Mintlify) | GitHub│
├──────────┬─────────────────────────────┬───────────────┤
│ Sidebar  │ Main Content               │ On-this-page  │
│          │                             │ (section nav) │
│ Form     │ # Button                   │ • Preview     │
│  Button  │ Displays a button...       │ • Install     │
│  Input   │                             │ • Usage       │
│  Label   │ ┌─────────────────────┐    │ • Examples    │
│ Layout   │ │ [  Click me  ]      │    │ • API Ref     │
│  Card    │ └─────────────────────┘    │               │
│  ...     │ [View Code] ▼              │               │
│ Feedback │                             │               │
│  Alert   │ ## Examples                │               │
│  Dialog  │ ### Secondary              │               │
│  ...     │ ...                         │               │
├──────────┴─────────────────────────────┴───────────────┤
│ Footer: Previous ← → Next                              │
└────────────────────────────────────────────────────────┘
```

### 7. Component Manifest

A TypeScript manifest file defines all documented components, driving routes, sidebar, and SSG:

```ts
// sites/component-docs/src/manifest.ts
export interface ComponentEntry {
  name: string;        // URL slug: 'button'
  title: string;       // Display name: 'Button'
  category: string;    // Sidebar group: 'Form'
  mdxImport: () => Promise<{ default: () => Node; frontmatter: Record<string, string> }>;
}

export const components: ComponentEntry[] = [
  { name: 'accordion', title: 'Accordion', category: 'Disclosure', mdxImport: () => import('./content/accordion.mdx') },
  { name: 'alert', title: 'Alert', category: 'Feedback', mdxImport: () => import('./content/alert.mdx') },
  { name: 'button', title: 'Button', category: 'Form', mdxImport: () => import('./content/button.mdx') },
  // ... all components
];
```

This manifest:
- Drives the sidebar navigation (grouped by category)
- Provides `generateParams()` for SSG route expansion
- Enables Previous/Next navigation
- Is the single place to add a new component page

---

## Manifesto Alignment

### Principle 6: "If you can't demo it, it's not done"

This is the strongest alignment. Every component will have live, interactive demos embedded in its documentation page. Not screenshots, not code blocks with comments — real running components that developers can interact with. The docs site IS the demo.

### Principle 1: "If it builds, it works"

MDX compilation is build-time. If the docs site builds, every component example is valid. Broken imports or incorrect prop usage will be caught at compile time, not discovered by a reader. File-based examples (`.tsx` files) go through the Vertz compiler, so type errors in examples are caught at build time too.

### Principle 3: "AI agents are first-class users"

Per-component pages with consistent structure are ideal for LLM retrieval. An AI agent can read the Button page and immediately know the API, variants, and usage patterns. One flat page with 45 components is noisy for LLM context.

### Principle 2: "One way to do things"

Every component page follows the exact same template. No variation, no special cases. One code display mechanism (code fences → CodeBlock). One prop documentation approach (centralized data files). This consistency makes both authoring and consumption predictable.

### Dogfooding

Building the docs with Vertz validates the SSG pipeline, MDX compilation, component rendering, and routing in a real production context. Every bug found is a framework improvement.

---

## Non-Goals

1. **Migrating all Mintlify content** — The framework docs (guides, API reference, getting started) stay in Mintlify for now. This effort is component docs only.
2. **Theme selector / customizer** — Future feature. The architecture supports it natively (since components render in Vertz), but it's a separate scope.
3. **Search** — Not in initial scope. Can be added later with a search index.
4. **Auto-generating API reference from TypeScript types** — Manual centralized prop data files for now. A CI check that validates prop names against actual types is a future improvement.
5. **Blog or changelog** — Out of scope.
6. **Custom domain / branding polish** — Basic styling matching ShadCN's clean aesthetic, no custom design work beyond the layout.

---

## Coexistence with Mintlify

The component docs site and Mintlify docs will coexist as separate deployments:

**Boundary rule:** Component docs (per-component pages with live previews) live in the Vertz-built site. Everything else (guides, getting started, API reference, deployment docs) stays in Mintlify.

**What happens to `component-library.mdx`:** Updated to be a thin redirect page that links to the component docs site. e.g., "For detailed component documentation with live examples, visit [components.vertz.dev]."

**Cross-linking:**
- Component docs header links to "Docs" → Mintlify site
- Mintlify component-library page links to "Components" → component docs site
- URL strategy: component docs at `components.vertz.dev` (subdomain), framework docs at `vertz.dev/docs` (existing Mintlify)

**Content migration path:** When we eventually rebuild the full docs site in Vertz (future effort), the MDX infrastructure from this project becomes the foundation. The component docs site becomes one section of the unified docs site.

---

## Prerequisites

### 1. SSR Fragment Rendering Fix (framework bug)

The SSR JSX runtime's `Fragment()` function produces `{ tag: 'fragment', attrs: {}, children: [...] }`, but neither `renderToStream` nor `serializeToHtml` handles `tag: 'fragment'` — they would emit literal `<fragment>children</fragment>` into the HTML output.

This doesn't affect existing `.tsx` files (which go through the Vertz compiler and bypass the JSX runtime), but it WILL affect MDX output which calls `Fragment` directly.

**Fix required before Phase 1:** Add fragment handling to both `render-to-stream.ts` and `html-serializer.ts`:
```ts
if (tag === 'fragment') {
  // Skip wrapper tags, render children only
  return children.map(child => serialize(child)).join('');
}
```

This should be a separate small PR — it's a framework bug independent of the docs site.

---

## Unknowns

### 1. MDX + Vertz JSX Runtime Compatibility — RESOLVED

**Answer: Fully compatible.** POC confirmed that both `jsxImportSource: '@vertz/ui'` and `jsxImportSource: '@vertz/ui-server'` work correctly. No adapter layer needed.

**Children thunking — not an issue.** The server JSX runtime's `normalizeChildren()` handles plain values correctly. Component overrides receive children as plain values from MDX and process them without issues.

### 2. SSR with MDX Content — RESOLVED

**Answer: Works correctly.** MDX content renders to valid HTML via both `serializeToHtml()` and `renderToStream()`. Fragment nodes are serialized transparently (after the prerequisite fix). Shiki-highlighted code blocks survive the VNode → HTML round-trip.

### 3. Shiki Integration Strategy — RESOLVED

**Decision confirmed:** `@shikijs/rehype` at MDX compile time. Produces inline-styled `<span>` elements in the HAST, which MDX compiles to JSX calls, which the Vertz runtime renders correctly. The Shiki highlighter instance will be created once at plugin initialization and shared across all `.mdx` file compilations.

---

## POC Results

**Status: PASSED** — All 12 test cases pass. See `poc/mdx-vertz/poc.test.ts`.

### MDX Compilation

| Test | Result |
|------|--------|
| Compiles with `jsxImportSource: '@vertz/ui'` (program format) | **PASS** — generates `import { jsx, jsxs } from '@vertz/ui/jsx-runtime'` |
| Compiles with `jsxImportSource: '@vertz/ui-server'` (program format) | **PASS** — generates `import { jsx, jsxs } from '@vertz/ui-server/jsx-runtime'` |
| Compiles to `function-body` format for runtime injection | **PASS** — takes `{ jsx, jsxs, Fragment }` via `arguments[0]` |

### SSR Rendering (VNode → HTML)

| Test | Result |
|------|--------|
| Headings, paragraphs, bold, lists render to valid HTML | **PASS** |
| Inline code renders correctly | **PASS** — `<code>const x = 1</code>` |
| Code fences render with `<pre><code>` | **PASS** |
| Links render with `<a href="...">` | **PASS** |
| Multiple sections render without `<fragment>` wrapper tags | **PASS** — Fragment fix working |
| Component overrides (custom `h1`) receive children correctly | **PASS** — no adapter needed |

### Frontmatter & Shiki

| Test | Result |
|------|--------|
| `remark-frontmatter` + `remark-mdx-frontmatter` extract YAML metadata | **PASS** |
| `@shikijs/rehype` highlights code fences at compile time | **PASS** — `<pre>` with inline styles, `<span>` tokens |
| `renderToStream` works with MDX VNode output | **PASS** — no `<fragment>` tags |

### Key Architectural Insights

1. **`function-body` format is the best fit** for the Bun plugin. MDX compiles to a function that receives `{ jsx, jsxs, Fragment }` as arguments. The plugin can inject the appropriate runtime at load time without import path rewriting.

2. **No adapter layer needed.** Both client (DOM) and server (VNode) JSX runtimes work directly with MDX output. Component overrides receive children correctly — no thunk mismatch.

3. **Fragment fix was required.** The SSR serializer was emitting literal `<fragment>` tags. Fixed in `html-serializer.ts` and `render-to-stream.ts`.

4. **Shiki integration is clean.** `@shikijs/rehype` operates at the rehype level during MDX compilation. Highlighted HTML survives the VNode → HTML round-trip.

---

## Type Flow Map

This is primarily an application, not a library API. Type flow is minimal:

```
MDX frontmatter (title, description, category)
  → parsed by remark-frontmatter → extracted as JS object
  → consumed by route metadata, page header, and sidebar components

PropDefinition[] (centralized data files)
  → imported in MDX → passed to PropsTable → rendered as HTML table rows
  → testable independently (CI can validate against actual component types)

ComponentEntry[] (manifest)
  → drives sidebar categories, route params, SSG expansion, prev/next nav

Shiki tokens (generated at MDX compile time by rehype plugin)
  → embedded as styled HTML in the compiled MDX output
  → zero runtime type flow

Route params (/components/:name)
  → useParams<'/components/:name'>() → { name: string }
  → used to resolve sidebar active state and current ComponentEntry
```

No complex generics or cross-package type threading.

---

## E2E Acceptance Test

```ts
describe('Component Documentation Site', () => {
  describe('Given the docs site is built with SSG', () => {
    describe('When navigating to /components/button', () => {
      it('then renders the page title "Button"', () => {});
      it('then renders the description from frontmatter', () => {});
      it('then shows a live interactive Button component in the preview area', () => {});
      it('then shows syntax-highlighted code examples', () => {});
      it('then has a working "View Code" toggle that shows/hides source', () => {});
      it('then shows the API Reference props table with Name, Type, Default, Description columns', () => {});
      it('then has Previous/Next navigation to adjacent components', () => {});
    });

    describe('When using the sidebar navigation', () => {
      it('then groups components by category (Form, Layout, Feedback, etc.)', () => {});
      it('then lists components alphabetically within each category', () => {});
      it('then highlights the currently active component', () => {});
      it('then navigates to the selected component page', () => {});
    });

    describe('When viewing a compound component page (e.g., Dialog)', () => {
      it('then shows sub-component hierarchy table', () => {});
      it('then shows live dialog that opens on trigger click', () => {});
      it('then shows multiple example variations', () => {});
      it('then documents sub-component props in separate PropsTable sections', () => {});
    });

    describe('When the site is SSG-built', () => {
      it('then each component page is a pre-rendered HTML file', () => {});
      it('then pages are interactive after hydration', () => {});
      it('then code blocks are syntax-highlighted in the static HTML (no JS needed)', () => {});
    });
  });
});
```

---

## Implementation Plan

### Phase 0: POC & Prerequisite Fix — DONE

**Status:** Complete. POC passed (12/12 tests). Fragment fix applied.

**Completed:**
- Fixed SSR Fragment rendering in `render-to-stream.ts` and `html-serializer.ts`
- POC: MDX compiles with `jsxImportSource: '@vertz/ui'` and `'@vertz/ui-server'`
- POC: SSR renders MDX content to valid HTML (no `<fragment>` tags)
- POC: Component overrides work correctly (no adapter needed)
- POC: `@shikijs/rehype` highlights code fences at compile time
- POC: `renderToStream` works with MDX VNode output
- POC: Frontmatter extraction works via `remark-frontmatter` + `remark-mdx-frontmatter`

**Gate passed.** Proceeding to Phase 1.

### Phase 1: MDX Bun Plugin (`@vertz/mdx`)

**Goal:** Compile `.mdx` files to Vertz-compatible JS modules via a Bun plugin.

**Deliverables:**
- New `packages/mdx/` package
- Bun plugin that intercepts `.mdx` imports and compiles via `@mdx-js/mdx`
- `target` option for client vs SSR `jsxImportSource` selection
- Frontmatter extraction (via `remark-frontmatter` + `remark-mdx-frontmatter`)
- Rehype-shiki integration for code fence highlighting (shared highlighter instance)
- Unit tests: compile MDX → verify output structure, frontmatter extraction, code highlighting
- Note: `@mdx-js/mdx` is a `dependency` (not `devDependency`) — consumers need it at plugin-load time

**Acceptance criteria:**
```ts
describe('Given an MDX file with frontmatter and JSX', () => {
  describe('When compiled by the Bun plugin', () => {
    it('then exports a default component function', () => {});
    it('then exports frontmatter as a named export', () => {});
    it('then code fences are syntax-highlighted via Shiki', () => {});
  });
});

describe('Given an MDX file importing a Vertz component', () => {
  describe('When rendered in a Vertz app', () => {
    it('then markdown elements render as DOM nodes', () => {});
    it('then the imported Vertz component renders correctly', () => {});
    it('then MDX component overrides are applied', () => {});
  });
});
```

### Phase 2: Docs App Shell & Layout

**Goal:** Create the docs site app with sidebar, routing, and responsive layout.

**Deliverables:**
- New `sites/component-docs/` Vertz application
- Three-column layout (sidebar, main content, on-this-page nav)
- Sidebar with categorized component list (from manifest)
- Route structure: `/components/:name` with `generateParams()` from manifest
- Header with logo, "Components" (active), "Docs" (→ Mintlify link), GitHub link
- Footer with Previous/Next navigation (from manifest ordering)
- Responsive design (sidebar collapses on mobile)
- Theme setup with `@vertz/theme-shadcn`

**Acceptance criteria:**
```ts
describe('Given the docs app is running', () => {
  describe('When navigating to /components/button', () => {
    it('then the sidebar shows all components grouped by category with "Button" highlighted', () => {});
    it('then the main content area renders the MDX page', () => {});
    it('then Previous/Next links navigate to adjacent components', () => {});
  });

  describe('When on a mobile viewport', () => {
    it('then the sidebar is hidden behind a toggle', () => {});
    it('then the main content is full-width', () => {});
  });
});
```

### Phase 3: Documentation Components

**Goal:** Build the reusable components used inside MDX pages.

**Deliverables:**
- `ComponentPreview` — bordered preview area + "View Code" toggle + collapsible code block. Source code is read at build time via a remark plugin that resolves the `file` prop to file contents and injects them as a `__source` prop.
- `CodeBlock` — syntax-highlighted code with language badge, title, and copy button. Used by the `pre` MDX override internally.
- `PropsTable` — API reference table (Name, Type, Default, Description columns)
- MDX component overrides — custom `h1`–`h3`, `p`, `code`, `pre`, `a`, `ul`, `ol`, `table`
- On-this-page navigation (extracts `h2` headings from MDX)

**Acceptance criteria:**
```ts
describe('Given a ComponentPreview with a file prop', () => {
  describe('When rendered', () => {
    it('then shows the live component in a bordered preview area', () => {});
    it('then "View Code" toggle is collapsed by default', () => {});
    it('then clicking "View Code" shows the source from the referenced file', () => {});
    it('then the source code is syntax-highlighted', () => {});
  });
});

describe('Given a CodeBlock with TypeScript code', () => {
  describe('When rendered', () => {
    it('then shows syntax-highlighted code', () => {});
    it('then shows a copy button', () => {});
    it('then clicking copy puts code on clipboard', () => {});
  });
});

describe('Given a PropsTable with prop definitions', () => {
  describe('When rendered', () => {
    it('then shows a table with Name, Type, Default, Description columns', () => {});
    it('then type values are rendered in monospace', () => {});
    it('then description text is rendered for each prop', () => {});
  });
});
```

### Phase 4: First Component Pages (Simple Components)

**Goal:** Write MDX pages for simple, single-element components.

**Components:** Button, Badge, Input, Label, Textarea, Separator, Breadcrumb, Pagination

**Per page:**
1. Title + description (frontmatter)
2. Default preview (file-based example)
3. Installation (import statement)
4. Usage (minimal code fence example)
5. Examples (file-based, reusing/adapting existing `examples/component-catalog/src/demos/`)
6. API Reference (PropsTable with centralized prop data)

**Acceptance criteria:**
```ts
describe('Given the Button component page', () => {
  it('then shows previews for all intents (primary, secondary, outline, ghost, destructive, link)', () => {});
  it('then shows previews for all sizes (sm, md, lg)', () => {});
  it('then shows disabled state example', () => {});
  it('then shows API reference with all props and descriptions', () => {});
});
// Similar for each component in this batch
```

### Phase 5a: Compound Component Pages — Overlay & Dialog

**Goal:** Write MDX pages for overlay/dialog compound components.

**Components:** Dialog, AlertDialog, Sheet, Popover, Tooltip, HoverCard, Drawer

These share a common pattern (Trigger → Content overlay) and are the most commonly used compound components.

**Acceptance criteria:**
```ts
describe('Given the Dialog component page', () => {
  it('then shows a live dialog that opens on trigger click', () => {});
  it('then shows sub-component hierarchy table', () => {});
  it('then documents Dialog, Dialog.Trigger, Dialog.Content, Dialog.Title, etc.', () => {});
  it('then shows examples: basic, custom close, scrollable content', () => {});
  it('then shows PropsTable for each sub-component', () => {});
});
// Similar for each component in this batch
```

### Phase 5b: Compound Component Pages — Interactive Controls

**Goal:** Write MDX pages for interactive control compound components.

**Components:** Select, Tabs, Accordion, DropdownMenu, ContextMenu, Menubar, Command, NavigationMenu, Collapsible, DatePicker, Carousel

**Acceptance criteria:**
```ts
describe('Given the Select component page', () => {
  it('then shows a working select dropdown', () => {});
  it('then documents Select, Select.Trigger, Select.Content, Select.Item, etc.', () => {});
  it('then shows examples: basic, grouped, disabled items', () => {});
});
// Similar for each component in this batch
```

### Phase 6: Suite & Remaining Component Pages

**Goal:** Write MDX pages for suite components and all remaining components.

**Components:** Card (suite), Table (suite), Avatar (suite), Alert (suite), FormGroup (suite), Skeleton, ResizablePanel, ScrollArea, ToggleGroup, RadioGroup, Checkbox, Switch, Progress, Slider, Toggle, Calendar, Toast

All components are imported from `@vertz/ui/components` — the centralized entrypoint. No factory imports or direct theme package imports.

### Phase 7: SSG Build & Deployment

**Goal:** Build and deploy the docs site as a static site.

**Deliverables:**
- SSG configuration with `prerender: true` on all component routes
- `generateParams()` pulls from the component manifest
- Deploy to **Cloudflare Pages** (chosen over Workers for: automatic preview deployments per PR, zero config for static assets, built-in CI/CD)
- CI pipeline: on merge to main → build → deploy to `components.vertz.dev`
- 404 page — styled fallback with link back to component list
- Cache headers: immutable for hashed assets, short TTL for HTML

**Acceptance criteria:**
```ts
describe('Given the docs site is SSG-built', () => {
  it('then generates one HTML file per component page', () => {});
  it('then code blocks are highlighted in static HTML', () => {});
  it('then pages hydrate and become interactive', () => {});
  it('then component previews work after hydration', () => {});
  it('then 404 page renders for unknown routes', () => {});
});
```

---

## Dependencies Between Phases

```
Phase 0 (POC + Fragment Fix)
  ↓
Phase 1 (MDX Plugin)
  ↓
Phase 2 (App Shell) ←→ Phase 3 (Doc Components)  [can be parallel]
  ↓
Phase 4 (Simple Components)
  ↓
Phase 5a (Overlay Compounds) → Phase 5b (Interactive Compounds)
  ↓
Phase 6 (Suite + Remaining)
  ↓
Phase 7 (SSG & Deploy)
```

Phase 0 is the gate — if the POC fails, we pivot before investing. Phases 2 and 3 can be developed in parallel.

---

## Risks

1. **MDX + Vertz JSX runtime mismatch** — If `@mdx-js/mdx` output doesn't work with Vertz's `jsx()` function (children thunking, Fragment handling), we may need a thin adapter layer. Mitigated by mandatory POC in Phase 0.

2. **SSR Fragment serialization** — The existing SSR renderer doesn't handle `tag: 'fragment'`. Mitigated by prerequisite fix before Phase 0 POC.

3. **Scope creep into full docs migration** — The temptation to migrate all Mintlify content. Explicitly out of scope — we link to Mintlify from the component site header.

4. **Content volume** — ~45 component pages is significant work. Mitigated by consistent template, file-based examples (reusing existing demos), and centralized prop data.

5. **Prop data staleness** — Manual prop definitions may drift from actual types. Mitigated by centralization (one file per component) and future CI validation. Pre-v1 breaking changes are frequent, but centralized data files make updates a single-file change.
