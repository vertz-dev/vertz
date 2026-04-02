import { TaskListPage } from './pages/TaskList';
import { TaskCard } from './components/TaskCard';
import { StatusBadge } from './components/StatusBadge';

export function App() {
  let currentPage = 'list';

  return (
    <div id="root">
      <header class="app-header">
        <h1>Task Manager</h1>
        <nav>
          <a href="/tasks" onClick={() => { currentPage = 'list'; }}>Tasks</a>
          <a href="/settings" onClick={() => { currentPage = 'settings'; }}>Settings</a>
        </nav>
      </header>
      <main class="app-main">
        <TaskListPage />
      </main>
    </div>
  );
}
