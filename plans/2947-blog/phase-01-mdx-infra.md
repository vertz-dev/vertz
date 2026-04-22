# Phase 1: MDX Infrastructure + Minimal Routes

**Issue:** [#2947](https://github.com/vertz-dev/vertz/issues/2947)
**Design doc:** [`plans/2947-blog.md`](../2947-blog.md)
**Estimate:** 0.5 day

## Context

First vertical slice: prove the MDX pipeline renders a `.mdx` file from `content/blog/` at `/blog/<slug>`. No styling, no layout components — just raw HTML output. Establishes the foundation all other phases build on.

## Outcome

A `.mdx` file dropped into `packages/landing/content/blog/` becomes a reachable URL at `https://localhost:<port>/blog/<slug>` in dev, rendering its compiled HTML with no styling.

---

## Tasks

### Task 1: Register MDX plugin in landing build

**Files:** (1)
- `packages/landing/build.config.ts` (modified)

**What to implement:**
Add `createMdxPlugin()` from `@vertz/mdx` to the landing's build config plugins array. Add `@vertz/mdx` to `packages/landing/package.json` dependencies (workspace).

**Acceptance criteria:**
- [ ] `vtz build` succeeds in `packages/landing/` with a `.mdx` file present in `content/blog/`
- [ ] Build output includes the compiled `.mdx` as a JS module

---

### Task 2: Post loader + types

**Files:** (3)
- `packages/landing/src/blog/types.ts` (new)
- `packages/landing/src/blog/load-posts.ts` (new)
- `packages/landing/src/blog/__tests__/load-posts.test.ts` (new)

**What to implement:**

`types.ts` — `PostMeta` type:
```ts
export interface PostMeta {
  slug: string;
  title: string;
  date: string;           // ISO YYYY-MM-DD
  author: string;         // author key, looked up separately
  tags: string[];
  description: string;
  cover?: string;
  draft: boolean;
  readingTime: number;    // minutes
}

export interface Author {
  key: string;
  name: string;
  avatar: string;
  bio: string;
  twitter: string;
}

export interface LoadedPost {
  meta: PostMeta;
  Component: () => unknown;   // MDX default export
}
```

`load-posts.ts` — reads `content/blog/*.mdx` eagerly (via `import.meta.glob` pattern supported by vtz), parses frontmatter, computes `readingTime` (word count / 220 wpm). Filters out `draft: true` when `process.env.NODE_ENV === 'production'`. Sorts by `date` desc.

Exports:
- `getAllPosts(): LoadedPost[]`
- `getPostBySlug(slug: string): LoadedPost | null`
- `loadAuthor(key: string): Author`

**Acceptance criteria:**
- [ ] Given a `.mdx` file with frontmatter, `getAllPosts()` returns `LoadedPost` with typed `meta`
- [ ] Given `draft: true` + `NODE_ENV=production`, the post is filtered out
- [ ] Given `draft: true` + `NODE_ENV=development`, the post is included
- [ ] `readingTime` is computed from word count (validate with a 440-word fixture → 2)
- [ ] Posts sort by `date` descending

---

### Task 3: Routes `/blog` and `/blog/:slug` (minimal)

**Files:** (3)
- `packages/landing/src/pages/blog/index.tsx` (new)
- `packages/landing/src/pages/blog/post.tsx` (new)
- `packages/landing/src/app.tsx` (modified)

**What to implement:**

`pages/blog/index.tsx` — minimal listing: unordered list of post titles linked to `/blog/<slug>`. No styling.

`pages/blog/post.tsx` — reads slug via `useParams<'/blog/:slug'>()`, calls `getPostBySlug`, renders `<post.Component />`. Returns 404-like message if not found.

`app.tsx` — register routes:
```ts
export const routes = defineRoutes({
  '/': { component: () => <HomePage /> },
  '/manifesto': { component: () => <ManifestoPage /> },
  '/openapi': { component: () => <OpenAPIPage /> },
  '/blog': { component: () => <BlogListPage /> },
  '/blog/:slug': { component: () => <BlogPostPage /> },
});
```

**Acceptance criteria:**
- [ ] `vtz dev` in `packages/landing/` starts without errors when a sample `.mdx` exists
- [ ] Navigating to `/blog` shows a list of post titles
- [ ] Navigating to `/blog/<slug>` renders the compiled MDX (unstyled)
- [ ] Unknown slug renders a "post not found" message (no crash)

---

### Task 4: Sample `.mdx` fixture for development

**Files:** (2)
- `packages/landing/content/blog/2026-04-22-hello-world.mdx` (new)
- `packages/landing/content/blog/authors/matheus.json` (new)

**What to implement:**

Sample post with all frontmatter fields populated and a mix of content (h1 not rendered — comes from layout later; h2, p, `code`, `ul`). Used as a dev fixture and later replaced in Phase 7.

Author JSON for `matheus` key.

**Acceptance criteria:**
- [ ] File exists and loads via `getAllPosts()`
- [ ] Author lookup returns `Matheus Poleza`

---

## Phase Definition of Done

- [ ] All tasks complete, acceptance criteria checked
- [ ] `vtz test` passes in `packages/landing` and `packages/mdx`
- [ ] `vtz run typecheck` passes
- [ ] `vtz run lint` passes
- [ ] `.mdx` file in `content/blog/` reachable at `/blog/<slug>` in dev
- [ ] Phase review file created at `reviews/2947-blog/phase-01-mdx-infra.md`
