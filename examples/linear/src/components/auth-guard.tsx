/**
 * WorkspaceShell — sidebar layout for authenticated pages.
 *
 * Route protection is handled by ProtectedRoute in router.tsx.
 * This component only handles the authenticated layout.
 */

import { css, Link, Outlet, query } from '@vertz/ui';
import { useAuth } from '@vertz/ui/auth';
import { AppShell, Button } from '@vertz/ui/components';
import { api } from '../api/client';

const styles = css({
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
  avatar: ['w:8', 'h:8', 'rounded:full'],
  userName: ['text:sm', 'font:medium', 'text:foreground', 'flex-1'],
  signOutButton: ['text:xs'],
});

export function WorkspaceShell() {
  const auth = useAuth();
  const projects = query(api.projects.list());

  const handleSignOut = async () => {
    await auth.signOut({ redirectTo: '/login' });
  };

  return (
    <AppShell>
      <AppShell.Sidebar>
        <AppShell.Brand>Linear Clone</AppShell.Brand>
        <AppShell.Nav>
          <AppShell.NavItem href="/projects">Projects</AppShell.NavItem>
          {projects.data?.items.map((project) => (
            <Link href={`/projects/${project.id}`} className={styles.projectLink} key={project.id}>
              {`${project.key} — ${project.name}`}
            </Link>
          ))}
        </AppShell.Nav>
        <AppShell.User>
          {auth.user?.avatarUrl && (
            <img
              className={styles.avatar}
              src={auth.user.avatarUrl}
              alt=""
              data-testid="user-avatar"
            />
          )}
          <span className={styles.userName} data-testid="user-name">
            {auth.user?.name ?? auth.user?.email}
          </span>
          <Button intent="ghost" size="xs" className={styles.signOutButton} onClick={handleSignOut}>
            Sign out
          </Button>
        </AppShell.User>
      </AppShell.Sidebar>
      <AppShell.Content>
        <Outlet />
      </AppShell.Content>
    </AppShell>
  );
}
