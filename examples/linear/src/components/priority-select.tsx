import { css } from '@vertz/ui';
import type { IssuePriority } from '../lib/types';
import { formStyles, labelStyles } from '../styles/components';

const styles = css({
  container: ['flex', 'flex-col', 'gap:1'],
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
    <div className={styles.container}>
      <label className={labelStyles.base} htmlFor="issue-priority-select">
        Priority
      </label>
      <select
        className={formStyles.select}
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
