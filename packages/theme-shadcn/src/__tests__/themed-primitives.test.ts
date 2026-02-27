import { describe, expect, it } from 'bun:test';
import { createAccordionStyles } from '../styles/accordion';
import { createAlertDialogStyles } from '../styles/alert-dialog';
import { createCheckboxStyles } from '../styles/checkbox';
import { createDialogStyles } from '../styles/dialog';
import { createProgressStyles } from '../styles/progress';
import { createSelectStyles } from '../styles/select';
import { createSwitchStyles } from '../styles/switch';
import { createTabsStyles } from '../styles/tabs';
import { createToastStyles } from '../styles/toast';
import { createTooltipStyles } from '../styles/tooltip';

// ── AlertDialog ────────────────────────────────────────────

describe('createThemedAlertDialog', () => {
  it('applies theme classes to alert dialog elements', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const themedAlertDialog = createThemedAlertDialog(styles);
    const ad = themedAlertDialog();

    expect(ad.overlay.classList.contains(styles.overlay)).toBe(true);
    expect(ad.content.classList.contains(styles.panel)).toBe(true);
    expect(ad.title.classList.contains(styles.title)).toBe(true);
  });

  it('applies theme classes to footer, cancel, and action', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const themedAlertDialog = createThemedAlertDialog(styles);
    const ad = themedAlertDialog();

    expect(ad.footer.classList.contains(styles.footer)).toBe(true);
    expect(ad.cancel.classList.contains(styles.cancel)).toBe(true);
    expect(ad.action.classList.contains(styles.action)).toBe(true);
  });

  it('trigger opens the alert dialog', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const themedAlertDialog = createThemedAlertDialog(styles);
    const ad = themedAlertDialog();

    expect(ad.state.open.peek()).toBe(false);
    ad.trigger.click();
    expect(ad.state.open.peek()).toBe(true);
  });

  it('overlay click does NOT close the alert dialog', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const themedAlertDialog = createThemedAlertDialog(styles);
    const ad = themedAlertDialog({ defaultOpen: true });

    expect(ad.state.open.peek()).toBe(true);
    ad.overlay.click();
    expect(ad.state.open.peek()).toBe(true);
  });

  it('Escape key does NOT close the alert dialog', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const themedAlertDialog = createThemedAlertDialog(styles);
    const ad = themedAlertDialog({ defaultOpen: true });

    expect(ad.state.open.peek()).toBe(true);
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    ad.content.dispatchEvent(event);
    expect(ad.state.open.peek()).toBe(true);
  });

  it('returns all expected elements', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const themedAlertDialog = createThemedAlertDialog(styles);
    const ad = themedAlertDialog();

    expect(ad.trigger).toBeInstanceOf(HTMLButtonElement);
    expect(ad.overlay).toBeInstanceOf(HTMLDivElement);
    expect(ad.content).toBeInstanceOf(HTMLDivElement);
    expect(ad.title).toBeInstanceOf(HTMLHeadingElement);
    expect(ad.description).toBeInstanceOf(HTMLParagraphElement);
    expect(ad.footer).toBeInstanceOf(HTMLDivElement);
    expect(ad.cancel).toBeInstanceOf(HTMLButtonElement);
    expect(ad.action).toBeInstanceOf(HTMLButtonElement);
    expect(ad.state).toBeDefined();
  });

  it('passes defaultOpen option through', async () => {
    const { createThemedAlertDialog } = await import('../components/primitives/alert-dialog');
    const styles = createAlertDialogStyles();
    const themedAlertDialog = createThemedAlertDialog(styles);
    const ad = themedAlertDialog({ defaultOpen: true });

    expect(ad.state.open.peek()).toBe(true);
  });
});

// ── Dialog ─────────────────────────────────────────────────

describe('createThemedDialog', () => {
  it('applies theme classes to dialog elements', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const themedDialog = createThemedDialog(styles);
    const dialog = themedDialog();

    expect(dialog.overlay.classList.contains(styles.overlay)).toBe(true);
    expect(dialog.content.classList.contains(styles.panel)).toBe(true);
    expect(dialog.title.classList.contains(styles.title)).toBe(true);
    expect(dialog.close.classList.contains(styles.close)).toBe(true);
  });

  it('preserves primitive behavior — trigger opens dialog', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const themedDialog = createThemedDialog(styles);
    const dialog = themedDialog();

    expect(dialog.state.open.peek()).toBe(false);
    dialog.trigger.click();
    expect(dialog.state.open.peek()).toBe(true);
  });

  it('passes options through to primitive', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const themedDialog = createThemedDialog(styles);
    const dialog = themedDialog({ defaultOpen: true });

    expect(dialog.state.open.peek()).toBe(true);
  });

  it('returns the same interface as the primitive', async () => {
    const { createThemedDialog } = await import('../components/primitives/dialog');
    const styles = createDialogStyles();
    const themedDialog = createThemedDialog(styles);
    const dialog = themedDialog();

    expect(dialog.trigger).toBeInstanceOf(HTMLButtonElement);
    expect(dialog.content).toBeInstanceOf(HTMLDivElement);
    expect(dialog.overlay).toBeInstanceOf(HTMLDivElement);
    expect(dialog.title).toBeInstanceOf(HTMLHeadingElement);
    expect(dialog.close).toBeInstanceOf(HTMLButtonElement);
    expect(dialog.state).toBeDefined();
  });
});

// ── Tabs ───────────────────────────────────────────────────

describe('createThemedTabs', () => {
  it('applies theme classes to tabs elements', async () => {
    const { createThemedTabs } = await import('../components/primitives/tabs');
    const styles = createTabsStyles();
    const themedTabs = createThemedTabs(styles);
    const tabs = themedTabs({ defaultValue: 'one' });

    expect(tabs.list.classList.contains(styles.list)).toBe(true);
  });

  it('Tab factory applies theme classes to trigger and panel', async () => {
    const { createThemedTabs } = await import('../components/primitives/tabs');
    const styles = createTabsStyles();
    const themedTabs = createThemedTabs(styles);
    const tabs = themedTabs({ defaultValue: 'one' });
    const tab = tabs.Tab('one', 'Tab One');

    expect(tab.trigger.classList.contains(styles.trigger)).toBe(true);
    expect(tab.panel.classList.contains(styles.panel)).toBe(true);
  });

  it('preserves primitive behavior — Tab state', async () => {
    const { createThemedTabs } = await import('../components/primitives/tabs');
    const styles = createTabsStyles();
    const themedTabs = createThemedTabs(styles);
    const tabs = themedTabs({ defaultValue: 'one' });

    expect(tabs.state.value.peek()).toBe('one');
  });

  it('returns root, list, state, and Tab factory', async () => {
    const { createThemedTabs } = await import('../components/primitives/tabs');
    const styles = createTabsStyles();
    const themedTabs = createThemedTabs(styles);
    const tabs = themedTabs();

    expect(tabs.root).toBeInstanceOf(HTMLDivElement);
    expect(tabs.list).toBeInstanceOf(HTMLDivElement);
    expect(tabs.state).toBeDefined();
    expect(typeof tabs.Tab).toBe('function');
  });
});

// ── Select ─────────────────────────────────────────────────

describe('createThemedSelect', () => {
  it('applies theme classes to select elements', async () => {
    const { createThemedSelect } = await import('../components/primitives/select');
    const styles = createSelectStyles();
    const themedSelect = createThemedSelect(styles);
    const select = themedSelect();

    expect(select.trigger.classList.contains(styles.trigger)).toBe(true);
    expect(select.content.classList.contains(styles.content)).toBe(true);
  });

  it('Item factory applies theme classes', async () => {
    const { createThemedSelect } = await import('../components/primitives/select');
    const styles = createSelectStyles();
    const themedSelect = createThemedSelect(styles);
    const select = themedSelect();
    const item = select.Item('opt1', 'Option 1');

    expect(item.classList.contains(styles.item)).toBe(true);
  });

  it('preserves primitive behavior — state', async () => {
    const { createThemedSelect } = await import('../components/primitives/select');
    const styles = createSelectStyles();
    const themedSelect = createThemedSelect(styles);
    const select = themedSelect({ defaultValue: 'opt1' });

    expect(select.state.value.peek()).toBe('opt1');
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
  it('applies theme class to accordion root', async () => {
    const { createThemedAccordion } = await import('../components/primitives/accordion');
    const styles = createAccordionStyles();
    const themedAccordion = createThemedAccordion(styles);
    const accordion = themedAccordion();

    expect(accordion.root).toBeInstanceOf(HTMLDivElement);
  });

  it('Item factory applies theme classes', async () => {
    const { createThemedAccordion } = await import('../components/primitives/accordion');
    const styles = createAccordionStyles();
    const themedAccordion = createThemedAccordion(styles);
    const accordion = themedAccordion();
    const item = accordion.Item('section1');

    expect(item.item.classList.contains(styles.item)).toBe(true);
    expect(item.trigger.classList.contains(styles.trigger)).toBe(true);
    expect(item.content.classList.contains(styles.content)).toBe(true);
  });

  it('preserves primitive behavior — click toggles', async () => {
    const { createThemedAccordion } = await import('../components/primitives/accordion');
    const styles = createAccordionStyles();
    const themedAccordion = createThemedAccordion(styles);
    const accordion = themedAccordion();
    const item = accordion.Item('section1');

    expect(accordion.state.value.peek()).toEqual([]);
    item.trigger.click();
    expect(accordion.state.value.peek()).toEqual(['section1']);
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
  it('applies theme classes to tooltip content', async () => {
    const { createThemedTooltip } = await import('../components/primitives/tooltip');
    const styles = createTooltipStyles();
    const themedTooltip = createThemedTooltip(styles);
    const tooltip = themedTooltip();

    expect(tooltip.content.classList.contains(styles.content)).toBe(true);
  });

  it('returns trigger, content, and state', async () => {
    const { createThemedTooltip } = await import('../components/primitives/tooltip');
    const styles = createTooltipStyles();
    const themedTooltip = createThemedTooltip(styles);
    const tooltip = themedTooltip();

    expect(tooltip.trigger).toBeInstanceOf(HTMLElement);
    expect(tooltip.content).toBeInstanceOf(HTMLDivElement);
    expect(tooltip.state).toBeDefined();
  });
});
