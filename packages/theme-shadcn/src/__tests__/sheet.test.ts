import { afterEach, describe, expect, it } from 'bun:test';
import { createThemedSheet } from '../components/primitives/sheet';
import { createSheetStyles } from '../styles/sheet';

afterEach(() => {
  for (const el of document.body.querySelectorAll('[data-sheet-overlay], [role="dialog"]')) {
    el.remove();
  }
  for (const el of document.body.querySelectorAll('[data-state]')) {
    if (el.parentElement === document.body) el.remove();
  }
});

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

  it('returns a wrapper containing trigger', () => {
    const btn = document.createElement('button');
    btn.textContent = 'Open';

    const root = Sheet({
      children: () => {
        const t = Sheet.Trigger({ children: [btn] });
        const c = Sheet.Content({ children: ['Content'] });
        return [t, c];
      },
    });

    expect(root).toBeInstanceOf(HTMLDivElement);
    expect(root.contains(btn)).toBe(true);
  });

  it('renders Title and Description with theme classes inside context', () => {
    const btn = document.createElement('button');

    const root = Sheet({
      children: () => {
        const t = Sheet.Trigger({ children: [btn] });
        const c = Sheet.Content({
          children: () => {
            const title = Sheet.Title({ children: ['Sheet Title'] });
            const desc = Sheet.Description({ children: ['Sheet Description'] });
            return [title, desc];
          },
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    btn.click();
    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    const title = dialog.querySelector('h2') as HTMLElement;
    expect(title.textContent).toBe('Sheet Title');
    expect(title.className).toContain(styles.title);

    const desc = dialog.querySelector('p') as HTMLElement;
    expect(desc.textContent).toBe('Sheet Description');
    expect(desc.className).toContain(styles.description);

    document.body.removeChild(root);
  });

  it('Close button applies theme class and closes the sheet', () => {
    const btn = document.createElement('button');
    let closeEl!: HTMLElement;

    const root = Sheet({
      children: () => {
        const t = Sheet.Trigger({ children: [btn] });
        const c = Sheet.Content({
          children: () => {
            closeEl = Sheet.Close({ children: ['X'] });
            return [closeEl];
          },
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    btn.click();
    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('data-state')).toBe('open');
    expect(closeEl.className).toContain(styles.close);

    closeEl.click();
    expect(dialog.getAttribute('data-state')).toBe('closed');

    document.body.removeChild(root);
  });

  it('defaults to right side with overlay', () => {
    const btn = document.createElement('button');

    const root = Sheet({
      children: () => {
        const t = Sheet.Trigger({ children: [btn] });
        const c = Sheet.Content({
          children: () => [Sheet.Title({ children: ['Right Sheet'] })],
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const panel = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.className).toContain(styles.panelRight);

    const overlay = root.querySelector('[data-sheet-overlay]') as HTMLElement;
    expect(overlay).toBeTruthy();
    expect(overlay.className).toContain(styles.overlay);

    document.body.removeChild(root);
  });

  it('applies left panel class', () => {
    const btn = document.createElement('button');

    const root = Sheet({
      side: 'left',
      children: () => {
        const t = Sheet.Trigger({ children: [btn] });
        const c = Sheet.Content({ children: ['Content'] });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const panel = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.className).toContain(styles.panelLeft);

    document.body.removeChild(root);
  });

  it('applies top panel class', () => {
    const btn = document.createElement('button');

    const root = Sheet({
      side: 'top',
      children: () => {
        const t = Sheet.Trigger({ children: [btn] });
        const c = Sheet.Content({ children: ['Content'] });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const panel = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.className).toContain(styles.panelTop);

    document.body.removeChild(root);
  });

  it('applies bottom panel class', () => {
    const btn = document.createElement('button');

    const root = Sheet({
      side: 'bottom',
      children: () => {
        const t = Sheet.Trigger({ children: [btn] });
        const c = Sheet.Content({ children: ['Content'] });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const panel = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.className).toContain(styles.panelBottom);

    document.body.removeChild(root);
  });
});
