import { describe, expect, it } from 'bun:test';
import type { StepRunDetail, WorkflowArtifact } from '../api/services/workflows';
import { errorReasonLabel, filterArtifactsByStep, stepStatusFromDetail } from './step-inspector-utils';

describe('stepStatusFromDetail()', () => {
  it('returns "pending" for null detail', () => {
    expect(stepStatusFromDetail(null)).toBe('pending');
  });

  it('returns "completed" for status "complete"', () => {
    const detail: StepRunDetail = { status: 'complete' };
    expect(stepStatusFromDetail(detail)).toBe('completed');
  });

  it('returns "failed" for status "failed"', () => {
    const detail: StepRunDetail = { status: 'failed' };
    expect(stepStatusFromDetail(detail)).toBe('failed');
  });

  it('returns "active" for status "running"', () => {
    const detail: StepRunDetail = { status: 'running' };
    expect(stepStatusFromDetail(detail)).toBe('active');
  });

  it('returns "pending" for unknown status', () => {
    const detail: StepRunDetail = { status: 'queued' };
    expect(stepStatusFromDetail(detail)).toBe('pending');
  });
});

describe('errorReasonLabel()', () => {
  it('returns "Agent Failed" for agent-failed', () => {
    expect(errorReasonLabel('agent-failed')).toBe('Agent Failed');
  });

  it('returns "Invalid JSON" for invalid-json', () => {
    expect(errorReasonLabel('invalid-json')).toBe('Invalid JSON');
  });

  it('returns "Schema Mismatch" for schema-mismatch', () => {
    expect(errorReasonLabel('schema-mismatch')).toBe('Schema Mismatch');
  });

  it('returns "Max Iterations" for max-iterations', () => {
    expect(errorReasonLabel('max-iterations')).toBe('Max Iterations');
  });

  it('returns "Token Budget Exceeded" for token-budget', () => {
    expect(errorReasonLabel('token-budget')).toBe('Token Budget Exceeded');
  });

  it('returns the raw reason for unknown reasons', () => {
    expect(errorReasonLabel('custom-reason')).toBe('custom-reason');
  });

  it('returns "Unknown" for undefined', () => {
    expect(errorReasonLabel(undefined)).toBe('Unknown');
  });
});

describe('filterArtifactsByStep()', () => {
  const artifacts: WorkflowArtifact[] = [
    { path: 'plans/design.md', content: '# Design', type: 'markdown', step: 'plan' },
    { path: 'src/main.ts', content: 'code', type: 'typescript', step: 'implement' },
    { path: 'plans/review.md', content: '# Review', type: 'markdown', step: 'plan' },
  ];

  it('returns artifacts matching the given step', () => {
    const result = filterArtifactsByStep(artifacts, 'plan');
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('plans/design.md');
    expect(result[1].path).toBe('plans/review.md');
  });

  it('returns empty array for step with no artifacts', () => {
    expect(filterArtifactsByStep(artifacts, 'review')).toHaveLength(0);
  });

  it('returns empty array for empty artifacts list', () => {
    expect(filterArtifactsByStep([], 'plan')).toHaveLength(0);
  });
});
