import { describe, expect, it, vi } from 'bun:test';
import { ComposedHoverCard } from '@vertz/ui-primitives';
import { createThemedHoverCard } from '../components/primitives/hover-card';
import { createHoverCardStyles } from '../styles/hover-card';

describe('hover-card styles', () => {
  const styles = createHoverCardStyles();

  it('has content block', () => {
    expect(typeof styles.content).toBe('string');
    expect(styles.content.length).toBeGreaterThan(0);
  });

  it('has combined CSS', () => {
    expect(typeof styles.css).toBe('string');
    expect(styles.css.length).toBeGreaterThan(0);
  });

  it('CSS contains outline:none for content', () => {
    expect(styles.css).toContain('outline: none');
  });

  it('CSS uses lg border-radius (0.5rem) consistent with other floating components', () => {
    expect(styles.css).toContain('0.5rem');
  });

  it('CSS contains both fade and zoom animations for open/close states', () => {
    expect(styles.css).toContain('vz-fade-in');
    expect(styles.css).toContain('vz-fade-out');
    expect(styles.css).toContain('vz-zoom-in');
    expect(styles.css).toContain('vz-zoom-out');
  });
});

describe('themed HoverCard', () => {
  const styles = createHoverCardStyles();

  it('applies content class', () => {
    const HoverCard = createThemedHoverCard(styles);
    const root = HoverCard({
      children: () => {
        const trigger = ComposedHoverCard.Trigger({
          children: [document.createElement('button')],
        });
        const content = ComposedHoverCard.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });

    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.className).toContain(styles.content);
  });

  it('renders trigger and content', () => {
    const HoverCard = createThemedHoverCard(styles);
    const root = HoverCard({
      children: () => {
        const trigger = ComposedHoverCard.Trigger({
          children: [document.createElement('button')],
        });
        const content = ComposedHoverCard.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });

    expect(root.querySelector('[role="dialog"]')).toBeInstanceOf(HTMLDivElement);
  });

  it('content is initially hidden', () => {
    const HoverCard = createThemedHoverCard(styles);
    const root = HoverCard({
      children: () => {
        const trigger = ComposedHoverCard.Trigger({
          children: [document.createElement('button')],
        });
        const content = ComposedHoverCard.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });

    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-hidden')).toBe('true');
  });

  it('has Trigger and Content sub-components', () => {
    const HoverCard = createThemedHoverCard(styles);
    expect(typeof HoverCard.Trigger).toBe('function');
    expect(typeof HoverCard.Content).toBe('function');
  });

  it('calls onOpenChange on focus trigger', () => {
    const onOpenChange = vi.fn();
    const HoverCard = createThemedHoverCard(styles);
    const btn = document.createElement('button');
    const root = HoverCard({
      onOpenChange,
      children: () => {
        const trigger = ComposedHoverCard.Trigger({ children: [btn] });
        const content = ComposedHoverCard.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    document.body.appendChild(root);

    btn.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(onOpenChange).toHaveBeenCalledWith(true);

    document.body.removeChild(root);
  });
});
