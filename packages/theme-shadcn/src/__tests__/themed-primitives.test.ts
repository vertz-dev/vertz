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
  for (const el of document.body.querySelectorAll('[data-dialog-overlay], [role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]')) {
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

  it('applies theme classes to popover content', async () => {
    const { createThemedPopover } = await import('../components/primitives/popover');
    const styles = createPopoverStyles();
    const Popover = createThemedPopover(styles);

    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    const triggerSlot = Popover.Trigger({ children: trigger });
    const contentSlot = Popover.Content({ children: 'Hello' });

    const result = Popover({ children: [triggerSlot, contentSlot] });

    // The returned trigger has aria-controls pointing to the content
    const contentId = result.getAttribute('aria-controls')!;
    expect(contentId).toBeTruthy();
  });

  it('returns user trigger when Popover.Trigger is provided', async () => {
    const { createThemedPopover } = await import('../components/primitives/popover');
    const styles = createPopoverStyles();
    const Popover = createThemedPopover(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Open';
    const triggerSlot = Popover.Trigger({ children: btn });
    const contentSlot = Popover.Content({ children: 'Content' });

    const result = Popover({ children: [triggerSlot, contentSlot] });
    expect(result).toBe(btn);
  });

  it('trigger click opens popover via delegate', async () => {
    const { createThemedPopover } = await import('../components/primitives/popover');
    const styles = createPopoverStyles();
    const Popover = createThemedPopover(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Open';
    const triggerSlot = Popover.Trigger({ children: btn });
    const contentSlot = Popover.Content({ children: 'Content' });

    Popover({ children: [triggerSlot, contentSlot] });

    expect(btn.getAttribute('data-state')).toBe('closed');
    btn.click();
    expect(btn.getAttribute('data-state')).toBe('open');
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

  it('Title applies theme class', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const title = AlertDialog.Title({ children: 'Confirm' });
    expect(title).toBeInstanceOf(HTMLHeadingElement);
    expect(title.classList.contains(styles.title)).toBe(true);
    expect(title.textContent).toBe('Confirm');
  });

  it('Description applies theme class', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const desc = AlertDialog.Description({ children: 'Are you sure?' });
    expect(desc).toBeInstanceOf(HTMLParagraphElement);
    expect(desc.classList.contains(styles.description)).toBe(true);
  });

  it('Footer applies theme class', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const footer = AlertDialog.Footer({ children: 'Footer' });
    expect(footer).toBeInstanceOf(HTMLDivElement);
    expect(footer.classList.contains(styles.footer)).toBe(true);
  });

  it('Cancel applies theme class', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const cancel = AlertDialog.Cancel({ children: 'Cancel' });
    expect(cancel).toBeInstanceOf(HTMLButtonElement);
    expect(cancel.classList.contains(styles.cancel)).toBe(true);
  });

  it('Action applies theme class', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const action = AlertDialog.Action({ children: 'Continue' });
    expect(action).toBeInstanceOf(HTMLButtonElement);
    expect(action.classList.contains(styles.action)).toBe(true);
  });

  it('sets role="alertdialog" on content element', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const trigger = document.createElement('button');
    trigger.textContent = 'Delete';
    const triggerSlot = AlertDialog.Trigger({ children: trigger });
    const contentSlot = AlertDialog.Content({
      children: AlertDialog.Title({ children: 'Confirm' }),
    });

    AlertDialog({ children: [triggerSlot, contentSlot] });

    const content = document.querySelector('[role="alertdialog"]');
    expect(content).toBeTruthy();
  });

  it('applies overlay and panel theme classes', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const trigger = document.createElement('button');
    trigger.textContent = 'Delete';
    const triggerSlot = AlertDialog.Trigger({ children: trigger });
    const contentSlot = AlertDialog.Content({
      children: AlertDialog.Title({ children: 'Confirm' }),
    });

    AlertDialog({ children: [triggerSlot, contentSlot] });

    const overlay = document.querySelector(`.${styles.overlay}`);
    const panel = document.querySelector('[role="alertdialog"]');
    expect(overlay).toBeTruthy();
    expect(panel!.classList.contains(styles.panel)).toBe(true);
  });

  it('links content to description via aria-describedby', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const trigger = document.createElement('button');
    trigger.textContent = 'Delete';
    const triggerSlot = AlertDialog.Trigger({ children: trigger });
    const contentSlot = AlertDialog.Content({
      children: [
        AlertDialog.Title({ children: 'Confirm' }),
        AlertDialog.Description({ children: 'This is permanent.' }),
      ],
    });

    AlertDialog({ children: [triggerSlot, contentSlot] });

    const content = document.querySelector('[role="alertdialog"]');
    const describedBy = content!.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const descEl = document.getElementById(describedBy!);
    expect(descEl).toBeTruthy();
    expect(descEl!.classList.contains(styles.description)).toBe(true);
  });

  it('trigger click opens the alert dialog', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Delete';
    const triggerSlot = AlertDialog.Trigger({ children: btn });
    const contentSlot = AlertDialog.Content({
      children: AlertDialog.Title({ children: 'Confirm' }),
    });

    AlertDialog({ children: [triggerSlot, contentSlot] });

    expect(btn.getAttribute('data-state')).toBe('closed');
    btn.click();
    expect(btn.getAttribute('data-state')).toBe('open');
  });

  it('cancel button closes the dialog', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Delete';
    const triggerSlot = AlertDialog.Trigger({ children: btn });
    const cancel = AlertDialog.Cancel({ children: 'Cancel' });
    const contentSlot = AlertDialog.Content({
      children: [
        AlertDialog.Title({ children: 'Confirm' }),
        AlertDialog.Footer({ children: cancel }),
      ],
    });

    AlertDialog({ defaultOpen: true, children: [triggerSlot, contentSlot] });

    expect(btn.getAttribute('data-state')).toBe('open');
    cancel.click();
    expect(btn.getAttribute('data-state')).toBe('closed');
  });

  it('action button closes the dialog', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Delete';
    const triggerSlot = AlertDialog.Trigger({ children: btn });
    const action = AlertDialog.Action({ children: 'Continue' });
    const contentSlot = AlertDialog.Content({
      children: [
        AlertDialog.Title({ children: 'Confirm' }),
        AlertDialog.Footer({ children: action }),
      ],
    });

    AlertDialog({ defaultOpen: true, children: [triggerSlot, contentSlot] });

    expect(btn.getAttribute('data-state')).toBe('open');
    action.click();
    expect(btn.getAttribute('data-state')).toBe('closed');
  });

  it('Escape key does NOT close the alert dialog', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Delete';
    const triggerSlot = AlertDialog.Trigger({ children: btn });
    const contentSlot = AlertDialog.Content({
      children: AlertDialog.Title({ children: 'Confirm' }),
    });

    AlertDialog({ defaultOpen: true, children: [triggerSlot, contentSlot] });

    expect(btn.getAttribute('data-state')).toBe('open');
    const content = document.querySelector('[role="alertdialog"]')!;
    content.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(btn.getAttribute('data-state')).toBe('open');
  });

  it('overlay click does NOT close the alert dialog', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const AlertDialog = createThemedAlertDialog(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Delete';
    const triggerSlot = AlertDialog.Trigger({ children: btn });
    const contentSlot = AlertDialog.Content({
      children: AlertDialog.Title({ children: 'Confirm' }),
    });

    AlertDialog({ defaultOpen: true, children: [triggerSlot, contentSlot] });

    expect(btn.getAttribute('data-state')).toBe('open');
    const overlay = document.querySelector(`.${styles.overlay}`)!;
    (overlay as HTMLElement).click();
    expect(btn.getAttribute('data-state')).toBe('open');
  });
});

// ── Dialog ─────────────────────────────────────────────────

describe('createThemedDialog', () => {
  it('has Trigger, Content, Title, Description, Footer sub-components', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const Dialog = createThemedDialog(styles);

    expect(typeof Dialog.Trigger).toBe('function');
    expect(typeof Dialog.Content).toBe('function');
    expect(typeof Dialog.Title).toBe('function');
    expect(typeof Dialog.Description).toBe('function');
    expect(typeof Dialog.Footer).toBe('function');
  });

  it('portals overlay and content to document.body when rendered with slots', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const Dialog = createThemedDialog(styles);

    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    const triggerSlot = Dialog.Trigger({ children: trigger });

    const title = Dialog.Title({ children: 'Test Title' });
    const contentSlot = Dialog.Content({ children: title });

    Dialog({ children: [triggerSlot, contentSlot] });

    const overlay = document.querySelector('[data-dialog-overlay]');
    const content = document.querySelector('[role="dialog"]');
    expect(overlay).toBeTruthy();
    expect(content).toBeTruthy();
  });

  it('applies theme classes to overlay, panel, and close button', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const Dialog = createThemedDialog(styles);

    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    const triggerSlot = Dialog.Trigger({ children: trigger });
    const contentSlot = Dialog.Content({ children: 'Hello' });

    Dialog({ children: [triggerSlot, contentSlot] });

    // Find by aria-controls to get the specific dialog for this test
    const contentId = trigger.getAttribute('aria-controls')!;
    const content = document.getElementById(contentId)!;
    expect(content.classList.contains(styles.panel)).toBe(true);

    const closeBtn = content.querySelector(`.${styles.close}`);
    expect(closeBtn).toBeTruthy();
  });

  it('Title applies theme class', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const Dialog = createThemedDialog(styles);

    const title = Dialog.Title({ children: 'My Title' });
    expect(title).toBeInstanceOf(HTMLHeadingElement);
    expect(title.classList.contains(styles.title)).toBe(true);
    expect(title.textContent).toBe('My Title');
  });

  it('Description applies theme class', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const Dialog = createThemedDialog(styles);

    const desc = Dialog.Description({ children: 'Some description' });
    expect(desc).toBeInstanceOf(HTMLParagraphElement);
    expect(desc.classList.contains(styles.description)).toBe(true);
  });

  it('Footer applies theme class', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const Dialog = createThemedDialog(styles);

    const footer = Dialog.Footer({ children: 'Footer content' });
    expect(footer).toBeInstanceOf(HTMLDivElement);
    expect(footer.classList.contains(styles.footer)).toBe(true);
  });

  it('trigger click opens the dialog', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const Dialog = createThemedDialog(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Open';
    const triggerSlot = Dialog.Trigger({ children: btn });
    const contentSlot = Dialog.Content({ children: 'Content' });

    Dialog({ children: [triggerSlot, contentSlot] });

    const contentId = btn.getAttribute('aria-controls')!;
    const content = document.getElementById(contentId) as HTMLElement;
    expect(content).toBeTruthy();
    expect(content.getAttribute('data-state')).toBe('closed');

    btn.click();
    expect(content.getAttribute('data-state')).toBe('open');
  });

  it('returns user trigger when Dialog.Trigger is provided', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const Dialog = createThemedDialog(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Open';
    const triggerSlot = Dialog.Trigger({ children: btn });
    const contentSlot = Dialog.Content({ children: 'Content' });

    const result = Dialog({ children: [triggerSlot, contentSlot] });
    expect(result).toBe(btn);
  });

  it('returns primitive trigger when no Dialog.Trigger is provided', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const Dialog = createThemedDialog(styles);

    const contentSlot = Dialog.Content({ children: 'Content' });
    const result = Dialog({ children: [contentSlot] });

    expect(result).toBeInstanceOf(HTMLButtonElement);
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

    const list = Tabs.List({
      children: [
        Tabs.Trigger({ value: 'one', children: 'Tab 1' }),
        Tabs.Trigger({ value: 'two', children: 'Tab 2' }),
      ],
    });
    const content1 = Tabs.Content({ value: 'one', children: 'Content 1' });
    const content2 = Tabs.Content({ value: 'two', children: 'Content 2' });

    const root = Tabs({ defaultValue: 'one', children: [list, content1, content2] });
    expect(root).toBeInstanceOf(HTMLDivElement);
  });

  it('applies theme classes to tabs elements', async () => {
    const { createThemedTabs } = await import('../components/primitives/tabs');
    const styles = createTabsStyles();
    const Tabs = createThemedTabs(styles);

    const list = Tabs.List({
      children: Tabs.Trigger({ value: 'one', children: 'Tab 1' }),
    });
    const content = Tabs.Content({ value: 'one', children: 'Content 1' });

    const root = Tabs({ defaultValue: 'one', children: [list, content] });

    const listEl = root.querySelector('[role="tablist"]')!;
    expect(listEl.classList.contains(styles.list)).toBe(true);

    const triggerEl = root.querySelector('[role="tab"]')!;
    expect(triggerEl.classList.contains(styles.trigger)).toBe(true);

    const panelEl = root.querySelector('[role="tabpanel"]')!;
    expect(panelEl.classList.contains(styles.panel)).toBe(true);
  });

  it('applies line variant classes when variant is line', async () => {
    const { createThemedTabs } = await import('../components/primitives/tabs');
    const styles = createTabsStyles();
    const Tabs = createThemedTabs(styles);

    const list = Tabs.List({
      children: Tabs.Trigger({ value: 'one', children: 'Tab 1' }),
    });
    const content = Tabs.Content({ value: 'one', children: 'Content 1' });

    const root = Tabs({ defaultValue: 'one', variant: 'line', children: [list, content] });

    const listEl = root.querySelector('[role="tablist"]')!;
    expect(listEl.classList.contains(styles.listLine)).toBe(true);
    expect(listEl.classList.contains(styles.list)).toBe(false);

    const triggerEl = root.querySelector('[role="tab"]')!;
    expect(triggerEl.classList.contains(styles.triggerLine)).toBe(true);
    expect(triggerEl.classList.contains(styles.trigger)).toBe(false);
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

  it('returns trigger element with theme class', async () => {
    const { createThemedSelect } = await import('../components/primitives/select');
    const styles = createSelectStyles();
    const Select = createThemedSelect(styles);

    const contentSlot = Select.Content({
      children: Select.Item({ value: 'a', children: 'A' }),
    });

    const result = Select({ children: contentSlot });

    // Root returns the primitive trigger with theme class applied
    expect(result).toBeInstanceOf(HTMLElement);
    expect(result.classList.contains(styles.trigger)).toBe(true);
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

    const sep = DropdownMenu.Separator();
    expect(sep.dataset.slot).toBe('menu-separator');
  });

  it('returns user trigger with ARIA attributes', async () => {
    const { createThemedDropdownMenu } = await import('../components/primitives/dropdown-menu');
    const styles = createDropdownMenuStyles();
    const DropdownMenu = createThemedDropdownMenu(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Menu';
    const triggerSlot = DropdownMenu.Trigger({ children: btn });
    const contentSlot = DropdownMenu.Content({
      children: DropdownMenu.Item({ value: 'a', children: 'A' }),
    });

    const result = DropdownMenu({ children: [triggerSlot, contentSlot] });

    expect(result).toBe(btn);
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
    const checkbox = themedCheckbox();

    expect(checkbox.root.classList.contains(styles.root)).toBe(true);
  });

  it('preserves primitive behavior — click toggles', async () => {
    const { createThemedCheckbox } = await import('../components/primitives/checkbox');
    const styles = createCheckboxStyles();
    const themedCheckbox = createThemedCheckbox(styles);
    const checkbox = themedCheckbox();

    expect(checkbox.state.checked.peek()).toBe(false);
    checkbox.root.click();
    expect(checkbox.state.checked.peek()).toBe(true);
  });

  it('passes options through', async () => {
    const { createThemedCheckbox } = await import('../components/primitives/checkbox');
    const styles = createCheckboxStyles();
    const themedCheckbox = createThemedCheckbox(styles);
    const checkbox = themedCheckbox({ defaultChecked: true });

    expect(checkbox.state.checked.peek()).toBe(true);
  });
});

// ── Switch ─────────────────────────────────────────────────

describe('createThemedSwitch', () => {
  it('applies theme classes to switch root', async () => {
    const { createThemedSwitch } = await import('../components/primitives/switch');
    const styles = createSwitchStyles();
    const themedSwitch = createThemedSwitch(styles);
    const sw = themedSwitch();

    expect(sw.root.classList.contains(styles.root)).toBe(true);
  });

  it('preserves primitive behavior — click toggles', async () => {
    const { createThemedSwitch } = await import('../components/primitives/switch');
    const styles = createSwitchStyles();
    const themedSwitch = createThemedSwitch(styles);
    const sw = themedSwitch();

    expect(sw.state.checked.peek()).toBe(false);
    sw.root.click();
    expect(sw.state.checked.peek()).toBe(true);
  });

  it('applies rootSm class when size is sm', async () => {
    const { createThemedSwitch } = await import('../components/primitives/switch');
    const styles = createSwitchStyles();
    const themedSwitch = createThemedSwitch(styles);
    const sw = themedSwitch({ size: 'sm' });

    expect(sw.root.classList.contains(styles.rootSm)).toBe(true);
    expect(sw.root.classList.contains(styles.root)).toBe(false);
  });

  it('creates thumb span with theme class', async () => {
    const { createThemedSwitch } = await import('../components/primitives/switch');
    const styles = createSwitchStyles();
    const themedSwitch = createThemedSwitch(styles);
    const sw = themedSwitch();

    const thumb = sw.root.querySelector('span');
    expect(thumb).not.toBeNull();
    expect(thumb!.classList.contains(styles.thumb)).toBe(true);
  });

  it('thumb uses thumbSm class when size is sm', async () => {
    const { createThemedSwitch } = await import('../components/primitives/switch');
    const styles = createSwitchStyles();
    const themedSwitch = createThemedSwitch(styles);
    const sw = themedSwitch({ size: 'sm' });

    const thumb = sw.root.querySelector('span');
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

    const trigger = Accordion.Trigger({ children: 'Section 1' });
    const content = Accordion.Content({ children: 'Content 1' });
    const item = Accordion.Item({ value: 'section1', children: [trigger, content] });
    const root = Accordion({ children: item });

    expect(root).toBeInstanceOf(HTMLDivElement);
  });

  it('applies theme classes to items', async () => {
    const { createThemedAccordion } = await import('../components/primitives/accordion');
    const styles = createAccordionStyles();
    const Accordion = createThemedAccordion(styles);

    const trigger = Accordion.Trigger({ children: 'Section 1' });
    const content = Accordion.Content({ children: 'Body text' });
    const item = Accordion.Item({ value: 'section1', children: [trigger, content] });
    const root = Accordion({ children: item });

    const itemEl = root.querySelector(`[data-value="section1"]`)!;
    expect(itemEl).toBeTruthy();
    const triggerEl = itemEl.querySelector('button')!;
    expect(triggerEl.classList.contains(styles.trigger)).toBe(true);
    expect(itemEl.classList.contains(styles.item)).toBe(true);
    const contentEl = itemEl.querySelector('[role="region"]')!;
    expect(contentEl.classList.contains(styles.content)).toBe(true);
  });

  it('preserves primitive behavior — click toggles', async () => {
    const { createThemedAccordion } = await import('../components/primitives/accordion');
    const styles = createAccordionStyles();
    const Accordion = createThemedAccordion(styles);

    const trigger = Accordion.Trigger({ children: 'Section 1' });
    const content = Accordion.Content({ children: 'Body text' });
    const item = Accordion.Item({ value: 'section1', children: [trigger, content] });
    const root = Accordion({ children: item });

    const triggerEl = root.querySelector('button')!;
    expect(triggerEl.getAttribute('aria-expanded')).toBe('false');
    triggerEl.click();
    expect(triggerEl.getAttribute('aria-expanded')).toBe('true');
  });

  it('moves trigger text into primitive trigger button', async () => {
    const { createThemedAccordion } = await import('../components/primitives/accordion');
    const styles = createAccordionStyles();
    const Accordion = createThemedAccordion(styles);

    const trigger = Accordion.Trigger({ children: 'My Trigger' });
    const content = Accordion.Content({ children: 'My Content' });
    const item = Accordion.Item({ value: 's1', children: [trigger, content] });
    const root = Accordion({ children: item });

    const triggerEl = root.querySelector('button')!;
    expect(triggerEl.textContent).toBe('My Trigger');
  });

  it('wraps content in inner padding div', async () => {
    const { createThemedAccordion } = await import('../components/primitives/accordion');
    const styles = createAccordionStyles();
    const Accordion = createThemedAccordion(styles);

    const trigger = Accordion.Trigger({ children: 'Trigger' });
    const content = Accordion.Content({ children: 'Content text' });
    const item = Accordion.Item({ value: 's1', children: [trigger, content] });
    const root = Accordion({ children: item });

    const contentEl = root.querySelector('[role="region"]')!;
    const inner = contentEl.firstElementChild as HTMLElement;
    expect(inner).toBeTruthy();
    expect(inner.style.cssText).toContain('padding');
    expect(inner.textContent).toBe('Content text');
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

  it('moves trigger children into primitive trigger element', async () => {
    const { createThemedTooltip } = await import('../components/primitives/tooltip');
    const styles = createTooltipStyles();
    const Tooltip = createThemedTooltip(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Hover me';
    const triggerSlot = Tooltip.Trigger({ children: btn });
    const contentSlot = Tooltip.Content({ children: 'Tooltip text' });

    const result = Tooltip({ children: [triggerSlot, contentSlot] });

    // The primitive trigger element contains the user's button
    expect(result.contains(btn)).toBe(true);
  });

  it('returns primitive trigger element', async () => {
    const { createThemedTooltip } = await import('../components/primitives/tooltip');
    const styles = createTooltipStyles();
    const Tooltip = createThemedTooltip(styles);

    const btn = document.createElement('button');
    btn.textContent = 'Hover me';
    const triggerSlot = Tooltip.Trigger({ children: btn });
    const contentSlot = Tooltip.Content({ children: 'Info' });

    const result = Tooltip({ children: [triggerSlot, contentSlot] });
    // Returns the primitive trigger (span with events wired) containing the user's button
    expect(result).toBeInstanceOf(HTMLElement);
    expect(result.contains(btn)).toBe(true);
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
    const item = radioGroup.Item('option1', 'Option 1');

    expect(item.classList.contains(styles.item)).toBe(true);
  });

  it('preserves primitive behavior — clicking item changes value', async () => {
    const { createThemedRadioGroup } = await import('../components/primitives/radio-group');
    const { createRadioGroupStyles } = await import('../styles/radio-group');
    const styles = createRadioGroupStyles();
    const themedRadioGroup = createThemedRadioGroup(styles);
    const radioGroup = themedRadioGroup();
    const item1 = radioGroup.Item('a', 'A');
    radioGroup.Item('b', 'B');

    expect(radioGroup.state.value.peek()).toBe('');
    item1.click();
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
