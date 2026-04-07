import { describe, expect, it } from 'vitest';
import { filterLabel, STATUS_FILTERS } from './dashboard-utils';

describe('filterLabel', () => {
  it('returns "All" for all', () => {
    expect(filterLabel('all')).toBe('All');
  });

  it('returns "Running" for running', () => {
    expect(filterLabel('running')).toBe('Running');
  });

  it('returns "Completed" for completed', () => {
    expect(filterLabel('completed')).toBe('Completed');
  });

  it('returns "Failed" for failed', () => {
    expect(filterLabel('failed')).toBe('Failed');
  });

  it('returns "Cancelled" for cancelled', () => {
    expect(filterLabel('cancelled')).toBe('Cancelled');
  });
});

describe('STATUS_FILTERS', () => {
  it('contains all 5 filter options', () => {
    expect(STATUS_FILTERS).toHaveLength(5);
    expect(STATUS_FILTERS).toContain('all');
    expect(STATUS_FILTERS).toContain('running');
    expect(STATUS_FILTERS).toContain('completed');
    expect(STATUS_FILTERS).toContain('failed');
    expect(STATUS_FILTERS).toContain('cancelled');
  });
});
