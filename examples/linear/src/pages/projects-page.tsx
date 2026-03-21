import { css, Link, query, useDialogStack } from '@vertz/ui';
import { Button, EmptyState } from '@vertz/ui/components';
import { api } from '../api/client';
import { CreateProjectDialog } from '../components/create-project-dialog';
import { ProjectGridSkeleton } from '../components/loading-skeleton';
import { ProjectCard } from '../components/project-card';
import type { Project } from '../lib/types';

const styles = css({
  container: ['p:6'],
  header: ['flex', 'items:center', 'justify:between', 'mb:6'],
  title: ['font:xl', 'font:bold', 'text:foreground'],
  grid: ['grid', 'grid-cols:1', 'gap:3'],
});

export function ProjectsPage() {
  const projects = query(api.projects.list());
  const stack = useDialogStack();

  const handleNewProject = async () => {
    await stack.open(CreateProjectDialog, {});
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Projects</h1>
        <Button intent="primary" size="sm" onClick={handleNewProject}>
          New Project
        </Button>
      </header>

      {projects.loading && <ProjectGridSkeleton />}

      {!projects.loading && projects.data?.items.length === 0 && (
        <EmptyState data-testid="projects-empty">
          <EmptyState.Title>No projects yet</EmptyState.Title>
          <EmptyState.Description>Create your first project to get started.</EmptyState.Description>
        </EmptyState>
      )}

      <div className={styles.grid}>
        {projects.data?.items.map((project) => (
          <Link href={`/projects/${project.id}`} key={project.id}>
            <ProjectCard project={project as Project} />
          </Link>
        ))}
      </div>
    </div>
  );
}
