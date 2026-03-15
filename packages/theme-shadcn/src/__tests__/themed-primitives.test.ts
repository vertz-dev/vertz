import { afterEach, describe, expect, it } from 'bun:test';
import { createAccordionStyles } from '../styles/accordion';
import { createAlertDialogStyles } from '../styles/alert-dialog';
import { createCheckboxStyles } from '../styles/checkbox';
import { createDialogStyles } from '../styles/dialog';
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

    expect(result).toBeInstanceOf(HTMLDivElement);
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

    expect(btn.getAttribute('data-state')).toBe('closed');
    btn.click();
    expect(btn.getAttribute('data-state')).toBe('open');

    document.body.removeChild(result);
  });
});

// ── AlertDialog ────────────────────────────────────────────

describe('createThemedAlertDialog', () => {
  it('has all sub-components', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    expect(typeof AlertDialog.Trigger).toBe('function');
    expect(typeof AlertDialog.Content).toBe('function');
    expect(typeof AlertDialog.Title).toBe('function');
    expect(typeof AlertDialog.Description).toBe('function');
    expect(typeof AlertDialog.Footer).toBe('function');
    expect(typeof AlertDialog.Cancel).toBe('function');
    expect(typeof AlertDialog.Action).toBe('function');
  });

  it('sets role="alertdialog" on content element', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const trigger = document.createElement('button');
    const root = AlertDialog({
      children: () => {
        const t = AlertDialog.Trigger({ children: [trigger] });
        const c = AlertDialog.Content({
          children: [AlertDialog.Title({ children: ['Confirm'] })],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const content = root.querySelector('[role="alertdialog"]');
    expect(content).toBeTruthy();

    document.body.removeChild(root);
  });

  it('applies overlay and panel theme classes', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const trigger = document.createElement('button');
    const root = AlertDialog({
      children: () => {
        const t = AlertDialog.Trigger({ children: [trigger] });
        const c = AlertDialog.Content({
          children: [AlertDialog.Title({ children: ['Confirm'] })],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const overlay = root.querySelector('[data-alertdialog-overlay]');
    const panel = root.querySelector('[role="alertdialog"]');
    expect(overlay).toBeTruthy();
    expect(panel!.className).toContain(styles.panel);

    document.body.removeChild(root);
  });

  it('links content to description via aria-describedby', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const trigger = document.createElement('button');
    const root = AlertDialog({
      children: () => {
        const t = AlertDialog.Trigger({ children: [trigger] });
        const c = AlertDialog.Content({
          children: [
            AlertDialog.Title({ children: ['Confirm'] }),
            AlertDialog.Description({ children: ['This is permanent.'] }),
          ],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const content = root.querySelector('[role="alertdialog"]');
    const describedBy = content!.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    document.body.removeChild(root);
  });

  it('trigger click opens the alert dialog', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const btn = document.createElement('button');
    const root = AlertDialog({
      children: () => {
        const t = AlertDialog.Trigger({ children: [btn] });
        const c = AlertDialog.Content({
          children: [AlertDialog.Title({ children: ['Confirm'] })],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    expect(btn.getAttribute('data-state')).toBe('closed');
    btn.click();
    expect(btn.getAttribute('data-state')).toBe('open');

    document.body.removeChild(root);
  });

  it('cancel button closes the dialog', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const btn = document.createElement('button');
    let cancelEl!: HTMLElement;
    const root = AlertDialog({
      children: () => {
        const t = AlertDialog.Trigger({ children: [btn] });
        cancelEl = AlertDialog.Cancel({ children: ['Cancel'] });
        const c = AlertDialog.Content({
          children: [
            AlertDialog.Title({ children: ['Confirm'] }),
            AlertDialog.Footer({ children: [cancelEl] }),
          ],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    btn.click();
    expect(btn.getAttribute('data-state')).toBe('open');
    cancelEl.click();
    expect(btn.getAttribute('data-state')).toBe('closed');

    document.body.removeChild(root);
  });

  it('action button closes the dialog', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const btn = document.createElement('button');
    let actionEl!: HTMLElement;
    const root = AlertDialog({
      children: () => {
        const t = AlertDialog.Trigger({ children: [btn] });
        actionEl = AlertDialog.Action({ children: ['Continue'] });
        const c = AlertDialog.Content({
          children: [
            AlertDialog.Title({ children: ['Confirm'] }),
            AlertDialog.Footer({ children: [actionEl] }),
          ],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    btn.click();
    expect(btn.getAttribute('data-state')).toBe('open');
    actionEl.click();
    expect(btn.getAttribute('data-state')).toBe('closed');

    document.body.removeChild(root);
  });

  it('Cancel forwards onClick handler', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    let called = false;
    const cancel = AlertDialog.Cancel({
      children: 'Cancel',
      onClick: () => {
        called = true;
      },
    });
    cancel.click();
    expect(called).toBe(true);
  });

  it('Action forwards onClick handler', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    let called = false;
    const action = AlertDialog.Action({
      children: 'Delete',
      onClick: () => {
        called = true;
      },
    });
    action.click();
    expect(called).toBe(true);
  });

  it('Action disabled={true} disables the button', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const action = AlertDialog.Action({ children: 'Delete', disabled: true });
    expect(action.disabled).toBe(true);
  });

  it('Action disabled={false} does not disable the button', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const action = AlertDialog.Action({ children: 'Delete', disabled: false });
    expect(action.disabled).toBe(false);
  });

  it('Action fires user onClick AND auto-closes when inside Root', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    let clicked = false;
    const btn = document.createElement('button');
    btn.textContent = 'Delete';
    const triggerSlot = AlertDialog.Trigger({ children: btn });
    const action = AlertDialog.Action({
      children: 'Confirm',
      onClick: () => {
        clicked = true;
      },
    });
    const contentSlot = AlertDialog.Content({
      children: [
        AlertDialog.Title({ children: 'Confirm' }),
        AlertDialog.Footer({ children: action }),
      ],
    });

    AlertDialog({ defaultOpen: true, children: [triggerSlot, contentSlot] });

    expect(btn.getAttribute('data-state')).toBe('open');
    action.click();
    expect(clicked).toBe(true);
    expect(btn.getAttribute('data-state')).toBe('closed');
  });

  it('Cancel fires user onClick AND auto-closes when inside Root', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    let clicked = false;
    const btn = document.createElement('button');
    btn.textContent = 'Delete';
    const triggerSlot = AlertDialog.Trigger({ children: btn });
    const cancel = AlertDialog.Cancel({
      children: 'Dismiss',
      onClick: () => {
        clicked = true;
      },
    });
    const contentSlot = AlertDialog.Content({
      children: [
        AlertDialog.Title({ children: 'Confirm' }),
        AlertDialog.Footer({ children: cancel }),
      ],
    });

    AlertDialog({ defaultOpen: true, children: [triggerSlot, contentSlot] });

    expect(btn.getAttribute('data-state')).toBe('open');
    cancel.click();
    expect(clicked).toBe(true);
    expect(btn.getAttribute('data-state')).toBe('closed');
  });

  it('Escape key does NOT close the alert dialog', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const btn = document.createElement('button');
    const root = AlertDialog({
      children: () => {
        const t = AlertDialog.Trigger({ children: [btn] });
        const c = AlertDialog.Content({
          children: [AlertDialog.Title({ children: ['Confirm'] })],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    btn.click();
    expect(btn.getAttribute('data-state')).toBe('open');
    const content = root.querySelector('[role="alertdialog"]')!;
    content.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(btn.getAttribute('data-state')).toBe('open');

    document.body.removeChild(root);
  });

  it('overlay click does NOT close the alert dialog', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const btn = document.createElement('button');
    const root = AlertDialog({
      children: () => {
        const t = AlertDialog.Trigger({ children: [btn] });
        const c = AlertDialog.Content({
          children: [AlertDialog.Title({ children: ['Confirm'] })],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    btn.click();
    expect(btn.getAttribute('data-state')).toBe('open');
    const overlay = root.querySelector('[data-alertdialog-overlay]') as HTMLElement;
    overlay.click();
    expect(btn.getAttribute('data-state')).toBe('open');

    document.body.removeChild(root);
  });
});

// ── Dialog ─────────────────────────────────────────────────

describe('createThemedDialog', () => {
  it('has Trigger, Content, Title, Description, Footer, Close sub-components', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const Dialog = createThemedDialog(styles);

    expect(typeof Dialog.Trigger).toBe('function');
    expect(typeof Dialog.Content).toBe('function');
    expect(typeof Dialog.Title).toBe('function');
    expect(typeof Dialog.Description).toBe('function');
    expect(typeof Dialog.Footer).toBe('function');
    expect(typeof Dialog.Close).toBe('function');
  });

  it('renders overlay and content elements', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const Dialog = createThemedDialog(styles);

    const trigger = document.createElement('button');
    const root = Dialog({
      children: () => {
        const t = Dialog.Trigger({ children: [trigger] });
        const c = Dialog.Content({
          children: [Dialog.Title({ children: ['Test Title'] })],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const overlay = root.querySelector('[data-dialog-overlay]');
    const content = root.querySelector('[role="dialog"]');
    expect(overlay).toBeTruthy();
    expect(content).toBeTruthy();

    document.body.removeChild(root);
  });

  it('applies theme classes to panel and close button', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const Dialog = createThemedDialog(styles);

    const trigger = document.createElement('button');
    const root = Dialog({
      children: () => {
        const t = Dialog.Trigger({ children: [trigger] });
        const c = Dialog.Content({ children: ['Hello'] });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const content = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(content.className).toContain(styles.panel);

    const closeBtn = content.querySelector(`.${styles.close}`);
    expect(closeBtn).toBeTruthy();

    document.body.removeChild(root);
  });

  it('trigger click opens the dialog', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const Dialog = createThemedDialog(styles);

    const btn = document.createElement('button');
    const root = Dialog({
      children: () => {
        const t = Dialog.Trigger({ children: [btn] });
        const c = Dialog.Content({ children: ['Content'] });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const content = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(content.getAttribute('data-state')).toBe('closed');

    btn.click();
    expect(content.getAttribute('data-state')).toBe('open');

    document.body.removeChild(root);
  });

  it('returns a wrapper element containing the trigger', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const Dialog = createThemedDialog(styles);

    const btn = document.createElement('button');
    const root = Dialog({
      children: () => {
        const t = Dialog.Trigger({ children: [btn] });
        const c = Dialog.Content({ children: ['Content'] });
        return [t, c];
      },
    });

    expect(root).toBeInstanceOf(HTMLDivElement);
    expect(root.contains(btn)).toBe(true);
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

    const listEl = root.querySelector('[role="tablist"]')!;
    expect(listEl.className).toContain(styles.list);

    const triggerEl = root.querySelector('[role="tab"]')!;
    expect(triggerEl.className).toContain(styles.trigger);

    const panelEl = root.querySelector('[role="tabpanel"]')!;
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

    const listEl = root.querySelector('[role="tablist"]')!;
    expect(listEl.className).toContain(styles.listLine);
    expect(listEl.className).not.toContain(styles.list);

    const triggerEl = root.querySelector('[role="tab"]')!;
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
    const triggerEl = result.querySelector('[role="combobox"]') as HTMLElement;
    expect(triggerEl).not.toBeNull();
    expect(triggerEl!.className).toContain(styles.trigger);
  });

  it('Item sub-component creates marker element with data-slot', async () => {
    const { createThemedSelect } = await import('../components/primitives/select');
    const styles = createSelectStyles();
    const Select = createThemedSelect(styles);

    const item = Select.Item({ value: 'opt1', children: 'Option 1' });
    expect(item.dataset.slot).toBe('select-item');
    expect(item.dataset.value).toBe('opt1');
  });

  it('Group sub-component creates marker element with data-slot and data-label', async () => {
    const { createThemedSelect } = await import('../components/primitives/select');
    const styles = createSelectStyles();
    const Select = createThemedSelect(styles);

    const group = Select.Group({
      label: 'Fruits',
      children: Select.Item({ value: 'apple', children: 'Apple' }),
    });

    expect(group.dataset.slot).toBe('select-group');
    expect(group.dataset.label).toBe('Fruits');
  });

  it('Separator sub-component creates marker element', async () => {
    const { createThemedSelect } = await import('../components/primitives/select');
    const styles = createSelectStyles();
    const Select = createThemedSelect(styles);

    const sep = Select.Separator({});
    expect(sep.dataset.slot).toBe('select-separator');
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

  it('Item sub-component creates marker with data-slot', async () => {
    const { createThemedDropdownMenu } = await import('../components/primitives/dropdown-menu');
    const styles = createDropdownMenuStyles();
    const DropdownMenu = createThemedDropdownMenu(styles);

    const item = DropdownMenu.Item({ value: 'edit', children: 'Edit' });
    expect(item.dataset.slot).toBe('menu-item');
    expect(item.dataset.value).toBe('edit');
  });

  it('Group sub-component creates marker with data-slot and data-label', async () => {
    const { createThemedDropdownMenu } = await import('../components/primitives/dropdown-menu');
    const styles = createDropdownMenuStyles();
    const DropdownMenu = createThemedDropdownMenu(styles);

    const group = DropdownMenu.Group({
      label: 'Actions',
      children: DropdownMenu.Item({ value: 'copy', children: 'Copy' }),
    });
    expect(group.dataset.slot).toBe('menu-group');
    expect(group.dataset.label).toBe('Actions');
  });

  it('Label sub-component creates marker with data-slot', async () => {
    const { createThemedDropdownMenu } = await import('../components/primitives/dropdown-menu');
    const styles = createDropdownMenuStyles();
    const DropdownMenu = createThemedDropdownMenu(styles);

    const label = DropdownMenu.Label({ children: 'My Account' });
    expect(label.dataset.slot).toBe('menu-label');
    expect(label.textContent).toBe('My Account');
  });

  it('Separator sub-component creates marker with data-slot', async () => {
    const { createThemedDropdownMenu } = await import('../components/primitives/dropdown-menu');
    const styles = createDropdownMenuStyles();
    const DropdownMenu = createThemedDropdownMenu(styles);

    const sep = DropdownMenu.Separator({});
    expect(sep.dataset.slot).toBe('menu-separator');
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

    expect(result).toBeInstanceOf(HTMLDivElement);
    expect(result.contains(btn)).toBe(true);
    expect(btn.getAttribute('aria-haspopup')).toBe('menu');
    expect(btn.getAttribute('aria-controls')).toBeTruthy();
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
    const themedSwitch = createThemedSwitch(styles);
    const root = themedSwitch();

    expect(root.classList.contains(styles.root)).toBe(true);
  });

  it('preserves primitive behavior — click toggles', async () => {
    const { createThemedSwitch } = await import('../components/primitives/switch');
    const styles = createSwitchStyles();
    const themedSwitch = createThemedSwitch(styles);
    const root = themedSwitch();

    expect(root.getAttribute('aria-checked')).toBe('false');
    root.click();
    expect(root.getAttribute('aria-checked')).toBe('true');
  });

  it('applies rootSm class when size is sm', async () => {
    const { createThemedSwitch } = await import('../components/primitives/switch');
    const styles = createSwitchStyles();
    const themedSwitch = createThemedSwitch(styles);
    const root = themedSwitch({ size: 'sm' });

    expect(root.classList.contains(styles.rootSm)).toBe(true);
    expect(root.classList.contains(styles.root)).toBe(false);
  });

  it('creates thumb span with theme class', async () => {
    const { createThemedSwitch } = await import('../components/primitives/switch');
    const styles = createSwitchStyles();
    const themedSwitch = createThemedSwitch(styles);
    const root = themedSwitch();

    const thumb = root.querySelector('span');
    expect(thumb).not.toBeNull();
    expect(thumb!.classList.contains(styles.thumb)).toBe(true);
  });

  it('thumb uses thumbSm class when size is sm', async () => {
    const { createThemedSwitch } = await import('../components/primitives/switch');
    const styles = createSwitchStyles();
    const themedSwitch = createThemedSwitch(styles);
    const root = themedSwitch({ size: 'sm' });

    const thumb = root.querySelector('span');
    expect(thumb).not.toBeNull();
    expect(thumb!.classList.contains(styles.thumbSm)).toBe(true);
    expect(thumb!.classList.contains(styles.thumb)).toBe(false);
  });
});

// ── Progress ───────────────────────────────────────────────

describe('createThemedProgress', () => {
  it('applies theme classes to progress elements', async () => {
    const { createThemedProgress } = await import('../components/primitives/progress');
    const styles = createProgressStyles();
    const themedProgress = createThemedProgress(styles);
    const progress = themedProgress();

    expect(progress.root.classList.contains(styles.root)).toBe(true);
    expect(progress.indicator.classList.contains(styles.indicator)).toBe(true);
  });

  it('preserves primitive behavior — setValue', async () => {
    const { createThemedProgress } = await import('../components/primitives/progress');
    const styles = createProgressStyles();
    const themedProgress = createThemedProgress(styles);
    const progress = themedProgress();

    progress.setValue(50);
    expect(progress.state.value.peek()).toBe(50);
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

    const itemEl = root.querySelector(`[data-value="section1"]`)!;
    expect(itemEl).toBeTruthy();
    const triggerEl = itemEl.querySelector('button')!;
    expect(triggerEl.className).toContain(styles.trigger);
    expect((itemEl as HTMLElement).className).toContain(styles.item);
    const contentEl = itemEl.querySelector('[role="region"]')!;
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

    const triggerEl = root.querySelector('button')!;
    expect(triggerEl.getAttribute('aria-expanded')).toBe('false');
    triggerEl.click();
    expect(triggerEl.getAttribute('aria-expanded')).toBe('true');
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

    const triggerEl = root.querySelector('button')!;
    expect(triggerEl.textContent).toBe('My Trigger');
  });

  it('places content text inside the region element', async () => {
    const { createThemedAccordion } = await import('../components/primitives/accordion');
    const styles = createAccordionStyles();
    const Accordion = createThemedAccordion(styles);

    const trigger = Accordion.Trigger({ children: 'Trigger' });
    const content = Accordion.Content({ children: 'Content text' });
    const item = Accordion.Item({ value: 's1', children: () => [trigger, content] });
    const root = Accordion({ children: () => [item] });

    const contentEl = root.querySelector('[role="region"]')!;
    expect(contentEl).toBeTruthy();
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

    expect(result).toBeInstanceOf(HTMLDivElement);
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

    const contentEl = result.querySelector('[role="tooltip"]') as HTMLElement;
    expect(contentEl).toBeTruthy();
    expect(contentEl!.className).toContain(styles.content);
  });
});

// ── Slider ──────────────────────────────────────────────────

describe('createThemedSlider', () => {
  it('applies theme classes to slider elements', async () => {
    const { createThemedSlider } = await import('../components/primitives/slider');
    const { createSliderStyles } = await import('../styles/slider');
    const styles = createSliderStyles();
    const themedSlider = createThemedSlider(styles);
    const slider = themedSlider();

    expect(slider.root.classList.contains(styles.root)).toBe(true);
    expect(slider.track.classList.contains(styles.track)).toBe(true);
    expect(slider.thumb.classList.contains(styles.thumb)).toBe(true);
  });

  it('preserves primitive behavior — state tracks value', async () => {
    const { createThemedSlider } = await import('../components/primitives/slider');
    const { createSliderStyles } = await import('../styles/slider');
    const styles = createSliderStyles();
    const themedSlider = createThemedSlider(styles);
    const slider = themedSlider({ defaultValue: 42, min: 0, max: 100 });

    expect(slider.state.value.peek()).toBe(42);
  });

  it('passes defaultValue option through', async () => {
    const { createThemedSlider } = await import('../components/primitives/slider');
    const { createSliderStyles } = await import('../styles/slider');
    const styles = createSliderStyles();
    const themedSlider = createThemedSlider(styles);
    const slider = themedSlider({ defaultValue: 75 });

    expect(slider.state.value.peek()).toBe(75);
  });
});

// ── RadioGroup ─────────────────────────────────────────────

describe('createThemedRadioGroup', () => {
  it('applies theme class to radio group root', async () => {
    const { createThemedRadioGroup } = await import('../components/primitives/radio-group');
    const { createRadioGroupStyles } = await import('../styles/radio-group');
    const styles = createRadioGroupStyles();
    const themedRadioGroup = createThemedRadioGroup(styles);
    const radioGroup = themedRadioGroup();

    expect(radioGroup.root.classList.contains(styles.root)).toBe(true);
  });

  it('Item factory applies theme class', async () => {
    const { createThemedRadioGroup } = await import('../components/primitives/radio-group');
    const { createRadioGroupStyles } = await import('../styles/radio-group');
    const styles = createRadioGroupStyles();
    const themedRadioGroup = createThemedRadioGroup(styles);
    const radioGroup = themedRadioGroup();
    const wrapper = radioGroup.Item('option1', 'Option 1');

    // Item returns a wrapper div; the actual radio element with styles.item is the first child
    const radioEl = wrapper.firstElementChild!;
    expect(radioEl.classList.contains(styles.item)).toBe(true);
  });

  it('preserves primitive behavior — clicking item changes value', async () => {
    const { createThemedRadioGroup } = await import('../components/primitives/radio-group');
    const { createRadioGroupStyles } = await import('../styles/radio-group');
    const styles = createRadioGroupStyles();
    const themedRadioGroup = createThemedRadioGroup(styles);
    const radioGroup = themedRadioGroup();
    const wrapper1 = radioGroup.Item('a', 'A');
    radioGroup.Item('b', 'B');

    // Click the actual radio element inside the wrapper
    const radioEl = wrapper1.firstElementChild!;
    expect(radioGroup.state.value.peek()).toBe('');
    (radioEl as HTMLElement).click();
    expect(radioGroup.state.value.peek()).toBe('a');
  });

  it('passes defaultValue option through', async () => {
    const { createThemedRadioGroup } = await import('../components/primitives/radio-group');
    const { createRadioGroupStyles } = await import('../styles/radio-group');
    const styles = createRadioGroupStyles();
    const themedRadioGroup = createThemedRadioGroup(styles);
    const radioGroup = themedRadioGroup({ defaultValue: 'b' });

    expect(radioGroup.state.value.peek()).toBe('b');
  });
});
