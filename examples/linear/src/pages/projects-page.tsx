import { css, Link, query, useDialogStack } from '@vertz/ui';
import { api } from '../api/client';
import { Button } from '../components/button';
import { CreateProjectDialog } from '../components/create-project-dialog';
import { ProjectCard } from '../components/project-card';
import type { Project } from '../lib/types';
import { emptyStateStyles } from '../styles/components';

const styles = css({
  container: ['p:6'],
  header: ['flex', 'items:center', 'justify:between', 'mb:6'],
  title: ['font:xl', 'font:bold', 'text:foreground'],
  grid: ['grid', 'grid-cols:1', 'gap:3'],
  loading: ['text:sm', 'text:muted-foreground', 'py:8', 'text:center'],
});

export function ProjectsPage() {
  const projects = query(api.projects.list());
  const stack = useDialogStack();

  const handleNewProject = async () => {
    try {
      const created = await stack.open(CreateProjectDialog, {});
      if (created) projects.refetch();
    } catch {
      // Dialog dismissed — no action needed
    }
  };

  return (
    <div class={styles.container}>
      <header class={styles.header}>
        <h1 class={styles.title}>Projects</h1>
        <Button intent="primary" size="sm" onClick={handleNewProject}>
          New Project
        </Button>
      </header>

      {projects.loading && <div class={styles.loading}>Loading projects...</div>}

      {!projects.loading && projects.data?.items.length === 0 && (
        <div class={emptyStateStyles.container} data-testid="projects-empty">
          <h2 class={emptyStateStyles.title}>No projects yet</h2>
          <p class={emptyStateStyles.description}>Create your first project to get started.</p>
        </div>
      )}

      <div class={styles.grid}>
        {projects.data?.items.map((project) => (
          <Link href={`/projects/${project.id}`} key={project.id}>
            <ProjectCard project={project as Project} />
          </Link>
        ))}
      </div>
    </div>
  );
}
