import { css, token } from '@vertz/ui';
import type { IssueLabel, Label } from '../lib/types';

const styles = css({
  container: { display: 'flex', flexDirection: 'column', gap: token.spacing[1] },
  heading: {
    fontSize: token.font.size.xs,
    fontWeight: token.font.weight.medium,
    color: token.color['muted-foreground'],
    marginBottom: token.spacing[1],
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    width: '100%',
    paddingInline: token.spacing[2],
    paddingBlock: token.spacing['1.5'],
    fontSize: token.font.size.xs,
    borderRadius: token.radius.md,
    borderWidth: '0px',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: token.color.foreground,
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    textAlign: 'left',
    '&:hover': { backgroundColor: token.color.accent },
  },
  active: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[2],
    width: '100%',
    paddingInline: token.spacing[2],
    paddingBlock: token.spacing['1.5'],
    fontSize: token.font.size.xs,
    borderRadius: token.radius.md,
    borderWidth: '0px',
    cursor: 'pointer',
    backgroundColor: token.color.accent,
    color: token.color.foreground,
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    textAlign: 'left',
    '&:hover': { backgroundColor: token.color.accent },
  },
  dot: {
    width: token.spacing['2.5'],
    height: token.spacing['2.5'],
    borderRadius: token.radius.full,
    flexShrink: '0',
  },
  check: {
    marginLeft: 'auto',
    color: token.color['muted-foreground'],
    fontSize: token.font.size.xs,
  },
  empty: {
    fontSize: token.font.size.xs,
    color: token.color['muted-foreground'],
    paddingBlock: token.spacing[2],
  },
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
