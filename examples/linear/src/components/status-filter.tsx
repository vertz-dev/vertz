import { css, token } from '@vertz/ui';
import { STATUSES } from '../lib/issue-config';

const styles = css({
  container: { display: 'flex', gap: token.spacing[1], marginBottom: token.spacing[4] },
  button: {
    paddingInline: token.spacing[3],
    paddingBlock: token.spacing[1],
    fontSize: token.font.size.xs,
    borderRadius: token.radius.full,
    borderWidth: '1px',
    borderColor: token.color.border,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: token.color['muted-foreground'],
    transition: 'colors',
    '&:hover': { backgroundColor: token.color.accent, color: token.color.foreground },
  },
  active: {
    paddingInline: token.spacing[3],
    paddingBlock: token.spacing[1],
    fontSize: token.font.size.xs,
    borderRadius: token.radius.full,
    borderWidth: '1px',
    borderColor: token.color.primary,
    cursor: 'pointer',
    backgroundColor: token.color.primary,
    color: token.color['primary-foreground'],
  },
});

const filterStatuses = [{ value: 'all', label: 'All' }, ...STATUSES];

interface StatusFilterProps {
  value: string;
  onChange: (status: string) => void;
}

export function StatusFilter({ value, onChange }: StatusFilterProps) {
  return (
    <div className={styles.container}>
      {filterStatuses.map((s) => (
        <button
          type="button"
          className={s.value === value ? styles.active : styles.button}
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
