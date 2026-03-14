import { css } from '@vertz/ui';

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

const statuses = [
  { value: 'all', label: 'All' },
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface StatusFilterProps {
  value: string;
  onChange: (status: string) => void;
}

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <div class={styles.container}>
      {statuses.map((s) => (
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
