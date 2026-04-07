import type { StepProgressEvent } from '../ui/lib/sse-client';

export const WORKFLOW_STEPS = [
  'plan',
  'review-dx',
  'review-product',
  'review-technical',
  'human-approval',
  'implement',
  'code-review',
  'ci-monitor',
] as const;

export function stepStatus(
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
