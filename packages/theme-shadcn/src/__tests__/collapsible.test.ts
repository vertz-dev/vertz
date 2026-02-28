import { describe, expect, it } from 'bun:test';
import { createThemedCollapsible } from '../components/primitives/collapsible';
import { createCollapsibleStyles } from '../styles/collapsible';

describe('collapsible styles', () => {
  const collapsible = createCollapsibleStyles();

  it('has content block', () => {
    expect(typeof collapsible.content).toBe('string');
  });

  it('content class name is non-empty', () => {
    expect(collapsible.content.length).toBeGreaterThan(0);
  });

  it('CSS contains collapsible animation keyframes', () => {
    expect(collapsible.css).toContain('vz-collapsible-down');
    expect(collapsible.css).toContain('vz-collapsible-up');
  });
});

describe('themed Collapsible', () => {
  const styles = createCollapsibleStyles();
  const collapsible = createThemedCollapsible(styles);

  it('applies content class to content element', () => {
    const result = collapsible();
    expect(result.content.className).toContain(styles.content);
  });

  it('passes options through to primitive', () => {
    const result = collapsible({ defaultOpen: true });
    expect(result.state.open.peek()).toBe(true);
    expect(result.trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('returns root, trigger, content, and state', () => {
    const result = collapsible();
    expect(result.root).toBeInstanceOf(HTMLDivElement);
    expect(result.trigger).toBeInstanceOf(HTMLButtonElement);
    expect(result.content).toBeInstanceOf(HTMLDivElement);
    expect(result.state.open).toBeDefined();
    expect(result.state.disabled).toBeDefined();
  });
});
