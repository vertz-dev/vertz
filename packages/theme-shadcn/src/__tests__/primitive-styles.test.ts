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

describe('alert-dialog', () => {
  const alertDialog = createAlertDialogStyles();

  it('has overlay, panel, title, description, footer, cancel, and action blocks', () => {
    expect(typeof alertDialog.overlay).toBe('string');
    expect(typeof alertDialog.panel).toBe('string');
    expect(typeof alertDialog.title).toBe('string');
    expect(typeof alertDialog.description).toBe('string');
    expect(typeof alertDialog.footer).toBe('string');
    expect(typeof alertDialog.cancel).toBe('string');
    expect(typeof alertDialog.action).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(alertDialog.overlay.length).toBeGreaterThan(0);
    expect(alertDialog.panel.length).toBeGreaterThan(0);
    expect(alertDialog.title.length).toBeGreaterThan(0);
    expect(alertDialog.description.length).toBeGreaterThan(0);
    expect(alertDialog.footer.length).toBeGreaterThan(0);
    expect(alertDialog.cancel.length).toBeGreaterThan(0);
    expect(alertDialog.action.length).toBeGreaterThan(0);
  });
});

describe('dialog', () => {
  const dialog = createDialogStyles();

  it('has overlay, panel, title, description, close, and footer blocks', () => {
    expect(typeof dialog.overlay).toBe('string');
    expect(typeof dialog.panel).toBe('string');
    expect(typeof dialog.title).toBe('string');
    expect(typeof dialog.description).toBe('string');
    expect(typeof dialog.close).toBe('string');
    expect(typeof dialog.footer).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(dialog.overlay.length).toBeGreaterThan(0);
    expect(dialog.panel.length).toBeGreaterThan(0);
    expect(dialog.title.length).toBeGreaterThan(0);
    expect(dialog.description.length).toBeGreaterThan(0);
    expect(dialog.close.length).toBeGreaterThan(0);
    expect(dialog.footer.length).toBeGreaterThan(0);
  });

  it('CSS contains enter/exit animations for overlay', () => {
    expect(dialog.css).toContain('vz-fade-in');
    expect(dialog.css).toContain('vz-fade-out');
  });

  it('CSS contains enter/exit animations for panel', () => {
    expect(dialog.css).toContain('vz-zoom-in');
    expect(dialog.css).toContain('vz-zoom-out');
  });

  it('CSS does not use display:none for animated states', () => {
    // Animated components rely on setHiddenAnimated, not CSS display:none
    expect(dialog.css).not.toContain('display: none');
  });
});

describe('select', () => {
  const select = createSelectStyles();

  it('has trigger, content, and item blocks', () => {
    expect(typeof select.trigger).toBe('string');
    expect(typeof select.content).toBe('string');
    expect(typeof select.item).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(select.trigger.length).toBeGreaterThan(0);
    expect(select.content.length).toBeGreaterThan(0);
    expect(select.item.length).toBeGreaterThan(0);
  });

  it('CSS contains enter/exit animations for content', () => {
    expect(select.css).toContain('vz-zoom-in');
    expect(select.css).toContain('vz-zoom-out');
  });

  it('CSS does not use display:none for animated states', () => {
    expect(select.css).not.toContain('display: none');
  });

  it('has group, label, separator, and scrollButton blocks', () => {
    expect(typeof select.group).toBe('string');
    expect(typeof select.label).toBe('string');
    expect(typeof select.separator).toBe('string');
    expect(typeof select.scrollButton).toBe('string');
    expect(select.group.length).toBeGreaterThan(0);
    expect(select.label.length).toBeGreaterThan(0);
    expect(select.separator.length).toBeGreaterThan(0);
    expect(select.scrollButton.length).toBeGreaterThan(0);
  });
});

describe('tabs', () => {
  const tabs = createTabsStyles();

  it('has list, trigger, and panel blocks', () => {
    expect(typeof tabs.list).toBe('string');
    expect(typeof tabs.trigger).toBe('string');
    expect(typeof tabs.panel).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(tabs.list.length).toBeGreaterThan(0);
    expect(tabs.trigger.length).toBeGreaterThan(0);
    expect(tabs.panel.length).toBeGreaterThan(0);
  });

  it('CSS contains data-state="active" and data-state="inactive" selectors', () => {
    expect(tabs.css).toContain('[data-state="active"]');
    expect(tabs.css).toContain('[data-state="inactive"]');
  });

  it('CSS contains dark mode selector for active trigger', () => {
    expect(tabs.css).toContain('[data-theme="dark"]');
  });

  it('has listLine and triggerLine blocks for line variant', () => {
    expect(typeof tabs.listLine).toBe('string');
    expect(typeof tabs.triggerLine).toBe('string');
    expect(tabs.listLine.length).toBeGreaterThan(0);
    expect(tabs.triggerLine.length).toBeGreaterThan(0);
  });
});

describe('checkbox', () => {
  const checkbox = createCheckboxStyles();

  it('has root and indicator blocks', () => {
    expect(typeof checkbox.root).toBe('string');
    expect(typeof checkbox.indicator).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(checkbox.root.length).toBeGreaterThan(0);
    expect(checkbox.indicator.length).toBeGreaterThan(0);
  });

  it('CSS contains data-state="unchecked" selector with display: none', () => {
    expect(checkbox.css).toContain('[data-state="unchecked"]');
    expect(checkbox.css).toContain('display: none');
  });

  it('CSS contains data-state="checked" and data-state="indeterminate" selectors', () => {
    expect(checkbox.css).toContain('[data-state="checked"]');
    expect(checkbox.css).toContain('[data-state="indeterminate"]');
  });
});

describe('switch', () => {
  const switchStyles = createSwitchStyles();

  it('has root and thumb blocks', () => {
    expect(typeof switchStyles.root).toBe('string');
    expect(typeof switchStyles.thumb).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(switchStyles.root.length).toBeGreaterThan(0);
    expect(switchStyles.thumb.length).toBeGreaterThan(0);
  });

  it('CSS contains data-state="checked" and data-state="unchecked" selectors', () => {
    expect(switchStyles.css).toContain('[data-state="checked"]');
    expect(switchStyles.css).toContain('[data-state="unchecked"]');
  });

  it('has rootSm and thumbSm blocks for sm size variant', () => {
    expect(typeof switchStyles.rootSm).toBe('string');
    expect(typeof switchStyles.thumbSm).toBe('string');
    expect(switchStyles.rootSm.length).toBeGreaterThan(0);
    expect(switchStyles.thumbSm.length).toBeGreaterThan(0);
  });
});

describe('progress', () => {
  const progress = createProgressStyles();

  it('has root and indicator blocks', () => {
    expect(typeof progress.root).toBe('string');
    expect(typeof progress.indicator).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(progress.root.length).toBeGreaterThan(0);
    expect(progress.indicator.length).toBeGreaterThan(0);
  });
});

describe('accordion', () => {
  const accordion = createAccordionStyles();

  it('has item, trigger, and content blocks', () => {
    expect(typeof accordion.item).toBe('string');
    expect(typeof accordion.trigger).toBe('string');
    expect(typeof accordion.content).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(accordion.item.length).toBeGreaterThan(0);
    expect(accordion.trigger.length).toBeGreaterThan(0);
    expect(accordion.content.length).toBeGreaterThan(0);
  });

  it('CSS contains enter/exit animations for content', () => {
    expect(accordion.css).toContain('vz-accordion-down');
    expect(accordion.css).toContain('vz-accordion-up');
  });

  it('CSS does not use display:none for animated states', () => {
    expect(accordion.css).not.toContain('display: none');
  });
});

describe('toast', () => {
  const toast = createToastStyles();

  it('has viewport, root, title, description, action, and close blocks', () => {
    expect(typeof toast.viewport).toBe('string');
    expect(typeof toast.root).toBe('string');
    expect(typeof toast.title).toBe('string');
    expect(typeof toast.description).toBe('string');
    expect(typeof toast.action).toBe('string');
    expect(typeof toast.close).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(toast.viewport.length).toBeGreaterThan(0);
    expect(toast.root.length).toBeGreaterThan(0);
    expect(toast.title.length).toBeGreaterThan(0);
    expect(toast.description.length).toBeGreaterThan(0);
    expect(toast.action.length).toBeGreaterThan(0);
    expect(toast.close.length).toBeGreaterThan(0);
  });
});

describe('dropdown-menu', () => {
  it('has content, item, group, label, and separator blocks', () => {
    const { createDropdownMenuStyles } = require('../styles/dropdown-menu');
    const dm = createDropdownMenuStyles();
    expect(typeof dm.content).toBe('string');
    expect(typeof dm.item).toBe('string');
    expect(typeof dm.group).toBe('string');
    expect(typeof dm.label).toBe('string');
    expect(typeof dm.separator).toBe('string');
  });

  it('all class names are non-empty', () => {
    const { createDropdownMenuStyles } = require('../styles/dropdown-menu');
    const dm = createDropdownMenuStyles();
    expect(dm.content.length).toBeGreaterThan(0);
    expect(dm.item.length).toBeGreaterThan(0);
    expect(dm.group.length).toBeGreaterThan(0);
    expect(dm.label.length).toBeGreaterThan(0);
    expect(dm.separator.length).toBeGreaterThan(0);
  });

  it('CSS contains enter/exit animations for content', () => {
    const { createDropdownMenuStyles } = require('../styles/dropdown-menu');
    const dm = createDropdownMenuStyles();
    expect(dm.css).toContain('vz-zoom-in');
    expect(dm.css).toContain('vz-zoom-out');
  });
});

describe('tooltip', () => {
  const tooltip = createTooltipStyles();

  it('has content block', () => {
    expect(typeof tooltip.content).toBe('string');
  });

  it('class name is non-empty', () => {
    expect(tooltip.content.length).toBeGreaterThan(0);
  });

  it('CSS contains enter/exit animations for content', () => {
    expect(tooltip.css).toContain('vz-fade-in');
    expect(tooltip.css).toContain('vz-fade-out');
  });

  it('CSS does not use display:none for animated states', () => {
    expect(tooltip.css).not.toContain('display: none');
  });
});
