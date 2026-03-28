import { IssueRow } from '../components/IssueRow';

interface Issue {
  id: string;
  identifier: string;
  title: string;
  priority: 0 | 1 | 2 | 3 | 4;
  status: 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';
  assignee?: { name: string; avatarUrl?: string };
}

export function IssuePage() {
  let issues: Issue[] = [
    {
      id: '1',
      identifier: 'LIN-1',
      title: 'Implement authentication flow',
      priority: 1,
      status: 'in_progress',
      assignee: { name: 'Alice Johnson' },
    },
    {
      id: '2',
      identifier: 'LIN-2',
      title: 'Design database schema',
      priority: 2,
      status: 'done',
      assignee: { name: 'Bob Smith', avatarUrl: '/avatars/bob.png' },
    },
    {
      id: '3',
      identifier: 'LIN-3',
      title: 'Set up CI/CD pipeline',
      priority: 3,
      status: 'todo',
    },
    {
      id: '4',
      identifier: 'LIN-4',
      title: 'Write API documentation',
      priority: 4,
      status: 'backlog',
    },
  ];

  let selectedIssueId: string | null = null;
  let sortBy = 'priority';

  const sorted = sortBy === 'priority'
    ? [...issues].sort((a: Issue, b: Issue) => a.priority - b.priority)
    : issues;

  return (
    <div class="issue-page">
      <div class="issue-page-header">
        <h1>All Issues</h1>
        <div class="issue-actions">
          <button onClick={() => { sortBy = 'priority'; }}>Sort by Priority</button>
          <button onClick={() => { sortBy = 'status'; }}>Sort by Status</button>
        </div>
      </div>
      <div class="issue-list">
        {sorted.map((issue: Issue) => (
          <IssueRow
            issue={issue}
            onSelect={(id: string) => { selectedIssueId = id; }}
          />
        ))}
      </div>
      {selectedIssueId && (
        <div class="issue-detail-panel">
          <p>Selected: {selectedIssueId}</p>
        </div>
      )}
    </div>
  );
}
