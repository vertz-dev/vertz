import { describe, expect, it, vi } from 'bun:test';
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
  it('applies theme class to root', async () => {
    const { createThemedResizablePanel } = await import('../components/primitives/resizable-panel');
    const styles = createResizablePanelStyles();
    const themedResizablePanel = createThemedResizablePanel(styles);
    const rp = themedResizablePanel();

    expect(rp.root.classList.contains(styles.root)).toBe(true);
  });

  it('Panel factory applies theme class', async () => {
    const { createThemedResizablePanel } = await import('../components/primitives/resizable-panel');
    const styles = createResizablePanelStyles();
    const themedResizablePanel = createThemedResizablePanel(styles);
    const rp = themedResizablePanel();
    const panel = rp.Panel();

    expect(panel.classList.contains(styles.panel)).toBe(true);
  });

  it('Handle factory applies theme class', async () => {
    const { createThemedResizablePanel } = await import('../components/primitives/resizable-panel');
    const styles = createResizablePanelStyles();
    const themedResizablePanel = createThemedResizablePanel(styles);
    const rp = themedResizablePanel();
    rp.Panel();
    const handle = rp.Handle();
    rp.Panel();

    expect(handle.classList.contains(styles.handle)).toBe(true);
  });

  it('preserves primitive behavior — two panels default to 50/50', async () => {
    const { createThemedResizablePanel } = await import('../components/primitives/resizable-panel');
    const styles = createResizablePanelStyles();
    const themedResizablePanel = createThemedResizablePanel(styles);
    const rp = themedResizablePanel();
    rp.Panel();
    rp.Handle();
    rp.Panel();

    expect(rp.state.sizes.peek()).toEqual([50, 50]);
  });

  it('passes options through to primitive', async () => {
    const { createThemedResizablePanel } = await import('../components/primitives/resizable-panel');
    const styles = createResizablePanelStyles();
    const onResize = vi.fn();
    const themedResizablePanel = createThemedResizablePanel(styles);
    const rp = themedResizablePanel({ orientation: 'vertical', onResize });

    expect(rp.root.getAttribute('data-orientation')).toBe('vertical');
  });

  it('returns root, state, Panel, and Handle', async () => {
    const { createThemedResizablePanel } = await import('../components/primitives/resizable-panel');
    const styles = createResizablePanelStyles();
    const themedResizablePanel = createThemedResizablePanel(styles);
    const rp = themedResizablePanel();

    expect(rp.root).toBeInstanceOf(HTMLDivElement);
    expect(rp.state).toBeDefined();
    expect(typeof rp.Panel).toBe('function');
    expect(typeof rp.Handle).toBe('function');
  });
});
