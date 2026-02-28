import { describe, expect, it } from 'bun:test';
import { createThemedToggleGroup } from '../components/primitives/toggle-group';
import { createToggleGroupStyles } from '../styles/toggle-group';

describe('toggle-group styles', () => {
  const styles = createToggleGroupStyles();

  it('has root and item blocks', () => {
    expect(typeof styles.root).toBe('string');
    expect(typeof styles.item).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(styles.root.length).toBeGreaterThan(0);
    expect(styles.item.length).toBeGreaterThan(0);
  });

  it('has combined CSS', () => {
    expect(typeof styles.css).toBe('string');
    expect(styles.css.length).toBeGreaterThan(0);
  });
});

describe('themed ToggleGroup', () => {
  const styles = createToggleGroupStyles();
  const toggleGroup = createThemedToggleGroup(styles);

  it('applies root class', () => {
    const result = toggleGroup();
    expect(result.root.className).toContain(styles.root);
  });

  it('applies item class to created items', () => {
    const result = toggleGroup();
    const item = result.Item('a');
    expect(item.className).toContain(styles.item);
  });

  it('preserves primitive behavior', () => {
    const result = toggleGroup();
    const item = result.Item('test');
    expect(result.state.value.peek()).toEqual([]);
    item.click();
    expect(result.state.value.peek()).toEqual(['test']);
  });
});
