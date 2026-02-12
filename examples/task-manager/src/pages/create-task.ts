/**
 * Create Task page — wraps the TaskForm in a page layout.
 *
 * Demonstrates:
 * - Simple page composition
 * - Navigation after successful form submission
 */

import { css } from '@vertz/ui';
import { TaskForm } from '../components/task-form';

const pageStyles = css({
  page: ['max-w:lg', 'mx:auto'],
  title: ['font:2xl', 'font:bold', 'text:foreground', 'mb:6'],
});

export interface CreateTaskPageProps {
  navigate: (url: string) => void;
}

/**
 * Render the create-task page.
 */
export function CreateTaskPage(props: CreateTaskPageProps): HTMLElement {
  const { navigate } = props;

  const page = document.createElement('div');
  page.className = pageStyles.classNames.page;
  page.setAttribute('data-testid', 'create-task-page');

  const title = document.createElement('h1');
  title.className = pageStyles.classNames.title;
  title.textContent = 'Create New Task';

  const form = TaskForm({
    onSuccess: () => {
      // Navigate back to the task list after successful creation
      navigate('/');
    },
    onCancel: () => {
      navigate('/');
    },
  });

  page.appendChild(title);
  page.appendChild(form);

  return page;
}
