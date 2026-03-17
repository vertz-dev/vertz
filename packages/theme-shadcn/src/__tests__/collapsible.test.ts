import { describe, expect, it, vi } from 'bun:test';
import { ComposedCollapsible } from '@vertz/ui-primitives';
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

  it('applies content class to content element', () => {
    const Collapsible = createThemedCollapsible(styles);
    const root = Collapsible({
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });

    const content = root.querySelector('[data-part="collapsible-content"]') as HTMLElement;
    expect(content.className).toContain(styles.content);
  });

  it('passes options through to primitive', () => {
    const Collapsible = createThemedCollapsible(styles);
    const root = Collapsible({
      defaultOpen: true,
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });

    const trigger = root.querySelector('button') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders root with trigger and content', () => {
    const Collapsible = createThemedCollapsible(styles);
    const root = Collapsible({
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });

    expect(root).toBeInstanceOf(HTMLDivElement);
    expect(root.querySelector('button')).toBeInstanceOf(HTMLButtonElement);
    expect(root.querySelector('[data-part="collapsible-content"]')).toBeInstanceOf(HTMLDivElement);
  });

  it('has Trigger and Content sub-components', () => {
    const Collapsible = createThemedCollapsible(styles);
    expect(typeof Collapsible.Trigger).toBe('function');
    expect(typeof Collapsible.Content).toBe('function');
  });

  it('calls onOpenChange on toggle', () => {
    const onOpenChange = vi.fn();
    const Collapsible = createThemedCollapsible(styles);
    const root = Collapsible({
      onOpenChange,
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    document.body.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    trigger.click();
    expect(onOpenChange).toHaveBeenCalledWith(true);

    document.body.removeChild(root);
  });
});
