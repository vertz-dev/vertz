import { describe, expect, it } from 'vitest';
import {
  STATIC_COMMANDS,
  filterCommands,
  nextIndex,
  prevIndex,
} from './command-palette-utils';

describe('STATIC_COMMANDS', () => {
  it('contains 3 page commands', () => {
    expect(STATIC_COMMANDS).toHaveLength(3);
    expect(STATIC_COMMANDS.map((c) => c.label)).toEqual(['Dashboard', 'Definitions', 'Agents']);
  });
});

describe('filterCommands', () => {
  it('returns all items for empty query', () => {
    expect(filterCommands(STATIC_COMMANDS, '')).toHaveLength(3);
  });

  it('returns all items for whitespace query', () => {
    expect(filterCommands(STATIC_COMMANDS, '  ')).toHaveLength(3);
  });

  it('filters by label match', () => {
    const result = filterCommands(STATIC_COMMANDS, 'dash');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Dashboard');
  });

  it('filters case-insensitively', () => {
    const result = filterCommands(STATIC_COMMANDS, 'AGENT');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Agents');
  });

  it('filters by category match', () => {
    const result = filterCommands(STATIC_COMMANDS, 'pages');
    expect(result).toHaveLength(3);
  });

  it('returns empty array when no match', () => {
    expect(filterCommands(STATIC_COMMANDS, 'zzz')).toHaveLength(0);
  });

  it('filters custom items', () => {
    const items = [
      { label: 'Workflow wf-1', href: '/workflows/wf-1', category: 'Recent' },
      { label: 'Workflow wf-2', href: '/workflows/wf-2', category: 'Recent' },
    ];
    const result = filterCommands(items, 'wf-1');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Workflow wf-1');
  });
});

describe('nextIndex', () => {
  it('returns -1 for empty list', () => {
    expect(nextIndex(0, 0)).toBe(-1);
  });

  it('advances index by 1', () => {
    expect(nextIndex(0, 3)).toBe(1);
  });

  it('wraps around to 0', () => {
    expect(nextIndex(2, 3)).toBe(0);
  });
});

describe('prevIndex', () => {
  it('returns -1 for empty list', () => {
    expect(prevIndex(0, 0)).toBe(-1);
  });

  it('goes back by 1', () => {
    expect(prevIndex(2, 3)).toBe(1);
  });

  it('wraps around to last', () => {
    expect(prevIndex(0, 3)).toBe(2);
  });
});
