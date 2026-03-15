import { css } from '@vertz/ui';
import type { Project } from '../lib/types';

const styles = css({
  card: [
    'bg:card',
    'rounded:lg',
    'border:1',
    'border:border',
    'p:4',
    'cursor:pointer',
    'transition:colors',
    'hover:bg:accent',
    'hover:border:accent',
  ],
  name: ['font:medium', 'text:foreground', 'mb:1'],
  key: ['text:xs', 'text:muted-foreground'],
  description: ['text:sm', 'text:muted-foreground', 'mt:2'],
});

export function ProjectCard({ project }: { project: Project }) {
  return (
    <div class={styles.card}>
      <div class={styles.name}>{project.name}</div>
      <div class={styles.key}>{project.key}</div>
      {project.description && <p class={styles.description}>{project.description}</p>}
    </div>
  );
}
