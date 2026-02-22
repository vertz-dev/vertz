/**
 * Create Task page — wraps the TaskForm in a page layout.
 *
 * Demonstrates:
 * - JSX for simple page composition
 * - Component embedding via JSX syntax
 * - Navigation after successful form submission
 */

import { css } from '@vertz/ui';
import { TaskForm } from '../components/task-form';
import { useAppRouter } from '../router';

const pageStyles = css({
  page: ['max-w:lg', 'mx:auto'],
  title: ['font:2xl', 'font:bold', 'text:foreground', 'mb:6'],
});

/**
 * Render the create-task page.
 *
 * Navigation is accessed via useAppRouter() context.
 */
export function CreateTaskPage() {
  const { navigate } = useAppRouter();
  return (
    <div class={pageStyles.page} data-testid="create-task-page">
      <h1 class={pageStyles.title}>Create New Task</h1>
      <TaskForm onSuccess={() => navigate('/')} onCancel={() => navigate('/')} />
    </div>
  );
}
