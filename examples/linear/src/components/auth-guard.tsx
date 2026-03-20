/**
 * WorkspaceShell — sidebar layout for authenticated pages.
 *
 * Route protection is handled by ProtectedRoute in router.tsx.
 * This component only handles the authenticated layout.
 */

import { css, isBrowser, Link, Outlet, onMount, query } from '@vertz/ui';
import { useAuth } from '@vertz/ui/auth';
import { Button } from '@vertz/ui/components';
import { api } from '../api/client';
import { SEED_WORKSPACE_ID } from '../lib/constants';

const sidebarStyles = css({
  shell: ['flex', 'min-h:screen', 'bg:background'],
  sidebar: ['w:56', 'bg:card', 'border-r:1', 'border:border', 'p:4', 'flex', 'flex-col'],
  main: ['flex-1'],
  brand: ['font:lg', 'font:bold', 'text:foreground', 'mb:6'],
  nav: ['flex', 'flex-col', 'gap:1', 'mb:auto'],
  navItem: [
    'text:sm',
    'text:muted-foreground',
    'py:1.5',
    'px:2',
    'rounded:md',
    'transition:colors',
    'hover:text:foreground',
    'hover:bg:accent',
  ],
  projectLink: [
    'text:sm',
    'text:muted-foreground',
    'py:1',
    'px:2',
    'pl:4',
    'rounded:md',
    'overflow-hidden',
    'whitespace-nowrap',
    'transition:colors',
    'hover:text:foreground',
    'hover:bg:accent',
  ],
  userSection: ['mt:auto', 'pt:4', 'border-t:1', 'border:border', 'flex', 'items:center', 'gap:2'],
  avatar: ['w:8', 'h:8', 'rounded:full'],
  userName: ['text:sm', 'font:medium', 'text:foreground', 'flex-1'],
  signOutButton: ['text:xs'],
});

export function WorkspaceShell() {
  const auth = useAuth();
  const projects = query(api.projects.list());

  // Auto-switch to seed workspace on first login.
  // OAuth creates the session without a tenantId — tenant-scoped APIs
  // return 403 until switch-tenant is called. The sessionStorage flag
  // prevents infinite reload loops: we only attempt one switch per page load.
  if (isBrowser()) {
    onMount(async () => {
      const resp = await fetch('/api/auth/session');
      const data = await resp.json();
      const tenantId = data.session?.payload?.tenantId;
      if (tenantId) {
        // Session has a tenant — nothing to do.
        sessionStorage.removeItem('__vertz_tenant_switched');
        return;
      }
      if (data.session && !tenantId) {
        // Guard: only attempt switch once per page load to prevent reload loop.
        if (sessionStorage.getItem('__vertz_tenant_switched')) return;
        sessionStorage.setItem('__vertz_tenant_switched', '1');
        const result = await api.auth.switchTenant({ tenantId: SEED_WORKSPACE_ID });
        if (result.ok) {
          window.location.reload();
        }
      }
    });
  }

  const handleSignOut = async () => {
    await auth.signOut({ redirectTo: '/login' });
  };

  return (
    <div className={sidebarStyles.shell}>
      <aside className={sidebarStyles.sidebar} data-testid="sidebar">
        <div className={sidebarStyles.brand}>Linear Clone</div>
        <nav className={sidebarStyles.nav}>
          <Link href="/projects" className={sidebarStyles.navItem}>
            Projects
          </Link>
          {projects.data?.items.map((project) => (
            <Link
              href={`/projects/${project.id}`}
              className={sidebarStyles.projectLink}
              key={project.id}
            >
              {`${project.key} — ${project.name}`}
            </Link>
          ))}
        </nav>
        <div className={sidebarStyles.userSection}>
          {auth.user?.avatarUrl && (
            <img
              className={sidebarStyles.avatar}
              src={auth.user.avatarUrl}
              alt=""
              data-testid="user-avatar"
            />
          )}
          <span className={sidebarStyles.userName} data-testid="user-name">
            {auth.user?.name ?? auth.user?.email}
          </span>
          <span data-testid="sign-out">
            <Button
              intent="ghost"
              size="xs"
              className={sidebarStyles.signOutButton}
              onClick={handleSignOut}
            >
              Sign out
            </Button>
          </span>
        </div>
      </aside>
      <main className={sidebarStyles.main}>
        <Outlet />
      </main>
    </div>
  );
}
