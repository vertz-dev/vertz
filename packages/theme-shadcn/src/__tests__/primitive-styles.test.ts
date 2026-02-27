import { describe, expect, it } from 'bun:test';
import { createAccordionStyles } from '../styles/accordion';
import { createCheckboxStyles } from '../styles/checkbox';
import { createDialogStyles } from '../styles/dialog';
import { createProgressStyles } from '../styles/progress';
import { createSelectStyles } from '../styles/select';
import { createSwitchStyles } from '../styles/switch';
import { createTabsStyles } from '../styles/tabs';
import { createTooltipStyles } from '../styles/tooltip';

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
