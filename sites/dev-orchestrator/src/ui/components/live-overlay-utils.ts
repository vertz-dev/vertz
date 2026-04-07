import type { StepProgressEvent } from '../lib/sse-client';

export type StepStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface ActiveRunOverlay {
  readonly currentStep: string;
  readonly stepStatuses: Record<string, StepStatus>;
}

/**
 * Build step status map from SSE events and the current step reported by the workflow.
 * Earlier steps (before currentStep) that have no SSE event are marked 'completed'.
 */
export function buildOverlay(
  steps: readonly string[],
  currentStep: string,
  sseEvents: readonly StepProgressEvent[],
): ActiveRunOverlay {
  const statuses: Record<string, StepStatus> = {};
  const currentIdx = steps.indexOf(currentStep);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    const completed = sseEvents.find((e) => e.step === step && e.type === 'step-completed');
    if (completed) {
      statuses[step] = 'completed';
      continue;
    }

    const failed = sseEvents.find((e) => e.step === step && e.type === 'step-failed');
    if (failed) {
      statuses[step] = 'failed';
      continue;
    }

    const started = sseEvents.find((e) => e.step === step && e.type === 'step-started');
    if (started) {
      statuses[step] = 'active';
      continue;
    }

    if (i < currentIdx) {
      statuses[step] = 'completed';
    } else if (i === currentIdx) {
      statuses[step] = 'active';
    } else {
      statuses[step] = 'pending';
    }
  }

  return { currentStep, stepStatuses: statuses };
}

/**
 * Get a status badge character for a given step status.
 */
export function statusBadge(status: StepStatus): string {
  switch (status) {
    case 'completed': return '\u2713';
    case 'failed': return '\u2717';
    case 'active': return '\u25CF';
    default: return '';
  }
}

/**
 * Get badge color for a status.
 */
export function statusBadgeColor(status: StepStatus): string {
  switch (status) {
    case 'completed': return 'hsl(142, 76%, 36%)';
    case 'failed': return 'hsl(0, 84%, 60%)';
    case 'active': return 'hsl(217, 91%, 60%)';
    default: return 'transparent';
  }
}
