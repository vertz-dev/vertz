import { Link, Outlet, css, query, token, useParams } from '@vertz/ui';
import { api } from '../api/client';

const styles = css({
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    marginBottom: token.spacing[4],
  },
  breadcrumb: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
  separator: { fontSize: token.font.size.sm, color: token.color['muted-foreground'] },
  title: {
    fontSize: token.font.size.xl,
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
  },
});

export function ProjectLayout() {
  const { projectId } = useParams<'/projects/:projectId'>();
  const project = query(api.projects.get(projectId));

  return (
    <div>
      <header className={styles.header}>
        <Link href="/projects" className={styles.breadcrumb}>
          Projects
        </Link>
        <span className={styles.separator}>/</span>
        <h1 className={styles.title}>{project.data?.name ?? 'Loading...'}</h1>
      </header>
      <Outlet />
    </div>
  );
}
