import { css, Link, query } from '@vertz/ui';
import { projectApi } from '../api/client';
import { CreateProjectDialog } from '../components/create-project-dialog';
import { ProjectCard } from '../components/project-card';

const styles = css({
  container: ['p:6'],
  header: ['flex', 'items:center', 'justify:between', 'mb:6'],
  title: ['font:xl', 'font:bold', 'text:foreground'],
  newBtn: [
    'px:4',
    'py:2',
    'text:sm',
    'rounded:md',
    'bg:primary.600',
    'text:white',
    'border:0',
    'cursor:pointer',
  ],
  grid: ['grid', 'grid-cols:1', 'gap:3'],
  empty: ['flex', 'flex-col', 'items:center', 'justify:center', 'py:16', 'text:center'],
  emptyTitle: ['font:lg', 'font:semibold', 'text:foreground', 'mb:2'],
  emptyDescription: ['text:sm', 'text:muted-foreground'],
  loading: ['text:sm', 'text:muted-foreground', 'py:8', 'text:center'],
});

export function ProjectsPage() {
  const projects = query(projectApi.list());
  let showCreateDialog = false;

  return (
    <div class={styles.container}>
      <header class={styles.header}>
        <h1 class={styles.title}>Projects</h1>
        <button
          type="button"
          class={styles.newBtn}
          onClick={() => {
            showCreateDialog = true;
          }}
        >
          New Project
        </button>
      </header>

      {projects.loading && <div class={styles.loading}>Loading projects...</div>}

      {!projects.loading && projects.data?.items.length === 0 && (
        <div class={styles.empty} data-testid="projects-empty">
          <h2 class={styles.emptyTitle}>No projects yet</h2>
          <p class={styles.emptyDescription}>Create your first project to get started.</p>
        </div>
      )}

      <div class={styles.grid}>
        {projects.data?.items.map((project) => (
          <Link href={`/projects/${project.id}`} key={project.id}>
            <ProjectCard project={project} />
          </Link>
        ))}
      </div>

      {showCreateDialog && (
        <CreateProjectDialog
          onClose={() => {
            showCreateDialog = false;
          }}
          onSuccess={() => {
            showCreateDialog = false;
            projects.refetch();
          }}
        />
      )}
    </div>
  );
}
