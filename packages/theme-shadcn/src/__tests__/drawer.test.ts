import { afterEach, describe, expect, it } from 'bun:test';
import { createThemedDrawer } from '../components/primitives/drawer';
import { createDrawerStyles } from '../styles/drawer';

afterEach(() => {
  for (const el of document.body.querySelectorAll('[data-sheet-overlay], [role="dialog"]')) {
    el.remove();
  }
  for (const el of document.body.querySelectorAll('[data-state]')) {
    if (el.parentElement === document.body) el.remove();
  }
});

describe('drawer styles', () => {
  const drawer = createDrawerStyles();

  it('has overlay and all 4 panel direction blocks', () => {
    expect(typeof drawer.overlay).toBe('string');
    expect(typeof drawer.panelLeft).toBe('string');
    expect(typeof drawer.panelRight).toBe('string');
    expect(typeof drawer.panelTop).toBe('string');
    expect(typeof drawer.panelBottom).toBe('string');
  });

  it('has header, title, description, footer, handle, and close blocks', () => {
    expect(typeof drawer.header).toBe('string');
    expect(typeof drawer.title).toBe('string');
    expect(typeof drawer.description).toBe('string');
    expect(typeof drawer.footer).toBe('string');
    expect(typeof drawer.handle).toBe('string');
    expect(typeof drawer.close).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(drawer.overlay.length).toBeGreaterThan(0);
    expect(drawer.panelLeft.length).toBeGreaterThan(0);
    expect(drawer.panelRight.length).toBeGreaterThan(0);
    expect(drawer.panelTop.length).toBeGreaterThan(0);
    expect(drawer.panelBottom.length).toBeGreaterThan(0);
    expect(drawer.header.length).toBeGreaterThan(0);
    expect(drawer.title.length).toBeGreaterThan(0);
    expect(drawer.description.length).toBeGreaterThan(0);
    expect(drawer.footer.length).toBeGreaterThan(0);
    expect(drawer.handle.length).toBeGreaterThan(0);
    expect(drawer.close.length).toBeGreaterThan(0);
  });
});

describe('themed Drawer', () => {
  const styles = createDrawerStyles();
  const Drawer = createThemedDrawer(styles);

  it('has sub-components', () => {
    expect(typeof Drawer.Trigger).toBe('function');
    expect(typeof Drawer.Content).toBe('function');
    expect(typeof Drawer.Header).toBe('function');
    expect(typeof Drawer.Title).toBe('function');
    expect(typeof Drawer.Description).toBe('function');
    expect(typeof Drawer.Footer).toBe('function');
    expect(typeof Drawer.Handle).toBe('function');
  });

  it('returns a wrapper containing trigger', () => {
    const btn = document.createElement('button');
    btn.textContent = 'Open';

    const root = Drawer({
      children: () => {
        const t = Drawer.Trigger({ children: [btn] });
        const c = Drawer.Content({ children: ['Content'] });
        return [t, c];
      },
    });

    expect(root).toBeInstanceOf(HTMLElement);
    expect(root.contains(btn)).toBe(true);
  });

  it('defaults to bottom side', () => {
    const btn = document.createElement('button');

    const root = Drawer({
      children: () => {
        const t = Drawer.Trigger({ children: [btn] });
        const c = Drawer.Content({ children: ['Content'] });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const panel = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.className).toContain(styles.panelBottom);

    document.body.removeChild(root);
  });

  it('applies left panel class', () => {
    const btn = document.createElement('button');

    const root = Drawer({
      side: 'left',
      children: () => {
        const t = Drawer.Trigger({ children: [btn] });
        const c = Drawer.Content({ children: ['Content'] });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const panel = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.className).toContain(styles.panelLeft);

    document.body.removeChild(root);
  });

  it('applies right panel class', () => {
    const btn = document.createElement('button');

    const root = Drawer({
      side: 'right',
      children: () => {
        const t = Drawer.Trigger({ children: [btn] });
        const c = Drawer.Content({ children: ['Content'] });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const panel = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.className).toContain(styles.panelRight);

    document.body.removeChild(root);
  });

  it('applies top panel class', () => {
    const btn = document.createElement('button');

    const root = Drawer({
      side: 'top',
      children: () => {
        const t = Drawer.Trigger({ children: [btn] });
        const c = Drawer.Content({ children: ['Content'] });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const panel = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.className).toContain(styles.panelTop);

    document.body.removeChild(root);
  });

  it('renders Title and Description with theme classes inside context', () => {
    const btn = document.createElement('button');

    const root = Drawer({
      children: () => {
        const t = Drawer.Trigger({ children: [btn] });
        const c = Drawer.Content({
          children: () => {
            const title = Drawer.Title({ children: ['Drawer Title'] });
            const desc = Drawer.Description({ children: ['Drawer Description'] });
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
    expect(title.textContent).toBe('Drawer Title');
    expect(title.className).toContain(styles.title);

    const desc = dialog.querySelector('p') as HTMLElement;
    expect(desc.textContent).toBe('Drawer Description');
    expect(desc.className).toContain(styles.description);

    document.body.removeChild(root);
  });

  it('renders Handle with theme class', () => {
    const btn = document.createElement('button');

    const root = Drawer({
      children: () => {
        const t = Drawer.Trigger({ children: [btn] });
        const c = Drawer.Content({
          children: () => {
            const handle = Drawer.Handle({});
            return [handle];
          },
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    btn.click();
    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    const handle = dialog.querySelector('[data-slot="drawer-handle"]') as HTMLElement;
    expect(handle).toBeTruthy();
    expect(handle.className).toContain(styles.handle);

    document.body.removeChild(root);
  });

  it('renders Header with theme class', () => {
    const btn = document.createElement('button');

    const root = Drawer({
      children: () => {
        const t = Drawer.Trigger({ children: [btn] });
        const c = Drawer.Content({
          children: () => {
            const header = Drawer.Header({
              children: () => {
                const title = Drawer.Title({ children: ['Title'] });
                return [title];
              },
            });
            return [header];
          },
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    btn.click();
    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    const header = dialog.querySelector('[data-slot="drawer-header"]') as HTMLElement;
    expect(header).toBeTruthy();
    expect(header.className).toContain(styles.header);

    document.body.removeChild(root);
  });

  it('renders Footer with theme class', () => {
    const btn = document.createElement('button');

    const root = Drawer({
      children: () => {
        const t = Drawer.Trigger({ children: [btn] });
        const c = Drawer.Content({
          children: () => {
            const footer = Drawer.Footer({ children: ['Footer content'] });
            return [footer];
          },
        });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    btn.click();
    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    const footer = dialog.querySelector('[data-slot="drawer-footer"]') as HTMLElement;
    expect(footer).toBeTruthy();
    expect(footer.className).toContain(styles.footer);

    document.body.removeChild(root);
  });

  it('content uses the themed panel class', () => {
    const btn = document.createElement('button');

    const root = Drawer({
      children: () => {
        const t = Drawer.Trigger({ children: [btn] });
        const c = Drawer.Content({ children: ['Content'] });
        return [t, c];
      },
    });
    document.body.appendChild(root);

    const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.className).toContain(styles.panelBottom);

    document.body.removeChild(root);
  });
});
