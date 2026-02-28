import { describe, expect, it } from 'bun:test';
import { createToggleStyles } from '../styles/toggle';

describe('toggle styles', () => {
  const toggle = createToggleStyles();

  it('has root block', () => {
    expect(typeof toggle.root).toBe('string');
  });

  it('class name is non-empty', () => {
    expect(toggle.root.length).toBeGreaterThan(0);
  });

  it('CSS contains data-state="on" selector', () => {
    expect(toggle.css).toContain('[data-state="on"]');
  });
});

describe('themed Toggle', () => {
  it('applies root class to element', async () => {
    const { createThemedToggle } = await import('../components/primitives/toggle');
    const styles = createToggleStyles();
    const themedToggle = createThemedToggle(styles);
    const toggle = themedToggle();

    expect(toggle.root.classList.contains(styles.root)).toBe(true);
  });

  it('preserves primitive behavior — click toggles', async () => {
    const { createThemedToggle } = await import('../components/primitives/toggle');
    const styles = createToggleStyles();
    const themedToggle = createThemedToggle(styles);
    const toggle = themedToggle();

    expect(toggle.state.pressed.peek()).toBe(false);
    toggle.root.click();
    expect(toggle.state.pressed.peek()).toBe(true);
  });

  it('passes options through to primitive', async () => {
    const { createThemedToggle } = await import('../components/primitives/toggle');
    const styles = createToggleStyles();
    const themedToggle = createThemedToggle(styles);
    const toggle = themedToggle({ defaultPressed: true });

    expect(toggle.state.pressed.peek()).toBe(true);
  });
});
