import { afterEach, beforeEach, describe, expect, it, mock } from '@vertz/test';

describe('ComposedToggleGroup', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders root with role="group"', async () => {
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const root = ComposedToggleGroup({ children: [] });
    expect(root.getAttribute('role')).toBe('group');
  });

  it('sets data-orientation attribute', async () => {
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const horizontal = ComposedToggleGroup({ children: [] });
    expect(horizontal.getAttribute('data-orientation')).toBe('horizontal');

    const vertical = ComposedToggleGroup({ orientation: 'vertical', children: [] });
    expect(vertical.getAttribute('data-orientation')).toBe('vertical');
  });

  it('distributes root class', async () => {
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const root = ComposedToggleGroup({
      classes: { root: 'my-root' },
      children: [],
    });
    expect(root.className).toContain('my-root');
  });

  it('renders items with aria-pressed="false" by default', async () => {
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const root = ComposedToggleGroup({
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        return [a];
      },
    });
    container.appendChild(root);

    const item = root.querySelector('button') as HTMLButtonElement;
    expect(item.getAttribute('aria-pressed')).toBe('false');
    expect(item.getAttribute('data-state')).toBe('off');
  });

  it('distributes item class', async () => {
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const root = ComposedToggleGroup({
      classes: { item: 'my-item' },
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        return [a];
      },
    });
    container.appendChild(root);

    const item = root.querySelector('button') as HTMLButtonElement;
    expect(item.className).toContain('my-item');
  });

  it('single mode: click item selects it', async () => {
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const root = ComposedToggleGroup({
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        return [a];
      },
    });
    container.appendChild(root);

    const item = root.querySelector('button') as HTMLButtonElement;
    item.click();
    expect(item.getAttribute('aria-pressed')).toBe('true');
    expect(item.getAttribute('data-state')).toBe('on');
  });

  it('single mode: click different item deselects first, selects second', async () => {
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const root = ComposedToggleGroup({
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        const b = ComposedToggleGroup.Item({ value: 'b', children: ['B'] });
        return [a, b];
      },
    });
    container.appendChild(root);

    const items = root.querySelectorAll('button');
    const itemA = items[0] as HTMLButtonElement;
    const itemB = items[1] as HTMLButtonElement;

    itemA.click();
    expect(itemA.getAttribute('aria-pressed')).toBe('true');

    itemB.click();
    expect(itemA.getAttribute('aria-pressed')).toBe('false');
    expect(itemA.getAttribute('data-state')).toBe('off');
    expect(itemB.getAttribute('aria-pressed')).toBe('true');
    expect(itemB.getAttribute('data-state')).toBe('on');
  });

  it('multiple mode: click multiple items selects all', async () => {
    const onValueChange = mock();
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const root = ComposedToggleGroup({
      type: 'multiple',
      onValueChange,
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        const b = ComposedToggleGroup.Item({ value: 'b', children: ['B'] });
        return [a, b];
      },
    });
    container.appendChild(root);

    const items = root.querySelectorAll('button');
    const itemA = items[0] as HTMLButtonElement;
    const itemB = items[1] as HTMLButtonElement;

    itemA.click();
    itemB.click();
    expect(itemA.getAttribute('aria-pressed')).toBe('true');
    expect(itemB.getAttribute('aria-pressed')).toBe('true');
    expect(onValueChange).toHaveBeenLastCalledWith(['a', 'b']);
  });

  it('multiple mode: click selected item deselects it', async () => {
    const onValueChange = mock();
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const root = ComposedToggleGroup({
      type: 'multiple',
      onValueChange,
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        const b = ComposedToggleGroup.Item({ value: 'b', children: ['B'] });
        return [a, b];
      },
    });
    container.appendChild(root);

    const items = root.querySelectorAll('button');
    const itemA = items[0] as HTMLButtonElement;

    itemA.click();
    expect(onValueChange).toHaveBeenLastCalledWith(['a']);

    itemA.click();
    expect(itemA.getAttribute('aria-pressed')).toBe('false');
    expect(itemA.getAttribute('data-state')).toBe('off');
    expect(onValueChange).toHaveBeenLastCalledWith([]);
  });

  it('applies roving tabindex to items', async () => {
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const root = ComposedToggleGroup({
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        const b = ComposedToggleGroup.Item({ value: 'b', children: ['B'] });
        return [a, b];
      },
    });
    container.appendChild(root);

    const items = root.querySelectorAll('button');
    expect(items[0]?.getAttribute('tabindex')).toBe('0');
    expect(items[1]?.getAttribute('tabindex')).toBe('-1');
  });

  it('arrow key navigation moves focus between items', async () => {
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const root = ComposedToggleGroup({
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        const b = ComposedToggleGroup.Item({ value: 'b', children: ['B'] });
        return [a, b];
      },
    });
    container.appendChild(root);

    const items = root.querySelectorAll('button');
    const itemA = items[0] as HTMLButtonElement;
    const itemB = items[1] as HTMLButtonElement;

    itemA.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

    expect(document.activeElement).toBe(itemB);
    expect(itemB.getAttribute('tabindex')).toBe('0');
    expect(itemA.getAttribute('tabindex')).toBe('-1');
  });

  it('calls onValueChange when value changes', async () => {
    const onValueChange = mock();
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const root = ComposedToggleGroup({
      onValueChange,
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        return [a];
      },
    });
    container.appendChild(root);

    const item = root.querySelector('button') as HTMLButtonElement;
    item.click();
    expect(onValueChange).toHaveBeenCalledWith(['a']);

    item.click();
    expect(onValueChange).toHaveBeenCalledWith([]);
  });

  it('supports defaultValue: items start selected', async () => {
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const root = ComposedToggleGroup({
      defaultValue: ['b'],
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        const b = ComposedToggleGroup.Item({ value: 'b', children: ['B'] });
        return [a, b];
      },
    });
    container.appendChild(root);

    const items = root.querySelectorAll('button');
    const itemA = items[0] as HTMLButtonElement;
    const itemB = items[1] as HTMLButtonElement;

    expect(itemA.getAttribute('aria-pressed')).toBe('false');
    expect(itemB.getAttribute('aria-pressed')).toBe('true');
    expect(itemB.getAttribute('data-state')).toBe('on');
  });

  it('disabled: does not toggle on click', async () => {
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const root = ComposedToggleGroup({
      disabled: true,
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['A'] });
        return [a];
      },
    });
    container.appendChild(root);

    const item = root.querySelector('button') as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.getAttribute('aria-disabled')).toBe('true');

    item.click();
    expect(item.getAttribute('aria-pressed')).toBe('false');
  });

  it('Item throws when used outside ToggleGroup', async () => {
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    expect(() => {
      ComposedToggleGroup.Item({ value: 'a' });
    }).toThrow(/must be used inside <ToggleGroup>/);
  });

  it('renders item children', async () => {
    const { ComposedToggleGroup } = await import('../toggle-group-composed');
    const root = ComposedToggleGroup({
      children: () => {
        const a = ComposedToggleGroup.Item({ value: 'a', children: ['Bold'] });
        return [a];
      },
    });
    container.appendChild(root);

    const item = root.querySelector('button') as HTMLButtonElement;
    expect(item.textContent).toBe('Bold');
  });
});
