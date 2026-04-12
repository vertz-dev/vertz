# Phase 2: Validation — Linear Clone Refactor + Docs

## Context

AppShell primitive + theme were implemented in Phase 1. This phase validates the API by refactoring the existing Linear clone's manual layout to use `AppShell`, then adds documentation and a changeset.

Design doc: `plans/1661-appshell-layout.md`

## Tasks

### Task 1: Refactor Linear clone to use AppShell

**Files:** (2)
- `examples/linear/src/components/auth-guard.tsx` (modified — rewrite to use AppShell)
- `examples/linear/src/styles/theme.ts` (modified — if theme registration needed)

**What to implement:**

Rewrite `auth-guard.tsx` (currently named `WorkspaceShell`) to use the new `AppShell` component:

**Before (manual layout):**
```tsx
export function WorkspaceShell() {
  // ... manual css() styles, manual sidebar structure
  return (
    <div className={sidebarStyles.shell}>
      <aside className={sidebarStyles.sidebar}>
        <div className={sidebarStyles.brand}>Linear Clone</div>
        <nav className={sidebarStyles.nav}>
          <Link href="/projects" className={sidebarStyles.navItem}>Projects</Link>
          {projects.data?.items.map(...)}
        </nav>
        <div className={sidebarStyles.userSection}>...</div>
      </aside>
      <main className={sidebarStyles.main}><Outlet /></main>
    </div>
  );
}
```

**After (using AppShell):**
```tsx
import { AppShell } from '@vertz/ui/components';
import { Outlet, Link, css } from '@vertz/ui';

export function WorkspaceShell() {
  const auth = useAuth();
  const projects = query(api.projects.list());

  return (
    <AppShell>
      <AppShell.Sidebar>
        <AppShell.Brand>Linear Clone</AppShell.Brand>
        <AppShell.Nav>
          <AppShell.NavItem href="/projects">Projects</AppShell.NavItem>
          {projects.data?.items.map((project) => (
            <Link href={`/projects/${project.id}`} className={projectLinkStyle} key={project.id}>
              {`${project.key} — ${project.name}`}
            </Link>
          ))}
        </AppShell.Nav>
        <AppShell.User>
          {auth.user?.avatarUrl && <img src={auth.user.avatarUrl} alt="" />}
          <span>{auth.user?.name ?? auth.user?.email}</span>
          <Button intent="ghost" size="xs" onClick={handleSignOut}>Sign out</Button>
        </AppShell.User>
      </AppShell.Sidebar>
      <AppShell.Content>
        <Outlet />
      </AppShell.Content>
    </AppShell>
  );
}
```

Key changes:
- Remove manual `css()` styles for shell/sidebar/nav (AppShell provides these)
- Keep custom `projectLinkStyle` for the dynamic project links (these aren't NavItems)
- Keep all app-specific logic (auth, projects query, sign-out handler)
- Keep data-testid attributes if present

Verify the example still renders correctly (typecheck + lint).

**Acceptance criteria:**
- [ ] `auth-guard.tsx` uses `AppShell` and sub-components
- [ ] Dynamic project links still render inside `AppShell.Nav`
- [ ] User section with avatar, name, sign-out still works
- [ ] Manual sidebar CSS styles are removed (replaced by AppShell theme)
- [ ] `vtz run typecheck` passes for examples/linear
- [ ] `vtz run lint` passes

---

### Task 2: Documentation + changeset

**Files:** (2)
- `packages/mint-docs/` (new/modified — AppShell docs page)
- `.changeset/appshell-layout.md` (new)

**What to implement:**

1. **Documentation** — Add an AppShell page to mint-docs showing:
   - Basic usage (sidebar + content + Outlet)
   - NavItem with icons and active state
   - Dynamic content alongside NavItems
   - User section pattern
   - Route integration example

2. **Changeset** — Create `.changeset/appshell-layout.md`:
   ```md
   ---
   '@vertz/ui-primitives': patch
   '@vertz/theme-shadcn': patch
   '@vertz/ui': patch
   ---
   
   feat(ui): add AppShell layout component for SaaS apps (#1661)
   ```

Note: No changeset for `examples/linear` — it's a private package, not published to npm.

**Acceptance criteria:**
- [ ] AppShell docs page exists with usage examples
- [ ] Changeset file references all three affected packages
- [ ] Full quality gates pass: `vtz test && vtz run typecheck && vtz run lint`
