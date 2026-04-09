import { afterEach, beforeEach, describe, expect, it, vi } from '@vertz/test';

describe('ComposedCollapsible', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders root with data-part="collapsible"', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({ children: [] });
    expect(root.getAttribute('data-part')).toBe('collapsible');
  });

  it('distributes root class', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({
      classes: { root: 'my-root' },
      children: [],
    });
    expect(root.className).toContain('my-root');
  });

  it('renders trigger with correct ARIA attributes', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('data-state')).toBe('closed');
  });

  it('renders content hidden by default', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const content = root.querySelector('[data-part="collapsible-content"]') as HTMLElement;
    expect(content).not.toBeNull();
    expect(content.getAttribute('aria-hidden')).toBe('true');
    expect(content.style.display).toBe('none');
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  it('distributes content class', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({
      classes: { content: 'my-content' },
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const content = root.querySelector('[data-part="collapsible-content"]') as HTMLElement;
    expect(content.className).toContain('my-content');
  });

  it('trigger click toggles open state', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    const content = root.querySelector('[data-part="collapsible-content"]') as HTMLElement;

    trigger.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('data-state')).toBe('open');
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('trigger click again closes', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    const content = root.querySelector('[data-part="collapsible-content"]') as HTMLElement;

    trigger.click();
    trigger.click();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('data-state')).toBe('closed');
    expect(content.getAttribute('data-state')).toBe('closed');
    expect(content.getAttribute('aria-hidden')).toBe('true');
  });

  it('defaultOpen starts open', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({
      defaultOpen: true,
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    const content = root.querySelector('[data-part="collapsible-content"]') as HTMLElement;

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('data-state')).toBe('open');
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('disabled prevents toggle', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({
      disabled: true,
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    trigger.click();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.disabled).toBe(true);
  });

  it('calls onOpenChange on toggle', async () => {
    const onOpenChange = vi.fn();
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({
      onOpenChange,
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    trigger.click();
    expect(onOpenChange).toHaveBeenCalledWith(true);

    trigger.click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it('sets --collapsible-content-height on open', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    const content = root.querySelector('[data-part="collapsible-content"]') as HTMLElement;

    trigger.click();
    const heightVar = content.style.getPropertyValue('--collapsible-content-height');
    expect(heightVar).toMatch(/^\d+px$/);
  });

  it('distributes trigger class', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({
      classes: { trigger: 'my-trigger' },
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    expect(trigger.className).toContain('my-trigger');
  });

  it('merges trigger class from classes prop and Trigger className', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({
      classes: { trigger: 'theme-trigger' },
      children: () => {
        const trigger = ComposedCollapsible.Trigger({
          children: ['Toggle'],
          className: 'user-trigger',
        });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    expect(trigger.className).toContain('theme-trigger');
    expect(trigger.className).toContain('user-trigger');
  });

  it('throws when Trigger is used outside Provider', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    expect(() => ComposedCollapsible.Trigger({ children: ['Toggle'] })).toThrow(
      '<Collapsible.Trigger> must be used inside <Collapsible>',
    );
  });

  it('throws when Content is used outside Provider', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    expect(() => ComposedCollapsible.Content({ children: ['Body'] })).toThrow(
      '<Collapsible.Content> must be used inside <Collapsible>',
    );
  });

  it('rapid close-then-reopen keeps content visible', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    const content = root.querySelector('[data-part="collapsible-content"]') as HTMLElement;

    // Open → Close → Open rapidly
    trigger.click(); // open
    trigger.click(); // close (deferred hide starts)
    trigger.click(); // reopen (should cancel deferred hide)

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(content.getAttribute('data-state')).toBe('open');
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(content.style.display).toBe('');
  });

  it('aria-controls links trigger to content', async () => {
    const { ComposedCollapsible } = await import('../collapsible-composed');
    const root = ComposedCollapsible({
      children: () => {
        const trigger = ComposedCollapsible.Trigger({ children: ['Toggle'] });
        const content = ComposedCollapsible.Content({ children: ['Body'] });
        return [trigger, content];
      },
    });
    container.appendChild(root);

    const trigger = root.querySelector('button') as HTMLButtonElement;
    const content = root.querySelector('[data-part="collapsible-content"]') as HTMLElement;

    expect(trigger.getAttribute('aria-controls')).toBe(content.id);
  });
});
