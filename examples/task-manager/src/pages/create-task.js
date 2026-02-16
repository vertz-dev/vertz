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
const pageStyles = css({
    page: ['max-w:lg', 'mx:auto'],
    title: ['font:2xl', 'font:bold', 'text:foreground', 'mb:6'],
});
/**
 * Render the create-task page.
 */
export function CreateTaskPage(props) {
    const { navigate } = props;
    return (<div class={pageStyles.classNames.page} data-testid="create-task-page">
      <h1 class={pageStyles.classNames.title}>Create New Task</h1>
      <TaskForm onSuccess={() => navigate('/')} onCancel={() => navigate('/')}/>
    </div>);
}
//# sourceMappingURL=create-task.js.map