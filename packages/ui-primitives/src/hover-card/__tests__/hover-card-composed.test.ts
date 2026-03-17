import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';

describe('ComposedHoverCard', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders root with display: contents', async () => {
    const { ComposedHoverCard } = await import('../hover-card-composed');
    const root = ComposedHoverCard({ children: [] });
    expect(root.style.display).toBe('contents');
  });

  it('renders content with role="dialog"', async () => {
    const { ComposedHoverCard } = await import('../hover-card-composed');
    const root = ComposedHoverCard({
      children: () => {
        const trigger = ComposedHoverCard.Trigger({
          children: [document.createElement('button')],
        });
        const content = ComposedHoverCard.Content({ children: ['Card body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-hidden')).toBe('true');
    expect(dialog.getAttribute('data-state')).toBe('closed');
  });

  it('distributes content class', async () => {
    const { ComposedHoverCard } = await import('../hover-card-composed');
    const root = ComposedHoverCard({
      classes: { content: 'my-content' },
      children: () => {
        const trigger = ComposedHoverCard.Trigger({
          children: [document.createElement('button')],
        });
        const content = ComposedHoverCard.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.className).toContain('my-content');
  });

  it('sets aria-haspopup on trigger', async () => {
    const { ComposedHoverCard } = await import('../hover-card-composed');
    const btn = document.createElement('button');
    const root = ComposedHoverCard({
      children: () => {
        const trigger = ComposedHoverCard.Trigger({ children: [btn] });
        const content = ComposedHoverCard.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('calls onOpenChange when focus triggers immediate show', async () => {
    const onOpenChange = vi.fn();
    const { ComposedHoverCard } = await import('../hover-card-composed');
    const btn = document.createElement('button');
    const root = ComposedHoverCard({
      onOpenChange,
      children: () => {
        const trigger = ComposedHoverCard.Trigger({ children: [btn] });
        const content = ComposedHoverCard.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    btn.dispatchEvent(new FocusEvent('focus'));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('content is initially hidden', async () => {
    const { ComposedHoverCard } = await import('../hover-card-composed');
    const root = ComposedHoverCard({
      children: () => {
        const trigger = ComposedHoverCard.Trigger({
          children: [document.createElement('button')],
        });
        const content = ComposedHoverCard.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.style.display).toBe('none');
  });
});
