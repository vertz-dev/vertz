import { css, token } from '@vertz/ui';
import type { Label } from '../lib/types';

const styles = css({
  container: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: token.spacing[1],
    marginBottom: token.spacing[4],
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: token.spacing[1],
    paddingInline: token.spacing[2],
    paddingBlock: token.spacing[1],
    fontSize: token.font.size.xs,
    borderRadius: token.radius.full,
    borderWidth: '1px',
    borderColor: token.color.border,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: token.color['muted-foreground'],
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': { backgroundColor: token.color.accent, color: token.color.foreground },
  },
  active: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: token.spacing[1],
    paddingInline: token.spacing[2],
    paddingBlock: token.spacing[1],
    fontSize: token.font.size.xs,
    borderRadius: token.radius.full,
    borderWidth: '1px',
    borderColor: token.color.primary,
    cursor: 'pointer',
    backgroundColor: token.color.primary,
    color: token.color['primary-foreground'],
  },
  dot: {
    width: token.spacing[2],
    height: token.spacing[2],
    borderRadius: token.radius.full,
    flexShrink: '0',
  },
});

interface LabelFilterProps {
  labels: Label[];
  selected: string[];
  onChange: (labelIds: string[]) => void;
}

export function LabelFilter({ labels, selected, onChange }: LabelFilterProps) {
  if (labels.length === 0) return <></>;

  const toggle = (labelId: string) => {
    const next = selected.includes(labelId)
      ? selected.filter((id) => id !== labelId)
      : [...selected, labelId];
    onChange(next);
  };

  return (
    <div className={styles.container} data-testid="label-filter">
      {labels.map((label) => {
        const isActive = selected.includes(label.id);
        return (
          <button
            type="button"
            key={label.id}
            className={isActive ? styles.active : styles.button}
            aria-pressed={isActive ? 'true' : 'false'}
            onClick={() => toggle(label.id)}
          >
            <span className={styles.dot} style={{ backgroundColor: label.color }} />
            {label.name}
          </button>
        );
      })}
    </div>
  );
}
