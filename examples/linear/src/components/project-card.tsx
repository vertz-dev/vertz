import { css, token } from '@vertz/ui';
import type { Project } from '../lib/types';

const styles = css({
  card: {
    backgroundColor: token.color.card,
    borderRadius: token.radius.lg,
    borderWidth: '1px',
    borderColor: token.color.border,
    padding: token.spacing[4],
    cursor: 'pointer',
    transition: 'colors',
    '&:hover': { backgroundColor: token.color.accent, borderColor: token.color.accent },
  },
  name: {
    fontWeight: token.font.weight.medium,
    color: token.color.foreground,
    marginBottom: token.spacing[1],
  },
  key: { fontSize: token.font.size.xs, color: token.color['muted-foreground'] },
  description: {
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    marginTop: token.spacing[2],
  },
});

export function ProjectCard({ project }: { project: Project }) {
  return (
    <div className={styles.card} data-testid={`project-card-${project.id}`}>
      <div className={styles.name} data-testid="project-name">
        {project.name}
      </div>
      <div className={styles.key}>{project.key}</div>
      {project.description && <p className={styles.description}>{project.description}</p>}
    </div>
  );
}
