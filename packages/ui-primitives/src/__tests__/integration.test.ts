import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  Accordion,
  Button,
  Checkbox,
  Combobox,
  Dialog,
  Menu,
  Popover,
  Progress,
  Radio,
  Select,
  Slider,
  Switch,
  Tabs,
  Toast,
  Tooltip,
} from '../index';

describe('Integration Tests', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  // IT-7-1: Dialog traps focus and closes on Escape
  it('Dialog traps focus and closes on Escape', () => {
    const { trigger, content, close, state } = Dialog.Root({ modal: true });
    const btn1 = document.createElement('button');
    btn1.textContent = 'First';
    const btn2 = document.createElement('button');
    btn2.textContent = 'Last';
    content.appendChild(btn1);
    content.appendChild(btn2);
    content.appendChild(close);
    container.appendChild(trigger);
    container.appendChild(content);

    // Open dialog
    trigger.click();
    expect(state.open.peek()).toBe(true);

    // Focus should be trapped - Tab from last focusable (close button) should wrap to first
    close.focus();
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(btn1);

    // Press Escape to close
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(state.open.peek()).toBe(false);
    expect(content.getAttribute('data-state')).toBe('closed');
  });

  // IT-7-2: Select keyboard navigation
  it('Select keyboard navigation', () => {
    const { trigger, content, state, Item } = Select.Root();
    container.appendChild(trigger);
    container.appendChild(content);
    const itemA = Item('apple', 'Apple');
    const itemB = Item('banana', 'Banana');
    Item('cherry', 'Cherry');

    // Open select
    trigger.click();
    expect(state.open.peek()).toBe(true);

    // Navigate down
    itemA.focus();
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(itemB);

    // Select with Enter
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(state.value.peek()).toBe('banana');
    expect(state.open.peek()).toBe(false);
  });

  // IT-7-3: Tabs ARIA roles and arrow key navigation
  it('Tabs have correct ARIA roles and arrow key navigation', () => {
    const { root, list, Tab } = Tabs.Root({ defaultValue: 'tab1' });
    container.appendChild(root);
    const { trigger: t1, panel: p1 } = Tab('tab1', 'Tab 1');
    const { trigger: t2, panel: p2 } = Tab('tab2', 'Tab 2');
    const { trigger: t3 } = Tab('tab3', 'Tab 3');

    // Verify ARIA roles
    expect(list.getAttribute('role')).toBe('tablist');
    expect(t1.getAttribute('role')).toBe('tab');
    expect(t2.getAttribute('role')).toBe('tab');
    expect(p1.getAttribute('role')).toBe('tabpanel');
    expect(p2.getAttribute('role')).toBe('tabpanel');

    // ArrowRight moves to next tab
    t1.focus();
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(t2);

    // ArrowRight again
    list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(t3);
  });

  // IT-7-4: All primitives have correct ARIA attributes
  it('all primitives have correct ARIA attributes', () => {
    // Button
    const button = Button.Root();
    expect(button.root.getAttribute('role')).toBe('button');

    // Dialog
    const dialog = Dialog.Root();
    expect(dialog.content.getAttribute('role')).toBe('dialog');
    expect(dialog.content.getAttribute('aria-modal')).toBe('true');

    // Select
    const select = Select.Root();
    expect(select.trigger.getAttribute('role')).toBe('combobox');
    expect(select.content.getAttribute('role')).toBe('listbox');

    // Menu
    const menu = Menu.Root();
    expect(menu.content.getAttribute('role')).toBe('menu');
    expect(menu.trigger.getAttribute('aria-haspopup')).toBe('menu');

    // Tabs
    const tabs = Tabs.Root({ defaultValue: 'a' });
    expect(tabs.list.getAttribute('role')).toBe('tablist');

    // Accordion
    const accordion = Accordion.Root();
    const accItem = accordion.Item('s1');
    expect(accItem.content.getAttribute('role')).toBe('region');

    // Tooltip
    const tooltip = Tooltip.Root();
    expect(tooltip.content.getAttribute('role')).toBe('tooltip');

    // Popover
    const popover = Popover.Root();
    expect(popover.content.getAttribute('role')).toBe('dialog');

    // Toast
    const toast = Toast.Root();
    expect(toast.region.getAttribute('aria-live')).toBe('polite');

    // Combobox
    const combobox = Combobox.Root();
    expect(combobox.input.getAttribute('role')).toBe('combobox');
    expect(combobox.listbox.getAttribute('role')).toBe('listbox');

    // Switch
    const sw = Switch.Root();
    expect(sw.root.getAttribute('role')).toBe('switch');

    // Checkbox
    const checkbox = Checkbox.Root();
    expect(checkbox.root.getAttribute('role')).toBe('checkbox');

    // Radio
    const radio = Radio.Root();
    expect(radio.root.getAttribute('role')).toBe('radiogroup');

    // Slider
    const slider = Slider.Root();
    expect(slider.thumb.getAttribute('role')).toBe('slider');

    // Progress
    const progress = Progress.Root();
    expect(progress.root.getAttribute('role')).toBe('progressbar');
  });

  // IT-7-5: Toast uses aria-live
  it('Toast announces via aria-live region', () => {
    const { region, state, announce } = Toast.Root();
    container.appendChild(region);

    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('role')).toBe('status');

    const msg = announce('New notification');
    expect(state.messages.peek()).toHaveLength(1);
    expect(region.textContent).toContain('New notification');

    // Verify the toast element is in the live region
    const toastEl = region.querySelector(`[data-toast-id="${msg.id}"]`);
    expect(toastEl).toBeTruthy();
    expect(toastEl?.getAttribute('role')).toBe('status');
  });
});
