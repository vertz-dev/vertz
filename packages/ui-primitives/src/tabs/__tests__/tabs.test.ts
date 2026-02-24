import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { Tabs } from '../tabs';

describe('Tabs', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('creates tablist with correct role', () => {
    const { list } = Tabs.Root();
    expect(list.getAttribute('role')).toBe('tablist');
  });

  it('creates tabs with correct ARIA roles', () => {
    const { root, Tab } = Tabs.Root({ defaultValue: 'tab1' });
    container.appendChild(root);
    const { trigger, panel } = Tab('tab1', 'Tab 1');

    expect(trigger.getAttribute('role')).toBe('tab');
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(trigger.id);
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
  });

  it('sets active tab on click', () => {
    const onValueChange = vi.fn();
    const { root, state, Tab } = Tabs.Root({ defaultValue: 'tab1', onValueChange });
    container.appendChild(root);
    Tab('tab1', 'Tab 1');
    const { trigger: t2 } = Tab('tab2', 'Tab 2');

    t2.click();
    expect(state.value.peek()).toBe('tab2');
    expect(onValueChange).toHaveBeenCalledWith('tab2');
  });

  it('shows only active panel', () => {
    const { root, Tab } = Tabs.Root({ defaultValue: 'tab1' });
    container.appendChild(root);
    const { panel: p1 } = Tab('tab1', 'Tab 1');
    const { panel: p2 } = Tab('tab2', 'Tab 2');

    expect(p1.getAttribute('aria-hidden')).toBe('false');
    expect(p2.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies data-state on triggers', () => {
    const { root, Tab } = Tabs.Root({ defaultValue: 'tab1' });
    container.appendChild(root);
    const { trigger: t1 } = Tab('tab1', 'Tab 1');
    const { trigger: t2 } = Tab('tab2', 'Tab 2');

    expect(t1.getAttribute('data-state')).toBe('active');
    expect(t2.getAttribute('data-state')).toBe('inactive');
  });

  it('navigates with ArrowRight', () => {
    const { root, list, Tab } = Tabs.Root({ defaultValue: 'tab1' });
    container.appendChild(root);
    const { trigger: t1 } = Tab('tab1', 'Tab 1');
    const { trigger: t2 } = Tab('tab2', 'Tab 2');

    t1.focus();

    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(t2);
  });

  it('navigates with ArrowLeft', () => {
    const { root, list, Tab } = Tabs.Root({ defaultValue: 'tab2' });
    container.appendChild(root);
    const { trigger: t1 } = Tab('tab1', 'Tab 1');
    const { trigger: t2 } = Tab('tab2', 'Tab 2');

    t2.focus();

    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(t1);
  });

  it('uses aria-selected on active tab', () => {
    const { root, Tab } = Tabs.Root({ defaultValue: 'tab1' });
    container.appendChild(root);
    const { trigger: t1 } = Tab('tab1', 'Tab 1');
    const { trigger: t2 } = Tab('tab2', 'Tab 2');

    expect(t1.getAttribute('aria-selected')).toBe('true');
    expect(t2.getAttribute('aria-selected')).toBe('false');
  });
});
