/**
 * Projects page — empty state for Phase 0.
 *
 * Shows a "No projects yet" message. Real project list added in Phase 1.
 */

import { css } from '@vertz/ui';

const styles = css({
  container: ['flex', 'flex-col', 'items:center', 'justify:center', 'py:16', 'text:center'],
  title: ['font:lg', 'font:semibold', 'text:foreground', 'mb:2'],
  description: ['text:sm', 'text:muted-foreground'],
});

export function ProjectsPage() {
  return (
    <div class={styles.container} data-testid="projects-empty">
      <h2 class={styles.title}>No projects yet</h2>
      <p class={styles.description}>Projects will appear here once they are created.</p>
    </div>
  );
}
