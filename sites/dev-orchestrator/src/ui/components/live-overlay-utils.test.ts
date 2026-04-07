import { describe, expect, it } from 'vitest';
import type { StepProgressEvent } from '../lib/sse-client';
import { buildOverlay, statusBadge, statusBadgeColor } from './live-overlay-utils';

const STEPS = ['plan', 'review-dx', 'implement', 'ci-monitor'];

describe('buildOverlay', () => {
  it('marks current step as active with no SSE events', () => {
    const overlay = buildOverlay(STEPS, 'plan', []);
    expect(overlay.stepStatuses.plan).toBe('active');
    expect(overlay.stepStatuses['review-dx']).toBe('pending');
    expect(overlay.stepStatuses.implement).toBe('pending');
  });

  it('marks steps before currentStep as completed', () => {
    const overlay = buildOverlay(STEPS, 'implement', []);
    expect(overlay.stepStatuses.plan).toBe('completed');
    expect(overlay.stepStatuses['review-dx']).toBe('completed');
    expect(overlay.stepStatuses.implement).toBe('active');
    expect(overlay.stepStatuses['ci-monitor']).toBe('pending');
  });

  it('SSE step-completed overrides position-based status', () => {
    const events: StepProgressEvent[] = [
      { step: 'plan', type: 'step-completed', timestamp: Date.now() },
    ];
    const overlay = buildOverlay(STEPS, 'plan', events);
    expect(overlay.stepStatuses.plan).toBe('completed');
  });

  it('SSE step-failed marks step as failed', () => {
    const events: StepProgressEvent[] = [
      { step: 'implement', type: 'step-failed', timestamp: Date.now() },
    ];
    const overlay = buildOverlay(STEPS, 'implement', events);
    expect(overlay.stepStatuses.implement).toBe('failed');
  });

  it('SSE step-started marks step as active', () => {
    const events: StepProgressEvent[] = [
      { step: 'review-dx', type: 'step-started', timestamp: Date.now() },
    ];
    const overlay = buildOverlay(STEPS, 'plan', events);
    expect(overlay.stepStatuses['review-dx']).toBe('active');
  });

  it('returns the currentStep in overlay', () => {
    const overlay = buildOverlay(STEPS, 'implement', []);
    expect(overlay.currentStep).toBe('implement');
  });

  it('handles all steps completed', () => {
    const events: StepProgressEvent[] = STEPS.map((step) => ({
      step,
      type: 'step-completed' as const,
      timestamp: Date.now(),
    }));
    const overlay = buildOverlay(STEPS, 'ci-monitor', events);
    expect(Object.values(overlay.stepStatuses).every((s) => s === 'completed')).toBe(true);
  });
});

describe('statusBadge', () => {
  it('returns checkmark for completed', () => {
    expect(statusBadge('completed')).toBe('\u2713');
  });

  it('returns X for failed', () => {
    expect(statusBadge('failed')).toBe('\u2717');
  });

  it('returns dot for active', () => {
    expect(statusBadge('active')).toBe('\u25CF');
  });

  it('returns empty for pending', () => {
    expect(statusBadge('pending')).toBe('');
  });
});

describe('statusBadgeColor', () => {
  it('returns green for completed', () => {
    expect(statusBadgeColor('completed')).toContain('142');
  });

  it('returns red for failed', () => {
    expect(statusBadgeColor('failed')).toContain('0');
  });

  it('returns blue for active', () => {
    expect(statusBadgeColor('active')).toContain('217');
  });

  it('returns transparent for pending', () => {
    expect(statusBadgeColor('pending')).toBe('transparent');
  });
});
