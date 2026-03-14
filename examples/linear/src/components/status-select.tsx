import { css } from '@vertz/ui';
import type { IssueStatus } from '../lib/types';

const styles = css({
  container: ['flex', 'flex-col', 'gap:1'],
  label: ['text:xs', 'font:medium', 'text:muted-foreground'],
  select: [
    'bg:background',
    'border:1',
    'border:border',
    'rounded:md',
    'px:3',
    'py:1.5',
    'text:sm',
    'text:foreground',
    'cursor:pointer',
  ],
});

const statusOptions: { value: IssueStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface StatusSelectProps {
  value: IssueStatus;
  onChange: (status: IssueStatus) => void;
}

export function StatusSelect({ value, onChange }: StatusSelectProps) {
  return (
    <div class={styles.container}>
      <label class={styles.label} htmlFor="issue-status-select">
        Status
      </label>
      <select
        class={styles.select}
        id="issue-status-select"
        value={value}
        onChange={(e: Event) => {
          onChange((e.target as HTMLSelectElement).value as IssueStatus);
        }}
      >
        {statusOptions.map((opt) => (
          <option value={opt.value} key={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
