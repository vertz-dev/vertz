import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { ResizablePanel } from '../resizable-panel';

describe('ResizablePanel', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('handle has role="separator"', () => {
    const { Panel, Handle } = ResizablePanel.Root();
    Panel();
    const handle = Handle();
    Panel();
    expect(handle.getAttribute('role')).toBe('separator');
  });

  it('handle has tabindex="0"', () => {
    const { Panel, Handle } = ResizablePanel.Root();
    Panel();
    const handle = Handle();
    Panel();
    expect(handle.getAttribute('tabindex')).toBe('0');
  });

  it('handle has aria-valuenow, aria-valuemin, aria-valuemax', () => {
    const { Panel, Handle } = ResizablePanel.Root();
    Panel();
    const handle = Handle();
    Panel();
    expect(handle.getAttribute('aria-valuenow')).toBe('50');
    expect(handle.getAttribute('aria-valuemin')).toBe('0');
    expect(handle.getAttribute('aria-valuemax')).toBe('100');
  });

  it('data-state="idle" by default', () => {
    const { Panel, Handle } = ResizablePanel.Root();
    Panel();
    const handle = Handle();
    Panel();
    expect(handle.getAttribute('data-state')).toBe('idle');
  });

  it('two panels default to 50/50 sizes', () => {
    const { Panel, Handle, state } = ResizablePanel.Root();
    Panel();
    Handle();
    Panel();
    expect(state.sizes.peek()).toEqual([50, 50]);
  });

  it('panel with defaultSize uses specified size', () => {
    const { Panel, Handle, state } = ResizablePanel.Root();
    Panel({ defaultSize: 30 });
    Handle();
    Panel({ defaultSize: 70 });
    expect(state.sizes.peek()).toEqual([30, 70]);
  });

  it('ArrowRight increases left panel (horizontal)', () => {
    const { root, Panel, Handle, state } = ResizablePanel.Root();
    container.appendChild(root);
    Panel();
    const handle = Handle();
    Panel();

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(state.sizes.peek()[0]).toBe(55);
    expect(state.sizes.peek()[1]).toBe(45);
  });

  it('ArrowLeft decreases left panel', () => {
    const { root, Panel, Handle, state } = ResizablePanel.Root();
    container.appendChild(root);
    Panel();
    const handle = Handle();
    Panel();

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(state.sizes.peek()[0]).toBe(45);
    expect(state.sizes.peek()[1]).toBe(55);
  });

  it('Home collapses left panel to minimum', () => {
    const { root, Panel, Handle, state } = ResizablePanel.Root();
    container.appendChild(root);
    Panel({ minSize: 10 });
    const handle = Handle();
    Panel();

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(state.sizes.peek()[0]).toBe(10);
    expect(state.sizes.peek()[1]).toBe(90);
  });

  it('End expands left panel to fill available space', () => {
    const { root, Panel, Handle, state } = ResizablePanel.Root();
    container.appendChild(root);
    Panel();
    const handle = Handle();
    Panel({ minSize: 10 });

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(state.sizes.peek()[0]).toBe(90);
    expect(state.sizes.peek()[1]).toBe(10);
  });

  it('min/max constraints are respected', () => {
    const { root, Panel, Handle, state } = ResizablePanel.Root();
    container.appendChild(root);
    Panel({ minSize: 20, maxSize: 80 });
    const handle = Handle();
    Panel({ minSize: 20, maxSize: 80 });

    // Try to push left panel past maxSize with many ArrowRight presses
    for (let i = 0; i < 20; i++) {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    }
    expect(state.sizes.peek()[0]).toBe(80);
    expect(state.sizes.peek()[1]).toBe(20);
  });

  it('onResize callback is called', () => {
    const onResize = vi.fn();
    const { root, Panel, Handle } = ResizablePanel.Root({ onResize });
    container.appendChild(root);
    Panel();
    const handle = Handle();
    Panel();

    // Reset mock after initial panel setup calls
    onResize.mockClear();

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(onResize).toHaveBeenCalledWith([55, 45]);
  });

  it('data-orientation on root and handle', () => {
    const { root, Panel, Handle } = ResizablePanel.Root({
      orientation: 'vertical',
    });
    Panel();
    const handle = Handle();
    Panel();

    expect(root.getAttribute('data-orientation')).toBe('vertical');
    expect(handle.getAttribute('data-orientation')).toBe('vertical');
  });
});
