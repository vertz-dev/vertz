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
    const themedCommand = createThemedCommand(styles);
    const result = themedCommand();

    expect(result.root.classList.contains(styles.root)).toBe(true);
  });

  it('applies input class to input element', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const themedCommand = createThemedCommand(styles);
    const result = themedCommand();

    expect(result.input.classList.contains(styles.input)).toBe(true);
  });

  it('applies list class to list element', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const themedCommand = createThemedCommand(styles);
    const result = themedCommand();

    expect(result.list.classList.contains(styles.list)).toBe(true);
  });

  it('applies empty class to empty element', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const themedCommand = createThemedCommand(styles);
    const result = themedCommand();

    expect(result.empty.classList.contains(styles.empty)).toBe(true);
  });

  it('applies item class to created items', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const themedCommand = createThemedCommand(styles);
    const result = themedCommand();
    const item = result.Item('apple', 'Apple');

    expect(item.classList.contains(styles.item)).toBe(true);
  });

  it('applies group and groupHeading classes', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const themedCommand = createThemedCommand(styles);
    const result = themedCommand();
    const group = result.Group('Fruits');

    expect(group.el.classList.contains(styles.group)).toBe(true);
    const labelId = group.el.getAttribute('aria-labelledby') ?? '';
    const heading = group.el.querySelector(`#${labelId}`);
    expect(heading?.classList.contains(styles.groupHeading)).toBe(true);
  });

  it('applies separator class', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const themedCommand = createThemedCommand(styles);
    const result = themedCommand();
    const sep = result.Separator();

    expect(sep.classList.contains(styles.separator)).toBe(true);
  });

  it('passes options through to primitive', async () => {
    const onSelect = vi.fn();
    const { createThemedCommand } = await import('../components/primitives/command');
    const themedCommand = createThemedCommand(styles);
    const result = themedCommand({ onSelect, placeholder: 'Search...' });

    expect(result.input.placeholder).toBe('Search...');
    const item = result.Item('apple', 'Apple');
    item.click();
    expect(onSelect).toHaveBeenCalledWith('apple');
  });

  it('preserves primitive behavior — filtering', async () => {
    const { createThemedCommand } = await import('../components/primitives/command');
    const themedCommand = createThemedCommand(styles);
    const result = themedCommand();
    const apple = result.Item('apple', 'Apple');
    const banana = result.Item('banana', 'Banana');

    result.input.value = 'app';
    result.input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(apple.getAttribute('aria-hidden')).toBe('false');
    expect(banana.getAttribute('aria-hidden')).toBe('true');
  });
});
