import { css } from '@vertz/ui';
import type { Label } from '../lib/types';

const styles = css({
  container: ['flex', 'flex-wrap', 'gap:1', 'mb:4'],
  button: [
    'inline-flex',
    'items:center',
    'gap:1',
    'px:2',
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
    'inline-flex',
    'items:center',
    'gap:1',
    'px:2',
    'py:1',
    'text:xs',
    'rounded:full',
    'border:1',
    'border:primary',
    'cursor:pointer',
    'bg:primary',
    'text:primary-foreground',
  ],
  dot: ['w:2', 'h:2', 'rounded:full', 'shrink-0'],
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
