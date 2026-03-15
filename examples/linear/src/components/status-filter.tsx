import { css } from '@vertz/ui';
import { STATUSES } from '../lib/issue-config';

const styles = css({
  container: ['flex', 'gap:1', 'mb:4'],
  button: [
    'px:3',
    'py:1',
    'text:xs',
    'rounded:full',
    'border:1',
    'border:border',
    'cursor:pointer',
    'bg:transparent',
    'text:muted-foreground',
    'transition:colors',
    'hover:bg:accent',
    'hover:text:foreground',
  ],
  active: [
    'px:3',
    'py:1',
    'text:xs',
    'rounded:full',
    'border:1',
    'border:primary',
    'cursor:pointer',
    'bg:primary',
    'text:primary-foreground',
  ],
});

const filterStatuses = [{ value: 'all', label: 'All' }, ...STATUSES];

interface StatusFilterProps {
  value: string;
  onChange: (status: string) => void;
}

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <div class={styles.container}>
      {filterStatuses.map((s) => (
        <button
          type="button"
          class={s.value === value ? styles.active : styles.button}
          aria-pressed={s.value === value ? 'true' : 'false'}
          onClick={() => onChange(s.value)}
          key={s.value}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
