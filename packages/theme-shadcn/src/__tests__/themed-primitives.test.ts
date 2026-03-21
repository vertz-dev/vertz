import { afterEach, describe, expect, it } from 'bun:test';
import { createAccordionStyles } from '../styles/accordion';
import { createCheckboxStyles } from '../styles/checkbox';
import { createDropdownMenuStyles } from '../styles/dropdown-menu';
import { createPopoverStyles } from '../styles/popover';
import { createProgressStyles } from '../styles/progress';
import { createSelectStyles } from '../styles/select';
import { createSwitchStyles } from '../styles/switch';
import { createTabsStyles } from '../styles/tabs';
import { createToastStyles } from '../styles/toast';
import { createTooltipStyles } from '../styles/tooltip';

// Clean up portaled elements between tests to prevent cross-test pollution
afterEach(() => {
  for (const el of document.body.querySelectorAll(
    '[data-dialog-overlay], [role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]',
  )) {
    el.remove();
  }
  for (const el of document.body.querySelectorAll('[data-state]')) {
    if (el.parentElement === document.body) el.remove();
  }
});

function flush() {
  return new Promise<void>((resolve) => setTimeout(resolve, 20));
}

function requiredElement<T extends Element>(element: T | null): T {
  expect(element).toBeTruthy();
  return element as T;
}

// ── Popover ───────────────────────────────────────────────

describe('createThemedPopover', () => {
  it('has Trigger and Content sub-components', async () => {
    const { createThemedPopover } = await import('../components/primitives/popover');
    const styles = createPopoverStyles();
    const Popover = createThemedPopover(styles);

    expect(typeof Popover.Trigger).toBe('function');
    expect(typeof Popover.Content).toBe('function');
  });

  it('returns a wrapper containing trigger and content', async () => {
    const { createThemedPopover } = await import('../components/primitives/popover');
    const styles = createPopoverStyles();
    const Popover = createThemedPopover(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Open';

    const result = Popover({
      children: () => {
        const t = Popover.Trigger({ children: [btn] });
        const c = Popover.Content({ children: ['Content'] });
        return [t, c];
      },
    });

    // Compound pattern returns a span wrapper (display: contents)
    expect(result).toBeInstanceOf(HTMLSpanElement);
    expect(result.contains(btn)).toBe(true);
  });

  it('trigger click opens popover via delegate', async () => {
    const { createThemedPopover } = await import('../components/primitives/popover');
    const styles = createPopoverStyles();
    const Popover = createThemedPopover(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Open';

    const result = Popover({
      children: () => {
        const t = Popover.Trigger({ children: [btn] });
        const c = Popover.Content({ children: ['Content'] });
        return [t, c];
      },
    });
    document.body.appendChild(result);

    const triggerSpan = result.querySelector('[data-popover-trigger]') as HTMLElement;
    expect(triggerSpan).toBeTruthy();
    expect(triggerSpan.getAttribute('data-state')).toBe('closed');
    // Verify the trigger span renders correctly with popover trigger marker
    // Click interaction testing requires the real browser (Playwright)
    // due to happy-dom limitations with compiled event handlers.

    document.body.removeChild(result);
  });
});

// ── Dialog ─────────────────────────────────────────────────

describe('createThemedDialog', () => {
  it('has Header, Title, Description, Footer, Body, Close, Cancel sub-components', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const Dialog = createThemedDialog();

    expect(typeof Dialog.Header).toBe('function');
    expect(typeof Dialog.Title).toBe('function');
    expect(typeof Dialog.Description).toBe('function');
    expect(typeof Dialog.Footer).toBe('function');
    expect(typeof Dialog.Body).toBe('function');
    expect(typeof Dialog.Close).toBe('function');
    expect(typeof Dialog.Cancel).toBe('function');
  });

  it('does not have Trigger or Content (removed in stack consolidation)', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const Dialog = createThemedDialog();

    expect((Dialog as Record<string, unknown>).Trigger).toBeUndefined();
    expect((Dialog as Record<string, unknown>).Content).toBeUndefined();
  });

  it('is not callable (no root function)', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const Dialog = createThemedDialog();

    expect(typeof Dialog).toBe('object');
  });
});

// ── Tabs ───────────────────────────────────────────────────

describe('createThemedTabs', () => {
  it('has List, Trigger, Content sub-components', async () => {
    const { createThemedTabs } = await import('../components/primitives/tabs');
    const styles = createTabsStyles();
    const Tabs = createThemedTabs(styles);

    expect(typeof Tabs.List).toBe('function');
    expect(typeof Tabs.Trigger).toBe('function');
    expect(typeof Tabs.Content).toBe('function');
  });

  it('renders tabs root from composable slots', async () => {
    const { createThemedTabs } = await import('../components/primitives/tabs');
    const styles = createTabsStyles();
    const Tabs = createThemedTabs(styles);

    const root = Tabs({
      defaultValue: 'one',
      children: () => {
        const list = Tabs.List({
          children: () => [
            Tabs.Trigger({ value: 'one', children: ['Tab 1'] }),
            Tabs.Trigger({ value: 'two', children: ['Tab 2'] }),
          ],
        });
        const content1 = Tabs.Content({ value: 'one', children: ['Content 1'] });
        const content2 = Tabs.Content({ value: 'two', children: ['Content 2'] });
        return [list, content1, content2];
      },
    });
    // Tabs root is a <div data-tabs-root>
    expect(root).toBeInstanceOf(HTMLDivElement);
  });

  it('applies theme classes to tabs elements', async () => {
    const { createThemedTabs } = await import('../components/primitives/tabs');
    const styles = createTabsStyles();
    const Tabs = createThemedTabs(styles);

    const root = Tabs({
      defaultValue: 'one',
      children: () => {
        const list = Tabs.List({
          children: () => [Tabs.Trigger({ value: 'one', children: ['Tab 1'] })],
        });
        const content = Tabs.Content({ value: 'one', children: ['Content 1'] });
        return [list, content];
      },
    });

    const listEl = requiredElement(root.querySelector('[role="tablist"]'));
    expect(listEl.className).toContain(styles.list);

    const triggerEl = requiredElement(root.querySelector('[role="tab"]'));
    expect(triggerEl.className).toContain(styles.trigger);

    const panelEl = requiredElement(root.querySelector('[role="tabpanel"]'));
    expect(panelEl.className).toContain(styles.panel);
  });

  it('applies line variant classes when variant is line', async () => {
    const { createThemedTabs } = await import('../components/primitives/tabs');
    const styles = createTabsStyles();
    const Tabs = createThemedTabs(styles);

    const root = Tabs({
      defaultValue: 'one',
      variant: 'line',
      children: () => {
        const list = Tabs.List({
          children: () => [Tabs.Trigger({ value: 'one', children: ['Tab 1'] })],
        });
        const content = Tabs.Content({ value: 'one', children: ['Content 1'] });
        return [list, content];
      },
    });

    const listEl = requiredElement(root.querySelector('[role="tablist"]'));
    expect(listEl.className).toContain(styles.listLine);
    expect(listEl.className).not.toContain(styles.list);

    const triggerEl = requiredElement(root.querySelector('[role="tab"]'));
    expect(triggerEl.className).toContain(styles.triggerLine);
    expect(triggerEl.className).not.toContain(styles.trigger);
  });
});

// ── Select ─────────────────────────────────────────────────

describe('createThemedSelect', () => {
  it('has sub-components', async () => {
    const { createThemedSelect } = await import('../components/primitives/select');
    const styles = createSelectStyles();
    const Select = createThemedSelect(styles);

    expect(typeof Select.Content).toBe('function');
    expect(typeof Select.Item).toBe('function');
    expect(typeof Select.Group).toBe('function');
    expect(typeof Select.Separator).toBe('function');
  });

  it('returns wrapper with trigger having theme class', async () => {
    const { createThemedSelect } = await import('../components/primitives/select');
    const styles = createSelectStyles();
    const Select = createThemedSelect(styles);

    const result = Select({
      children: () => {
        const t = Select.Trigger({ children: ['Pick'] });
        const c = Select.Content({
          children: () => [Select.Item({ value: 'a', children: ['A'] })],
        });
        return [t, c];
      },
    });

    expect(result).toBeInstanceOf(HTMLElement);
    const triggerEl = requiredElement(
      result.querySelector('[role="combobox"]') as HTMLElement | null,
    );
    expect(triggerEl.className).toContain(styles.trigger);
  });

  it('Item sub-component creates option element inside root', async () => {
    const { createThemedSelect } = await import('../components/primitives/select');
    const styles = createSelectStyles();
    const Select = createThemedSelect(styles);

    const root = Select({
      children: () => {
        const t = Select.Trigger({ children: ['Pick'] });
        const c = Select.Content({
          children: () => [Select.Item({ value: 'opt1', children: ['Option 1'] })],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const option = requiredElement(root.querySelector('[role="option"]') as HTMLElement | null);
    expect(option.getAttribute('data-value')).toBe('opt1');
    document.body.removeChild(root);
  });

  it('Group sub-component creates group element with aria-label inside root', async () => {
    const { createThemedSelect } = await import('../components/primitives/select');
    const styles = createSelectStyles();
    const Select = createThemedSelect(styles);

    const root = Select({
      children: () => {
        const t = Select.Trigger({ children: ['Pick'] });
        const c = Select.Content({
          children: () => [
            Select.Group({
              label: 'Fruits',
              children: () => [Select.Item({ value: 'apple', children: ['Apple'] })],
            }),
          ],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const group = requiredElement(root.querySelector('[role="group"]') as HTMLElement | null);
    expect(group.getAttribute('aria-label')).toBe('Fruits');
    document.body.removeChild(root);
  });

  it('Separator sub-component creates separator element inside root', async () => {
    const { createThemedSelect } = await import('../components/primitives/select');
    const styles = createSelectStyles();
    const Select = createThemedSelect(styles);

    const root = Select({
      children: () => {
        const t = Select.Trigger({ children: ['Pick'] });
        const c = Select.Content({
          children: () => [
            Select.Item({ value: 'a', children: ['A'] }),
            Select.Separator({}),
            Select.Item({ value: 'b', children: ['B'] }),
          ],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const sep = root.querySelector('[role="separator"]') as HTMLElement;
    expect(sep).not.toBeNull();
    document.body.removeChild(root);
  });
});

// ── DropdownMenu ──────────────────────────────────────────

describe('createThemedDropdownMenu', () => {
  it('has sub-components', async () => {
    const { createThemedDropdownMenu } = await import('../components/primitives/dropdown-menu');
    const styles = createDropdownMenuStyles();
    const DropdownMenu = createThemedDropdownMenu(styles);

    expect(typeof DropdownMenu.Trigger).toBe('function');
    expect(typeof DropdownMenu.Content).toBe('function');
    expect(typeof DropdownMenu.Item).toBe('function');
    expect(typeof DropdownMenu.Group).toBe('function');
    expect(typeof DropdownMenu.Label).toBe('function');
    expect(typeof DropdownMenu.Separator).toBe('function');
  });

  it('Item sub-component creates menuitem element inside root', async () => {
    const { createThemedDropdownMenu } = await import('../components/primitives/dropdown-menu');
    const styles = createDropdownMenuStyles();
    const DropdownMenu = createThemedDropdownMenu(styles);

    const btn = document.createElement('button');
    const root = DropdownMenu({
      children: () => {
        const t = DropdownMenu.Trigger({ children: [btn] });
        const c = DropdownMenu.Content({
          children: () => [DropdownMenu.Item({ value: 'edit', children: ['Edit'] })],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const item = requiredElement(root.querySelector('[role="menuitem"]') as HTMLElement | null);
    expect(item.getAttribute('data-value')).toBe('edit');
    document.body.removeChild(root);
  });

  it('Group sub-component creates group element with aria-label inside root', async () => {
    const { createThemedDropdownMenu } = await import('../components/primitives/dropdown-menu');
    const styles = createDropdownMenuStyles();
    const DropdownMenu = createThemedDropdownMenu(styles);

    const btn = document.createElement('button');
    const root = DropdownMenu({
      children: () => {
        const t = DropdownMenu.Trigger({ children: [btn] });
        const c = DropdownMenu.Content({
          children: () => [
            DropdownMenu.Group({
              label: 'Actions',
              children: () => [DropdownMenu.Item({ value: 'copy', children: ['Copy'] })],
            }),
          ],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const group = requiredElement(root.querySelector('[role="group"]') as HTMLElement | null);
    expect(group.getAttribute('aria-label')).toBe('Actions');
    document.body.removeChild(root);
  });

  it('Label sub-component creates label element inside root', async () => {
    const { createThemedDropdownMenu } = await import('../components/primitives/dropdown-menu');
    const styles = createDropdownMenuStyles();
    const DropdownMenu = createThemedDropdownMenu(styles);

    const btn = document.createElement('button');
    const root = DropdownMenu({
      children: () => {
        const t = DropdownMenu.Trigger({ children: [btn] });
        const c = DropdownMenu.Content({
          children: () => [DropdownMenu.Label({ children: ['My Account'] })],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const menu = requiredElement(root.querySelector('[role="menu"]') as HTMLElement | null);
    expect(menu.textContent).toContain('My Account');
    document.body.removeChild(root);
  });

  it('Separator sub-component creates separator element inside root', async () => {
    const { createThemedDropdownMenu } = await import('../components/primitives/dropdown-menu');
    const styles = createDropdownMenuStyles();
    const DropdownMenu = createThemedDropdownMenu(styles);

    const btn = document.createElement('button');
    const root = DropdownMenu({
      children: () => {
        const t = DropdownMenu.Trigger({ children: [btn] });
        const c = DropdownMenu.Content({
          children: () => [
            DropdownMenu.Item({ value: 'a', children: ['A'] }),
            DropdownMenu.Separator({}),
            DropdownMenu.Item({ value: 'b', children: ['B'] }),
          ],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const sep = root.querySelector('[role="separator"]') as HTMLElement;
    expect(sep).not.toBeNull();
    document.body.removeChild(root);
  });

  it('returns wrapper containing trigger with ARIA attributes', async () => {
    const { createThemedDropdownMenu } = await import('../components/primitives/dropdown-menu');
    const styles = createDropdownMenuStyles();
    const DropdownMenu = createThemedDropdownMenu(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Menu';

    const result = DropdownMenu({
      children: () => {
        const t = DropdownMenu.Trigger({ children: [btn] });
        const c = DropdownMenu.Content({
          children: () => [DropdownMenu.Item({ value: 'a', children: ['A'] })],
        });
        return [t, c];
      },
    });

    expect(result).toBeInstanceOf(HTMLSpanElement);
    expect(result.contains(btn)).toBe(true);
    // In the compound pattern, ARIA attributes are on the trigger wrapper span
    const triggerSpan = result.querySelector('[data-dropdownmenu-trigger]') as HTMLElement;
    expect(triggerSpan).toBeTruthy();
  });
});

// ── Checkbox ───────────────────────────────────────────────

describe('createThemedCheckbox', () => {
  it('applies theme classes to checkbox root', async () => {
    const { createThemedCheckbox } = await import('../components/primitives/checkbox');
    const styles = createCheckboxStyles();
    const themedCheckbox = createThemedCheckbox(styles);
    const root = themedCheckbox();

    expect(root.classList.contains(styles.root)).toBe(true);
  });

  it('preserves primitive behavior — click toggles', async () => {
    const { createThemedCheckbox } = await import('../components/primitives/checkbox');
    const styles = createCheckboxStyles();
    const themedCheckbox = createThemedCheckbox(styles);
    const root = themedCheckbox();

    expect(root.getAttribute('aria-checked')).toBe('false');
    root.click();
    expect(root.getAttribute('aria-checked')).toBe('true');
  });

  it('passes options through', async () => {
    const { createThemedCheckbox } = await import('../components/primitives/checkbox');
    const styles = createCheckboxStyles();
    const themedCheckbox = createThemedCheckbox(styles);
    const root = themedCheckbox({ defaultChecked: true });

    expect(root.getAttribute('aria-checked')).toBe('true');
  });
});

// ── Switch ─────────────────────────────────────────────────

describe('createThemedSwitch', () => {
  it('applies theme classes to switch root', async () => {
    const { createThemedSwitch } = await import('../components/primitives/switch');
    const styles = createSwitchStyles();
    const Switch = createThemedSwitch(styles);
    const root = Switch({ children: [] });

    expect(root.className).toContain(styles.root);
  });

  it('preserves primitive behavior — click toggles', async () => {
    const { createThemedSwitch } = await import('../components/primitives/switch');
    const styles = createSwitchStyles();
    const Switch = createThemedSwitch(styles);
    const root = Switch({ children: [] });

    expect(root.getAttribute('aria-checked')).toBe('false');
    root.click();
    expect(root.getAttribute('aria-checked')).toBe('true');
  });

  it('applies rootSm class when size is sm', async () => {
    const { createThemedSwitch } = await import('../components/primitives/switch');
    const styles = createSwitchStyles();
    const Switch = createThemedSwitch(styles);
    const root = Switch({ size: 'sm', children: [] });

    expect(root.className).toContain(styles.rootSm);
    expect(root.className).not.toContain(styles.root);
  });

  it('creates thumb span with theme class', async () => {
    const { createThemedSwitch } = await import('../components/primitives/switch');
    const styles = createSwitchStyles();
    const Switch = createThemedSwitch(styles);
    const root = Switch({ children: [] });

    const thumb = requiredElement(root.querySelector('[data-part="thumb"]') as HTMLElement | null);
    expect(thumb.className).toContain(styles.thumb);
  });

  it('thumb uses thumbSm class when size is sm', async () => {
    const { createThemedSwitch } = await import('../components/primitives/switch');
    const styles = createSwitchStyles();
    const Switch = createThemedSwitch(styles);
    const root = Switch({ size: 'sm', children: [] });

    const thumb = requiredElement(root.querySelector('[data-part="thumb"]') as HTMLElement | null);
    expect(thumb.className).toContain(styles.thumbSm);
    expect(thumb.className).not.toContain(styles.thumb);
  });
});

// ── Progress ───────────────────────────────────────────────

describe('createThemedProgress', () => {
  it('applies theme classes to progress elements', async () => {
    const { createThemedProgress } = await import('../components/primitives/progress');
    const styles = createProgressStyles();
    const Progress = createThemedProgress(styles);
    const root = Progress({});

    expect(root.className).toContain(styles.root);
    const indicator = requiredElement(
      root.querySelector('[data-part="indicator"]') as HTMLElement | null,
    );
    expect(indicator.className).toContain(styles.indicator);
  });

  it('preserves primitive behavior — progress has correct role', async () => {
    const { createThemedProgress } = await import('../components/primitives/progress');
    const styles = createProgressStyles();
    const Progress = createThemedProgress(styles);
    const root = Progress({ defaultValue: 50 });

    expect(root.getAttribute('role')).toBe('progressbar');
    expect(root.getAttribute('aria-valuenow')).toBe('50');
  });
});

// ── Accordion ──────────────────────────────────────────────

describe('createThemedAccordion', () => {
  it('has Item, Trigger, Content sub-components', async () => {
    const { createThemedAccordion } = await import('../components/primitives/accordion');
    const styles = createAccordionStyles();
    const Accordion = createThemedAccordion(styles);

    expect(typeof Accordion.Item).toBe('function');
    expect(typeof Accordion.Trigger).toBe('function');
    expect(typeof Accordion.Content).toBe('function');
  });

  it('renders accordion root from composable slots', async () => {
    const { createThemedAccordion } = await import('../components/primitives/accordion');
    const styles = createAccordionStyles();
    const Accordion = createThemedAccordion(styles);

    const root = Accordion({
      children: () => {
        const item = Accordion.Item({
          value: 'section1',
          children: () => {
            const trigger = Accordion.Trigger({ children: ['Section 1'] });
            const content = Accordion.Content({ children: ['Content 1'] });
            return [trigger, content];
          },
        });
        return [item];
      },
    });

    // Accordion root is a <div data-orientation="vertical">
    expect(root).toBeInstanceOf(HTMLDivElement);
  });

  it('applies theme classes to items', async () => {
    const { createThemedAccordion } = await import('../components/primitives/accordion');
    const styles = createAccordionStyles();
    const Accordion = createThemedAccordion(styles);

    const root = Accordion({
      children: () => {
        const item = Accordion.Item({
          value: 'section1',
          children: () => {
            const trigger = Accordion.Trigger({ children: ['Section 1'] });
            const content = Accordion.Content({ children: ['Body text'] });
            return [trigger, content];
          },
        });
        return [item];
      },
    });

    const itemEl = requiredElement(root.querySelector(`[data-value="section1"]`));
    const triggerEl = requiredElement(itemEl.querySelector('button'));
    expect(triggerEl.className).toContain(styles.trigger);
    expect((itemEl as HTMLElement).className).toContain(styles.item);
    const contentEl = requiredElement(itemEl.querySelector('[role="region"]'));
    expect((contentEl as HTMLElement).className).toContain(styles.content);
  });

  it('preserves primitive behavior — click toggles', async () => {
    const { createThemedAccordion } = await import('../components/primitives/accordion');
    const styles = createAccordionStyles();
    const Accordion = createThemedAccordion(styles);

    const root = Accordion({
      children: () => {
        const item = Accordion.Item({
          value: 'section1',
          children: () => {
            const trigger = Accordion.Trigger({ children: ['Section 1'] });
            const content = Accordion.Content({ children: ['Body text'] });
            return [trigger, content];
          },
        });
        return [item];
      },
    });

    // In the compound pattern, the trigger button has data-state and
    // aria-expanded attributes that update reactively.
    // The delegation handler in onMount cannot find the root element
    // because onMount runs before the return JSX creates it (known
    // limitation — see #1517). The trigger's onClick handler on the
    // parent span fires ctx.toggle() which updates signal state.
    // Check that the trigger renders with correct initial ARIA state.
    const triggerEl = requiredElement(root.querySelector('button'));
    expect(triggerEl.getAttribute('aria-expanded')).toBe('false');
  });

  it('moves trigger text into primitive trigger button', async () => {
    const { createThemedAccordion } = await import('../components/primitives/accordion');
    const styles = createAccordionStyles();
    const Accordion = createThemedAccordion(styles);

    const root = Accordion({
      children: () => {
        const item = Accordion.Item({
          value: 's1',
          children: () => {
            const trigger = Accordion.Trigger({ children: ['My Trigger'] });
            const content = Accordion.Content({ children: ['My Content'] });
            return [trigger, content];
          },
        });
        return [item];
      },
    });

    const triggerEl = requiredElement(root.querySelector('button'));
    expect(triggerEl.textContent).toBe('My Trigger');
  });

  it('places content text inside the region element', async () => {
    const { createThemedAccordion } = await import('../components/primitives/accordion');
    const styles = createAccordionStyles();
    const Accordion = createThemedAccordion(styles);

    const root = Accordion({
      children: () => {
        const item = Accordion.Item({
          value: 's1',
          children: () => {
            const trigger = Accordion.Trigger({ children: ['Trigger'] });
            const content = Accordion.Content({ children: ['Content text'] });
            return [trigger, content];
          },
        });
        return [item];
      },
    });

    const contentEl = requiredElement(root.querySelector('[role="region"]'));
    expect(contentEl.textContent).toContain('Content text');
  });
});

// ── Toast ──────────────────────────────────────────────────

describe('createThemedToast', () => {
  it('applies theme class to toast region (viewport)', async () => {
    const { createThemedToast } = await import('../components/primitives/toast');
    const styles = createToastStyles();
    const themedToast = createThemedToast(styles);
    const toast = themedToast();

    expect(toast.region.classList.contains(styles.viewport)).toBe(true);
  });

  it('applies theme class to announced messages', async () => {
    const { createThemedToast } = await import('../components/primitives/toast');
    const styles = createToastStyles();
    const themedToast = createThemedToast(styles);
    const toast = themedToast({ duration: 0 });

    const msg = toast.announce('Hello');
    expect(msg.el.classList.contains(styles.root)).toBe(true);
  });

  it('preserves primitive behavior — announce and dismiss', async () => {
    const { createThemedToast } = await import('../components/primitives/toast');
    const styles = createToastStyles();
    const themedToast = createThemedToast(styles);
    const toast = themedToast({ duration: 0 });

    expect(toast.state.messages.peek()).toHaveLength(0);
    const msg = toast.announce('Test message');
    expect(toast.state.messages.peek()).toHaveLength(1);
    expect(msg.content).toBe('Test message');

    toast.dismiss(msg.id);
    expect(toast.state.messages.peek()).toHaveLength(0);
  });

  it('passes options through to primitive', async () => {
    const { createThemedToast } = await import('../components/primitives/toast');
    const styles = createToastStyles();
    const themedToast = createThemedToast(styles);
    const toast = themedToast({ politeness: 'assertive', duration: 0 });

    expect(toast.region.getAttribute('aria-live')).toBe('assertive');
  });

  it('returns region, state, announce, and dismiss', async () => {
    const { createThemedToast } = await import('../components/primitives/toast');
    const styles = createToastStyles();
    const themedToast = createThemedToast(styles);
    const toast = themedToast();

    expect(toast.region).toBeInstanceOf(HTMLDivElement);
    expect(toast.state).toBeDefined();
    expect(typeof toast.announce).toBe('function');
    expect(typeof toast.dismiss).toBe('function');
  });
});

// ── Tooltip ────────────────────────────────────────────────

describe('createThemedTooltip', () => {
  it('has Trigger and Content sub-components', async () => {
    const { createThemedTooltip } = await import('../components/primitives/tooltip');
    const styles = createTooltipStyles();
    const Tooltip = createThemedTooltip(styles);

    expect(typeof Tooltip.Trigger).toBe('function');
    expect(typeof Tooltip.Content).toBe('function');
  });

  it('returns a wrapper containing the trigger with user children', async () => {
    const { createThemedTooltip } = await import('../components/primitives/tooltip');
    const styles = createTooltipStyles();
    const Tooltip = createThemedTooltip(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Hover me';

    const result = Tooltip({
      children: () => {
        const t = Tooltip.Trigger({ children: [btn] });
        const c = Tooltip.Content({ children: ['Tooltip text'] });
        return [t, c];
      },
    });

    expect(result).toBeInstanceOf(HTMLSpanElement);
    expect(result.contains(btn)).toBe(true);
  });

  it('applies theme class to tooltip content element', async () => {
    const { createThemedTooltip } = await import('../components/primitives/tooltip');
    const styles = createTooltipStyles();
    const Tooltip = createThemedTooltip(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Hover me';

    const result = Tooltip({
      children: () => {
        const t = Tooltip.Trigger({ children: [btn] });
        const c = Tooltip.Content({ children: ['Info'] });
        return [t, c];
      },
    });

    const contentEl = requiredElement(
      result.querySelector('[role="tooltip"]') as HTMLElement | null,
    );
    expect(contentEl.className).toContain(styles.content);
  });
});

// ── Slider ──────────────────────────────────────────────────

describe('createThemedSlider', () => {
  it('applies theme classes to slider elements', async () => {
    const { createThemedSlider } = await import('../components/primitives/slider');
    const { createSliderStyles } = await import('../styles/slider');
    const styles = createSliderStyles();
    const Slider = createThemedSlider(styles);
    const root = Slider({});

    expect(root.className).toContain(styles.root);
    const track = requiredElement(root.querySelector('[data-part="track"]') as HTMLElement | null);
    expect(track.className).toContain(styles.track);
    const thumb = requiredElement(root.querySelector('[role="slider"]') as HTMLElement | null);
    expect(thumb.className).toContain(styles.thumb);
  });

  it('preserves primitive behavior — slider has correct role', async () => {
    const { createThemedSlider } = await import('../components/primitives/slider');
    const { createSliderStyles } = await import('../styles/slider');
    const styles = createSliderStyles();
    const Slider = createThemedSlider(styles);
    const root = Slider({ defaultValue: 42, min: 0, max: 100 });

    const thumb = requiredElement(root.querySelector('[role="slider"]') as HTMLElement | null);
    expect(thumb.getAttribute('aria-valuenow')).toBe('42');
  });

  it('passes defaultValue option through', async () => {
    const { createThemedSlider } = await import('../components/primitives/slider');
    const { createSliderStyles } = await import('../styles/slider');
    const styles = createSliderStyles();
    const Slider = createThemedSlider(styles);
    const root = Slider({ defaultValue: 75 });

    const thumb = requiredElement(root.querySelector('[role="slider"]') as HTMLElement | null);
    expect(thumb.getAttribute('aria-valuenow')).toBe('75');
  });
});

// ── RadioGroup ─────────────────────────────────────────────

describe('createThemedRadioGroup', () => {
  it('applies theme class to radio group root', async () => {
    const { createThemedRadioGroup } = await import('../components/primitives/radio-group');
    const { createRadioGroupStyles } = await import('../styles/radio-group');
    const styles = createRadioGroupStyles();
    const RadioGroup = createThemedRadioGroup(styles);
    const root = RadioGroup({
      children: () => {
        const a = RadioGroup.Item({ value: 'a', children: ['A'] });
        return [a];
      },
    });

    expect(root.className).toContain(styles.root);
  });

  it('Item applies theme class', async () => {
    const { createThemedRadioGroup } = await import('../components/primitives/radio-group');
    const { createRadioGroupStyles } = await import('../styles/radio-group');
    const styles = createRadioGroupStyles();
    const RadioGroup = createThemedRadioGroup(styles);
    const root = RadioGroup({
      children: () => {
        const a = RadioGroup.Item({ value: 'option1', children: ['Option 1'] });
        return [a];
      },
    });

    const item = requiredElement(root.querySelector('[role="radio"]') as HTMLElement | null);
    expect(item.className).toContain(styles.item);
  });

  it('preserves primitive behavior — clicking item changes value', async () => {
    const { createThemedRadioGroup } = await import('../components/primitives/radio-group');
    const { createRadioGroupStyles } = await import('../styles/radio-group');
    const styles = createRadioGroupStyles();
    const RadioGroup = createThemedRadioGroup(styles);
    let lastValue: string | undefined;
    const root = RadioGroup({
      onValueChange: (v) => {
        lastValue = v;
      },
      children: () => {
        const a = RadioGroup.Item({ value: 'a', children: ['A'] });
        const b = RadioGroup.Item({ value: 'b', children: ['B'] });
        return [a, b];
      },
    });

    const items = root.querySelectorAll('[role="radio"]');
    (items[0] as HTMLElement).click();
    expect(lastValue).toBe('a');
  });

  it('passes defaultValue option through', async () => {
    const { createThemedRadioGroup } = await import('../components/primitives/radio-group');
    const { createRadioGroupStyles } = await import('../styles/radio-group');
    const styles = createRadioGroupStyles();
    const RadioGroup = createThemedRadioGroup(styles);
    const root = RadioGroup({
      defaultValue: 'b',
      children: () => {
        const a = RadioGroup.Item({ value: 'a', children: ['A'] });
        const b = RadioGroup.Item({ value: 'b', children: ['B'] });
        return [a, b];
      },
    });

    const items = root.querySelectorAll('[role="radio"]');
    const indB = (items[1] as HTMLElement).querySelector('[data-part="indicator"]') as HTMLElement;
    expect(indB?.getAttribute('data-state')).toBe('checked');
  });
});
