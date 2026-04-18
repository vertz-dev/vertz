/**
 * WorkspaceShell — sidebar layout for authenticated pages.
 *
 * Route protection is handled by ProtectedRoute in router.tsx.
 * This component only handles the authenticated layout.
 */

import { Link, Outlet, css, query, token } from '@vertz/ui';
import { useAuth } from '@vertz/ui/auth';
import { AppShell, Button } from '@vertz/ui/components';
import { api } from '../api/client';

const styles = css({
  projectLink: {
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    paddingBlock: token.spacing[1],
    paddingInline: token.spacing[2],
    paddingLeft: token.spacing[4],
    borderRadius: token.radius.md,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    transition: 'colors',
    '&:hover': { color: token.color.foreground, backgroundColor: token.color.accent },
  },
  avatar: { width: token.spacing[8], height: token.spacing[8], borderRadius: token.radius.full },
  userName: {
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
    color: token.color.foreground,
    flex: '1 1 0%',
  },
  signOutButton: { fontSize: token.font.size.xs },
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
          {typeof auth.user?.avatarUrl === 'string' ? (
            <img
              className={styles.avatar}
              src={auth.user.avatarUrl as string}
              alt=""
              data-testid="user-avatar"
            />
          ) : null}
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
