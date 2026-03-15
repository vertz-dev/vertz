import { css, Link, Outlet, query, useParams } from '@vertz/ui';
import { api } from '../api/client';

const styles = css({
  header: ['flex', 'items:center', 'gap:2', 'mb:4'],
  breadcrumb: ['text:sm', 'text:muted-foreground'],
  separator: ['text:sm', 'text:muted-foreground'],
  title: ['font:xl', 'font:bold', 'text:foreground'],
});

export function ProjectLayout() {
  const { projectId } = useParams<'/projects/:projectId'>();
  const project = query(api.projects.get(projectId));

  return (
    <div>
      <header class={styles.header}>
        <Link href="/projects" class={styles.breadcrumb}>
          Projects
        </Link>
        <span class={styles.separator}>/</span>
        <h1 class={styles.title}>{project.data?.name ?? 'Loading...'}</h1>
      </header>
      <Outlet />
    </div>
  );
}
