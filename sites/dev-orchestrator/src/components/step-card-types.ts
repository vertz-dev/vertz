import type { StepRunDetail } from '../api/services/workflows';

export interface StepCardProps {
  readonly name: string;
  readonly status: 'pending' | 'active' | 'completed' | 'failed';
  readonly agent?: string;
  readonly detail?: StepRunDetail;
  readonly onClick?: () => void;
}
