import { AppLayout } from './layouts/AppLayout';
import { IssuePage } from './pages/IssuePage';
import { IssueRow } from './components/IssueRow';
import { PriorityIcon } from './components/PriorityIcon';
import { Avatar } from './components/Avatar';

export function App() {
  let activePath = '/';

  return (
    <div id="root" class="app-container">
      <AppLayout activePath={activePath}>
        <IssuePage />
      </AppLayout>
    </div>
  );
}
