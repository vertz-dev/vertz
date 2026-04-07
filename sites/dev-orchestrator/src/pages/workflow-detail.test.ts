import { describe, expect, it } from 'bun:test';
import { stepStatus } from './workflow-detail-utils';

describe('stepStatus()', () => {
  it('returns "completed" when SSE has step-completed event', () => {
    const events = [{ step: 'plan', type: 'step-completed' as const, timestamp: 1000 }];
    expect(stepStatus('plan', 'review-dx', events)).toBe('completed');
  });

  it('returns "failed" when SSE has step-failed event', () => {
    const events = [{ step: 'plan', type: 'step-failed' as const, timestamp: 1000 }];
    expect(stepStatus('plan', 'review-dx', events)).toBe('failed');
  });

  it('returns "active" when SSE has step-started but no completion', () => {
    const events = [{ step: 'plan', type: 'step-started' as const, timestamp: 1000 }];
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
    const events = [{ step: 'implement', type: 'step-completed' as const, timestamp: 1000 }];
    expect(stepStatus('implement', 'plan', events)).toBe('completed');
  });
});
