import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { createResizablePanelStyles } from '../styles/resizable-panel';

describe('resizable-panel styles', () => {
  const styles = createResizablePanelStyles();

  it('has root, panel, and handle blocks', () => {
    expect(typeof styles.root).toBe('string');
    expect(typeof styles.panel).toBe('string');
    expect(typeof styles.handle).toBe('string');
  });

  it('all class names are non-empty', () => {
    expect(styles.root.length).toBeGreaterThan(0);
    expect(styles.panel.length).toBeGreaterThan(0);
    expect(styles.handle.length).toBeGreaterThan(0);
  });

  it('CSS contains data-state="dragging" selector for handle', () => {
    expect(styles.css).toContain('[data-state="dragging"]');
  });

  it('CSS contains orientation selectors for handle', () => {
    expect(styles.css).toContain('[data-orientation="horizontal"]');
    expect(styles.css).toContain('[data-orientation="vertical"]');
  });
});

describe('createThemedResizablePanel', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('returns a callable function with Panel and Handle sub-components', async () => {
    const { createThemedResizablePanel } = await import('../components/primitives/resizable-panel');
    const styles = createResizablePanelStyles();
    const ResizablePanel = createThemedResizablePanel(styles);

    expect(typeof ResizablePanel).toBe('function');
    expect(typeof ResizablePanel.Panel).toBe('function');
    expect(typeof ResizablePanel.Handle).toBe('function');
  });

  it('applies theme class to root', async () => {
    const { createThemedResizablePanel } = await import('../components/primitives/resizable-panel');
    const { ComposedResizablePanel } = await import('@vertz/ui-primitives');
    const styles = createResizablePanelStyles();
    const ResizablePanel = createThemedResizablePanel(styles);

    const root = ResizablePanel({
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Left'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });

    expect(root.classList.contains(styles.root)).toBe(true);
  });

  it('applies theme classes to panels and handles', async () => {
    const { createThemedResizablePanel } = await import('../components/primitives/resizable-panel');
    const { ComposedResizablePanel } = await import('@vertz/ui-primitives');
    const styles = createResizablePanelStyles();
    const ResizablePanel = createThemedResizablePanel(styles);

    const root = ResizablePanel({
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Left'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);

    const panels = root.querySelectorAll('[data-part="panel"]');
    for (const panel of panels) {
      expect((panel as HTMLElement).classList.contains(styles.panel)).toBe(true);
    }

    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    expect(handle.classList.contains(styles.handle)).toBe(true);
  });

  it('passes orientation through to primitive', async () => {
    const { createThemedResizablePanel } = await import('../components/primitives/resizable-panel');
    const { ComposedResizablePanel } = await import('@vertz/ui-primitives');
    const styles = createResizablePanelStyles();
    const ResizablePanel = createThemedResizablePanel(styles);

    const root = ResizablePanel({
      orientation: 'vertical',
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Top'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Bottom'] });
        return [p1, h, p2];
      },
    });

    expect(root.getAttribute('data-orientation')).toBe('vertical');
  });

  it('passes onResize through to primitive', async () => {
    const { createThemedResizablePanel } = await import('../components/primitives/resizable-panel');
    const { ComposedResizablePanel } = await import('@vertz/ui-primitives');
    const styles = createResizablePanelStyles();
    const onResize = vi.fn();
    const ResizablePanel = createThemedResizablePanel(styles);

    const root = ResizablePanel({
      onResize,
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Left'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);

    onResize.mockClear();
    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(onResize).toHaveBeenCalledWith([55, 45]);
  });
});
