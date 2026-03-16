import { css } from '@vertz/ui';
import { STATUSES } from '../lib/issue-config';
import type { IssueStatus } from '../lib/types';
import { formStyles, labelStyles } from '../styles/components';

const styles = css({
  container: ['flex', 'flex-col', 'gap:1'],
});

interface StatusSelectProps {
  value: IssueStatus;
  onChange: (status: IssueStatus) => void;
}

export function StatusSelect({ value, onChange }: StatusSelectProps) {
  return (
    <div className={styles.container}>
      <label className={labelStyles.base} htmlFor="issue-status-select">
        Status
      </label>
      <select
        className={formStyles.select}
        id="issue-status-select"
        data-testid="status-select"
        value={value}
        onChange={(e: Event) => {
          onChange((e.target as HTMLSelectElement).value as IssueStatus);
        }}
      >
        {STATUSES.map((opt) => (
          <option value={opt.value} key={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
