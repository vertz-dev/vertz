import { describe, expect, it, vi } from 'bun:test';
import { ComposedToggleGroup } from '@vertz/ui-primitives';
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

  it('applies root class', () => {
    const ToggleGroup = createThemedToggleGroup(styles);
    const root = ToggleGroup({
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        return [a];
      },
    });
    expect(root.className).toContain(styles.root);
  });

  it('applies item class to created items', () => {
    const ToggleGroup = createThemedToggleGroup(styles);
    const root = ToggleGroup({
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        return [a];
      },
    });
    const item = root.querySelector('button') as HTMLButtonElement;
    expect(item.className).toContain(styles.item);
  });

  it('preserves primitive behavior', () => {
    const ToggleGroup = createThemedToggleGroup(styles);
    const onValueChange = vi.fn();
    const root = ToggleGroup({
      onValueChange,
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'test', children: ['Test'] });
        return [a];
      },
    });
    document.body.appendChild(root);

    const item = root.querySelector('button') as HTMLButtonElement;
    item.click();
    expect(onValueChange).toHaveBeenCalledWith(['test']);

    item.click();
    expect(onValueChange).toHaveBeenCalledWith([]);

    document.body.removeChild(root);
  });

  it('has Item sub-component', () => {
    const ToggleGroup = createThemedToggleGroup(styles);
    expect(typeof ToggleGroup.Item).toBe('function');
  });

  it('renders root with role="group"', () => {
    const ToggleGroup = createThemedToggleGroup(styles);
    const root = ToggleGroup({
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        return [a];
      },
    });
    expect(root.getAttribute('role')).toBe('group');
  });

  it('passes options through to primitive', () => {
    const ToggleGroup = createThemedToggleGroup(styles);
    const root = ToggleGroup({
      defaultValue: ['a'],
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        return [a];
      },
    });
    const item = root.querySelector('button') as HTMLButtonElement;
    expect(item.getAttribute('aria-pressed')).toBe('true');
    expect(item.getAttribute('data-state')).toBe('on');
  });
});
