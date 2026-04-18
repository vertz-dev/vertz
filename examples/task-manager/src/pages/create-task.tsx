/**
 * Create Task page — wraps the TaskForm in a page layout.
 *
 * Demonstrates:
 * - JSX for simple page composition
 * - Component embedding via JSX syntax
 * - Navigation after successful form submission
 */

import { css, token, useRouter } from '@vertz/ui';
import { TaskForm } from '../components/task-form';

const pageStyles = css({
  page: { maxWidth: '32rem', marginInline: 'auto' },
  title: {
    fontSize: token.font.size['2xl'],
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
    marginBottom: token.spacing[6],
  },
});

/**
 * Render the create-task page.
 *
 * Navigation is accessed via useRouter() context.
 */
export function CreateTaskPage() {
  const { navigate } = useRouter();

  return (
    <div className={pageStyles.page} data-testid="create-task-page">
      <h1 className={pageStyles.title}>Create New Task</h1>
      <TaskForm onSuccess={() => navigate({ to: '/' })} onCancel={() => navigate({ to: '/' })} />
    </div>
  );
}
