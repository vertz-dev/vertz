import { describe, expect, it } from 'bun:test';
import { createEmptyStateStyles } from '../styles/empty-state';

describe('empty-state styles', () => {
  const styles = createEmptyStateStyles();

  it('has root, icon, title, description, action blocks', () => {
    expect(typeof styles.root).toBe('string');
    expect(typeof styles.icon).toBe('string');
    expect(typeof styles.title).toBe('string');
    expect(typeof styles.description).toBe('string');
    expect(typeof styles.action).toBe('string');
  });

  it('all blocks have non-empty class names', () => {
    expect(styles.root.length).toBeGreaterThan(0);
    expect(styles.icon.length).toBeGreaterThan(0);
    expect(styles.title.length).toBeGreaterThan(0);
    expect(styles.description.length).toBeGreaterThan(0);
    expect(styles.action.length).toBeGreaterThan(0);
  });

  it('has CSS output', () => {
    expect(typeof styles.css).toBe('string');
    expect(styles.css.length).toBeGreaterThan(0);
  });
});
