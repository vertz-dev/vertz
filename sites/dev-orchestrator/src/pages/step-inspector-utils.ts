import type { StepRunDetail, WorkflowArtifact } from '../api/services/workflows';

export function stepStatusFromDetail(detail: StepRunDetail | null): 'pending' | 'active' | 'completed' | 'failed' {
  if (!detail) return 'pending';
  switch (detail.status) {
    case 'complete': return 'completed';
    case 'failed': return 'failed';
    case 'running': return 'active';
    default: return 'pending';
  }
}

export function filterArtifactsByStep(
  artifacts: readonly WorkflowArtifact[],
  step: string,
): readonly WorkflowArtifact[] {
  return artifacts.filter((a) => a.step === step);
}
