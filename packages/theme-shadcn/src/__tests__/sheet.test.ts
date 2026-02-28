import { describe, expect, it } from 'bun:test';
import { createThemedSheet } from '../components/primitives/sheet';
import { createSheetStyles } from '../styles/sheet';

describe('sheet styles', () => {
  const sheet = createSheetStyles();

  it('has overlay and all 4 panel direction blocks', () => {
    expect(typeof sheet.overlay).toBe('string');
    expect(typeof sheet.panelLeft).toBe('string');
    expect(typeof sheet.panelRight).toBe('string');
    expect(typeof sheet.panelTop).toBe('string');
    expect(typeof sheet.panelBottom).toBe('string');
  });

  it('has title, description, and close blocks', () => {
    expect(typeof sheet.title).toBe('string');
    expect(typeof sheet.description).toBe('string');
    expect(typeof sheet.close).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(sheet.overlay.length).toBeGreaterThan(0);
    expect(sheet.panelLeft.length).toBeGreaterThan(0);
    expect(sheet.panelRight.length).toBeGreaterThan(0);
    expect(sheet.panelTop.length).toBeGreaterThan(0);
    expect(sheet.panelBottom.length).toBeGreaterThan(0);
    expect(sheet.title.length).toBeGreaterThan(0);
    expect(sheet.description.length).toBeGreaterThan(0);
    expect(sheet.close.length).toBeGreaterThan(0);
  });

  it('CSS contains horizontal slide animations', () => {
    expect(sheet.css).toContain('vz-slide-in-from-left');
    expect(sheet.css).toContain('vz-slide-in-from-right');
    expect(sheet.css).toContain('vz-slide-out-to-left');
    expect(sheet.css).toContain('vz-slide-out-to-right');
  });
});

describe('themed Sheet', () => {
  const styles = createSheetStyles();
  const Sheet = createThemedSheet(styles);

  it('has sub-components', () => {
    expect(typeof Sheet.Trigger).toBe('function');
    expect(typeof Sheet.Content).toBe('function');
    expect(typeof Sheet.Title).toBe('function');
    expect(typeof Sheet.Description).toBe('function');
    expect(typeof Sheet.Close).toBe('function');
  });

  it('Title applies theme class', () => {
    const title = Sheet.Title({ children: 'Sheet Title' });
    expect(title).toBeInstanceOf(HTMLHeadingElement);
    expect(title.classList.contains(styles.title)).toBe(true);
    expect(title.textContent).toBe('Sheet Title');
  });

  it('Description applies theme class', () => {
    const desc = Sheet.Description({ children: 'Description' });
    expect(desc).toBeInstanceOf(HTMLParagraphElement);
    expect(desc.classList.contains(styles.description)).toBe(true);
  });

  it('Close applies theme class', () => {
    const close = Sheet.Close({ children: 'X' });
    expect(close).toBeInstanceOf(HTMLButtonElement);
    expect(close.classList.contains(styles.close)).toBe(true);
  });

  it('defaults to right side with overlay', () => {
    const btn = document.createElement('button');
    btn.textContent = 'Open';
    const triggerSlot = Sheet.Trigger({ children: btn });
    const contentSlot = Sheet.Content({
      children: Sheet.Title({ children: 'Right Sheet' }),
    });

    Sheet({ children: [triggerSlot, contentSlot] });

    // The primitive's content gets the panelRight class (default)
    const panel = document.querySelector(`.${styles.panelRight}`);
    expect(panel).toBeTruthy();

    const overlay = document.querySelector(`.${styles.overlay}`);
    expect(overlay).toBeTruthy();
  });

  it('applies left panel class', () => {
    const btn = document.createElement('button');
    btn.textContent = 'Open';
    const triggerSlot = Sheet.Trigger({ children: btn });
    const contentSlot = Sheet.Content({
      children: Sheet.Title({ children: 'Left Sheet' }),
    });

    Sheet({ side: 'left', children: [triggerSlot, contentSlot] });

    const panel = document.querySelector(`.${styles.panelLeft}`);
    expect(panel).toBeTruthy();
  });

  it('applies top panel class', () => {
    const btn = document.createElement('button');
    btn.textContent = 'Open';
    const triggerSlot = Sheet.Trigger({ children: btn });
    const contentSlot = Sheet.Content({
      children: Sheet.Title({ children: 'Top Sheet' }),
    });

    Sheet({ side: 'top', children: [triggerSlot, contentSlot] });

    const panel = document.querySelector(`.${styles.panelTop}`);
    expect(panel).toBeTruthy();
  });

  it('applies bottom panel class', () => {
    const btn = document.createElement('button');
    btn.textContent = 'Open';
    const triggerSlot = Sheet.Trigger({ children: btn });
    const contentSlot = Sheet.Content({
      children: Sheet.Title({ children: 'Bottom Sheet' }),
    });

    Sheet({ side: 'bottom', children: [triggerSlot, contentSlot] });

    const panel = document.querySelector(`.${styles.panelBottom}`);
    expect(panel).toBeTruthy();
  });

  it('returns user trigger when Sheet.Trigger is provided', () => {
    const btn = document.createElement('button');
    btn.textContent = 'Open';
    const triggerSlot = Sheet.Trigger({ children: btn });
    const contentSlot = Sheet.Content({
      children: Sheet.Title({ children: 'Test' }),
    });

    const result = Sheet({ children: [triggerSlot, contentSlot] });
    expect(result).toBe(btn);
  });
});
