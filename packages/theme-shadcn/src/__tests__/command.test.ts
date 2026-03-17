import { describe, expect, it, vi } from 'bun:test';
import { createCommandStyles } from '../styles/command';

describe('command styles', () => {
  const command = createCommandStyles();

  it('has root block', () => {
    expect(typeof command.root).toBe('string');
  });

  it('has input block', () => {
    expect(typeof command.input).toBe('string');
  });

  it('has list block', () => {
    expect(typeof command.list).toBe('string');
  });

  it('has item block', () => {
    expect(typeof command.item).toBe('string');
  });

  it('has group block', () => {
    expect(typeof command.group).toBe('string');
  });

  it('has groupHeading block', () => {
    expect(typeof command.groupHeading).toBe('string');
  });

  it('has separator block', () => {
    expect(typeof command.separator).toBe('string');
  });

  it('has empty block', () => {
    expect(typeof command.empty).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(command.root.length).toBeGreaterThan(0);
    expect(command.input.length).toBeGreaterThan(0);
    expect(command.list.length).toBeGreaterThan(0);
    expect(command.item.length).toBeGreaterThan(0);
    expect(command.group.length).toBeGreaterThan(0);
    expect(command.groupHeading.length).toBeGreaterThan(0);
    expect(command.separator.length).toBeGreaterThan(0);
    expect(command.empty.length).toBeGreaterThan(0);
  });

  it('CSS contains aria-selected selector for item', () => {
    expect(command.css).toContain('[aria-selected');
  });
});

describe('themed Command', () => {
  const styles = createCommandStyles();

  it('applies root class to root element', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const { ComposedCommand } = await import('@vertz/ui-primitives');
    const Command = createThemedCommand(styles);

    const root = Command({
      children: () => {
        const input = ComposedCommand.Input({});
        const list = ComposedCommand.List({ children: [] });
        return [input, list];
      },
    });

    expect(root.className).toContain(styles.root);
  });

  it('applies input class to input element', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const { ComposedCommand } = await import('@vertz/ui-primitives');
    const Command = createThemedCommand(styles);

    const root = Command({
      children: () => {
        const input = ComposedCommand.Input({});
        const list = ComposedCommand.List({ children: [] });
        return [input, list];
      },
    });

    const input = root.querySelector('[role="combobox"]') as HTMLElement;
    expect(input.className).toContain(styles.input);
  });

  it('applies list class to list element', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const { ComposedCommand } = await import('@vertz/ui-primitives');
    const Command = createThemedCommand(styles);

    const root = Command({
      children: () => {
        const input = ComposedCommand.Input({});
        const list = ComposedCommand.List({ children: [] });
        return [input, list];
      },
    });

    const list = root.querySelector('[role="listbox"]') as HTMLElement;
    expect(list.className).toContain(styles.list);
  });

  it('applies empty class to empty element', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const { ComposedCommand } = await import('@vertz/ui-primitives');
    const Command = createThemedCommand(styles);

    const root = Command({
      children: () => {
        const input = ComposedCommand.Input({});
        const list = ComposedCommand.List({
          children: () => {
            const empty = ComposedCommand.Empty({ children: ['No results'] });
            return [empty];
          },
        });
        return [input, list];
      },
    });

    const empty = root.querySelector('[data-part="command-empty"]') as HTMLElement;
    expect(empty.className).toContain(styles.empty);
  });

  it('applies item class to created items', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const { ComposedCommand } = await import('@vertz/ui-primitives');
    const Command = createThemedCommand(styles);

    const root = Command({
      children: () => {
        const input = ComposedCommand.Input({});
        const list = ComposedCommand.List({
          children: () => {
            const item = ComposedCommand.Item({ value: 'apple', children: ['Apple'] });
            return [item];
          },
        });
        return [input, list];
      },
    });

    const item = root.querySelector('[role="option"]') as HTMLElement;
    expect(item.className).toContain(styles.item);
  });

  it('applies group and groupHeading classes', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const { ComposedCommand } = await import('@vertz/ui-primitives');
    const Command = createThemedCommand(styles);

    const root = Command({
      children: () => {
        const input = ComposedCommand.Input({});
        const list = ComposedCommand.List({
          children: () => {
            const group = ComposedCommand.Group({
              label: 'Fruits',
              children: () => [ComposedCommand.Item({ value: 'apple', children: ['Apple'] })],
            });
            return [group];
          },
        });
        return [input, list];
      },
    });

    const group = root.querySelector('[role="group"]') as HTMLElement;
    expect(group.className).toContain(styles.group);

    const labelId = group.getAttribute('aria-labelledby') ?? '';
    const heading = group.querySelector(`#${labelId}`) as HTMLElement;
    expect(heading.className).toContain(styles.groupHeading);
  });

  it('applies separator class', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const { ComposedCommand } = await import('@vertz/ui-primitives');
    const Command = createThemedCommand(styles);

    const root = Command({
      children: () => {
        const input = ComposedCommand.Input({});
        const list = ComposedCommand.List({
          children: () => {
            const sep = ComposedCommand.Separator({});
            return [sep];
          },
        });
        return [input, list];
      },
    });

    const sep = root.querySelector('[role="separator"]') as HTMLElement;
    expect(sep.className).toContain(styles.separator);
  });

  it('passes options through to primitive', async () => {
    const onSelect = vi.fn();
    const { createThemedCommand } = await import('../components/primitives/command');
    const { ComposedCommand } = await import('@vertz/ui-primitives');
    const Command = createThemedCommand(styles);

    const root = Command({
      onSelect,
      placeholder: 'Search...',
      children: () => {
        const input = ComposedCommand.Input({});
        const list = ComposedCommand.List({
          children: () => [ComposedCommand.Item({ value: 'apple', children: ['Apple'] })],
        });
        return [input, list];
      },
    });

    const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
    expect(input.placeholder).toBe('Search...');

    const item = root.querySelector('[data-value="apple"]') as HTMLElement;
    item.click();
    expect(onSelect).toHaveBeenCalledWith('apple');
  });

  it('preserves primitive behavior — filtering', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const { ComposedCommand } = await import('@vertz/ui-primitives');
    const Command = createThemedCommand(styles);

    const root = Command({
      children: () => {
        const input = ComposedCommand.Input({});
        const list = ComposedCommand.List({
          children: () => {
            const apple = ComposedCommand.Item({ value: 'apple', children: ['Apple'] });
            const banana = ComposedCommand.Item({ value: 'banana', children: ['Banana'] });
            return [apple, banana];
          },
        });
        return [input, list];
      },
    });

    const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
    input.value = 'app';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const apple = root.querySelector('[data-value="apple"]') as HTMLElement;
    const banana = root.querySelector('[data-value="banana"]') as HTMLElement;
    expect(apple.getAttribute('aria-hidden')).toBe('false');
    expect(banana.getAttribute('aria-hidden')).toBe('true');
  });
});
