import { PriorityIcon } from './PriorityIcon';
import { Avatar } from './Avatar';

interface Issue {
  id: string;
  identifier: string;
  title: string;
  priority: 0 | 1 | 2 | 3 | 4;
  status: 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled';
  assignee?: { name: string; avatarUrl?: string };
}

interface IssueRowProps {
  issue: Issue;
  onSelect?: (id: string) => void;
}

export function IssueRow({ issue, onSelect }: IssueRowProps) {
  let isHovered = false;

  return (
    <div
      class={`issue-row ${isHovered ? 'issue-row-hover' : ''}`}
      onMouseEnter={() => { isHovered = true; }}
      onMouseLeave={() => { isHovered = false; }}
      onClick={() => onSelect?.(issue.id)}
    >
      <PriorityIcon priority={issue.priority} />
      <span class="issue-identifier">{issue.identifier}</span>
      <span class="issue-title">{issue.title}</span>
      {issue.assignee && (
        <Avatar name={issue.assignee.name} url={issue.assignee.avatarUrl} />
      )}
    </div>
  );
}
