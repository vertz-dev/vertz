import { Link, css, query, token, useDialogStack } from '@vertz/ui';
import { api } from '../api/client';
import { Button } from '../components/button';
import { CreateProjectDialog } from '../components/create-project-dialog';
import { ProjectGridSkeleton } from '../components/loading-skeleton';
import { ProjectCard } from '../components/project-card';
import type { Project } from '../lib/types';
import { emptyStateStyles } from '../styles/components';

const styles = css({
  container: { padding: token.spacing[6] },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: token.spacing[6],
  },
  title: {
    fontSize: token.font.size.xl,
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
    gap: token.spacing[3],
  },
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
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Projects</h1>
        <Button intent="primary" size="sm" onClick={handleNewProject}>
          New Project
        </Button>
      </header>

      {projects.loading && <ProjectGridSkeleton />}

      {!projects.loading && projects.data?.items.length === 0 && (
        <div className={emptyStateStyles.container} data-testid="projects-empty">
          <h2 className={emptyStateStyles.title}>No projects yet</h2>
          <p className={emptyStateStyles.description}>Create your first project to get started.</p>
        </div>
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
