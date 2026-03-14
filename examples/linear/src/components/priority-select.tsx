import { css } from '@vertz/ui';
import type { IssuePriority } from '../lib/types';

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

const priorityOptions: { value: IssuePriority; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

interface PrioritySelectProps {
  value: IssuePriority;
  onChange: (priority: IssuePriority) => void;
}

export function PrioritySelect({ value, onChange }: PrioritySelectProps) {
  return (
    <div class={styles.container}>
      <label class={styles.label} htmlFor="issue-priority-select">
        Priority
      </label>
      <select
        class={styles.select}
        id="issue-priority-select"
        value={value}
        onChange={(e: Event) => {
          onChange((e.target as HTMLSelectElement).value as IssuePriority);
        }}
      >
        {priorityOptions.map((opt) => (
          <option value={opt.value} key={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
