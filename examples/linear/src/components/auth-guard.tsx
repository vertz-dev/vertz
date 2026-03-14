/**
 * WorkspaceShell — sidebar layout for authenticated pages.
 *
 * Route protection is handled by ProtectedRoute in router.tsx.
 * This component only handles the authenticated layout.
 */

import { css, Link, Outlet, query } from '@vertz/ui';
import { useAuth } from '@vertz/ui/auth';
import { projectApi } from '../api/client';

const sidebarStyles = css({
  shell: ['flex', 'min-h:screen', 'bg:background'],
  sidebar: ['w:56', 'bg:card', 'border-r:1', 'border:border', 'p:4', 'flex', 'flex-col'],
  main: ['flex-1'],
  brand: ['font:lg', 'font:bold', 'text:foreground', 'mb:6'],
  nav: ['flex', 'flex-col', 'gap:1', 'mb:auto'],
  navItem: ['text:sm', 'text:muted-foreground', 'py:1'],
  projectLink: ['text:sm', 'text:muted-foreground', 'py:1', 'pl:3', 'truncate'],
  userSection: ['mt:auto', 'pt:4', 'border-t:1', 'border:border', 'flex', 'items:center', 'gap:2'],
  avatar: ['w:8', 'h:8', 'rounded:full'],
  userName: ['text:sm', 'font:medium', 'text:foreground', 'flex-1'],
  signOutButton: [
    'text:xs',
    'text:muted-foreground',
    'cursor:pointer',
    'bg:transparent',
    'border:0',
    'p:0',
  ],
});

export function WorkspaceShell() {
  const auth = useAuth();
  const projects = query(projectApi.list());

  const handleSignOut = async () => {
    await auth.signOut({ redirectTo: '/login' });
  };

  return (
    <div class={sidebarStyles.shell}>
      <aside class={sidebarStyles.sidebar} data-testid="sidebar">
        <div class={sidebarStyles.brand}>Linear Clone</div>
        <nav class={sidebarStyles.nav}>
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
        <div class={sidebarStyles.userSection}>
          {auth.user?.avatarUrl && (
            <img
              class={sidebarStyles.avatar}
              src={auth.user.avatarUrl}
              alt=""
              data-testid="user-avatar"
            />
          )}
          <span class={sidebarStyles.userName} data-testid="user-name">
            {auth.user?.name ?? auth.user?.email}
          </span>
          <button
            type="button"
            class={sidebarStyles.signOutButton}
            onClick={handleSignOut}
            data-testid="sign-out"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main class={sidebarStyles.main}>
        <Outlet />
      </main>
    </div>
  );
}
