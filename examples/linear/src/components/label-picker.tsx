import { css } from '@vertz/ui';
import type { IssueLabel, Label } from '../lib/types';

const styles = css({
  container: ['flex', 'flex-col', 'gap:1'],
  heading: ['text:xs', 'font:medium', 'text:muted-foreground', 'mb:1'],
  button: [
    'flex',
    'items:center',
    'gap:2',
    'w:full',
    'px:2',
    'py:1.5',
    'text:xs',
    'rounded:md',
    'border:0',
    'cursor:pointer',
    'bg:transparent',
    'text:foreground',
    'transition:colors',
    'hover:bg:accent',
    'text:left',
  ],
  active: [
    'flex',
    'items:center',
    'gap:2',
    'w:full',
    'px:2',
    'py:1.5',
    'text:xs',
    'rounded:md',
    'border:0',
    'cursor:pointer',
    'bg:accent',
    'text:foreground',
    'transition:colors',
    'hover:bg:accent',
    'text:left',
  ],
  dot: ['w:2.5', 'h:2.5', 'rounded:full', 'shrink-0'],
  check: ['ml:auto', 'text:muted-foreground', 'text:xs'],
  empty: ['text:xs', 'text:muted-foreground', 'py:2'],
});

interface LabelPickerProps {
  labels: Label[];
  issueLabels: IssueLabel[];
  onAdd: (labelId: string) => void;
  onRemove: (issueLabelId: string) => void;
}

export function LabelPicker({ labels, issueLabels, onAdd, onRemove }: LabelPickerProps) {
  const assignedLabelIds = new Set(issueLabels.map((il) => il.labelId));

  const handleClick = (label: Label) => {
    if (assignedLabelIds.has(label.id)) {
      const issueLabel = issueLabels.find((il) => il.labelId === label.id);
      if (issueLabel) onRemove(issueLabel.id);
    } else {
      onAdd(label.id);
    }
  };

  return (
    <div className={styles.container} data-testid="label-picker">
      <span className={styles.heading}>Labels</span>
      {labels.length === 0 && <span className={styles.empty}>No labels in project</span>}
      {labels.map((label) => {
        const isAssigned = assignedLabelIds.has(label.id);
        return (
          <button
            type="button"
            key={label.id}
            className={isAssigned ? styles.active : styles.button}
            onClick={() => handleClick(label)}
          >
            <span className={styles.dot} style={{ backgroundColor: label.color }} />
            {label.name}
            {isAssigned && <span className={styles.check}>✓</span>}
          </button>
        );
      })}
    </div>
  );
}
