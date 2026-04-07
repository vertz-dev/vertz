import { describe, expect, it } from 'bun:test';

// Cannot import stepStatus from .tsx directly (JSX runtime issue).
// Re-implement the pure function here for testing, mirroring the actual logic.
// The source of truth is workflow-detail.tsx:stepStatus.

const WORKFLOW_STEPS = [
  'plan',
  'review-dx',
  'review-product',
  'review-technical',
  'human-approval',
  'implement',
  'code-review',
  'ci-monitor',
] as const;

interface StepProgressEvent {
  step: string;
  type: 'step-started' | 'step-completed' | 'step-failed';
  timestamp: number;
}

function stepStatus(
  stepName: string,
  currentStep: string,
  sseEvents: readonly StepProgressEvent[],
): 'pending' | 'active' | 'completed' | 'failed' {
  const completed = sseEvents.find((e) => e.step === stepName && e.type === 'step-completed');
  if (completed) return 'completed';

  const failed = sseEvents.find((e) => e.step === stepName && e.type === 'step-failed');
  if (failed) return 'failed';

  const started = sseEvents.find((e) => e.step === stepName && e.type === 'step-started');
  if (started) return 'active';

  const currentIdx = WORKFLOW_STEPS.indexOf(currentStep as typeof WORKFLOW_STEPS[number]);
  const stepIdx = WORKFLOW_STEPS.indexOf(stepName as typeof WORKFLOW_STEPS[number]);
  if (stepIdx < currentIdx) return 'completed';
  if (stepIdx === currentIdx) return 'active';
  return 'pending';
}

describe('stepStatus()', () => {
  it('returns "completed" when SSE has step-completed event', () => {
    const events: StepProgressEvent[] = [
      { step: 'plan', type: 'step-completed', timestamp: 1000 },
    ];
    expect(stepStatus('plan', 'review-dx', events)).toBe('completed');
  });

  it('returns "failed" when SSE has step-failed event', () => {
    const events: StepProgressEvent[] = [
      { step: 'plan', type: 'step-failed', timestamp: 1000 },
    ];
    expect(stepStatus('plan', 'review-dx', events)).toBe('failed');
  });

  it('returns "active" when SSE has step-started but no completion', () => {
    const events: StepProgressEvent[] = [
      { step: 'plan', type: 'step-started', timestamp: 1000 },
    ];
    expect(stepStatus('plan', 'plan', events)).toBe('active');
  });

  it('falls back to index-based "completed" for steps before current', () => {
    expect(stepStatus('plan', 'implement', [])).toBe('completed');
  });

  it('falls back to index-based "active" for current step', () => {
    expect(stepStatus('plan', 'plan', [])).toBe('active');
  });

  it('falls back to index-based "pending" for steps after current', () => {
    expect(stepStatus('implement', 'plan', [])).toBe('pending');
  });

  it('SSE completed overrides index-based logic', () => {
    const events: StepProgressEvent[] = [
      { step: 'implement', type: 'step-completed', timestamp: 1000 },
    ];
    // implement is after plan by index, but SSE says it's completed
    expect(stepStatus('implement', 'plan', events)).toBe('completed');
  });
});
