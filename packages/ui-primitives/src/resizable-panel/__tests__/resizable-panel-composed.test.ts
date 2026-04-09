import { afterEach, beforeEach, describe, expect, it, vi } from '@vertz/test';

/** Flush queued microtasks so deferred signal effects propagate to the DOM. */
const flush = () => new Promise<void>((r) => queueMicrotask(r));

describe('ComposedResizablePanel', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('renders root element', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Left'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });
    expect(root).toBeInstanceOf(HTMLDivElement);
  });

  it('distributes root class', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      classes: { root: 'my-root' },
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Left'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });
    expect(root.classList.contains('my-root')).toBe(true);
  });

  it('distributes panel class', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      classes: { panel: 'my-panel' },
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Left'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);

    const panels = root.querySelectorAll('[data-part="panel"]');
    expect(panels.length).toBe(2);
    for (const panel of panels) {
      expect((panel as HTMLElement).classList.contains('my-panel')).toBe(true);
    }
  });

  it('distributes handle class', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      classes: { handle: 'my-handle' },
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Left'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);

    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    expect(handle).not.toBeNull();
    expect(handle.classList.contains('my-handle')).toBe(true);
  });

  it('per-panel className is applied', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      children: () => {
        const p1 = ComposedResizablePanel.Panel({
          children: ['Left'],
          className: 'left-panel',
        });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({
          children: ['Right'],
          className: 'right-panel',
        });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);

    const panels = root.querySelectorAll('[data-part="panel"]');
    expect((panels[0] as HTMLElement).classList.contains('left-panel')).toBe(true);
    expect((panels[1] as HTMLElement).classList.contains('right-panel')).toBe(true);
  });

  it('per-handle className is applied', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Left'] });
        const h = ComposedResizablePanel.Handle({ className: 'custom-handle' });
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);

    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    expect(handle.classList.contains('custom-handle')).toBe(true);
  });

  it('two panels default to 50/50 sizes', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Left'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);
    await flush();

    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    expect(handle.getAttribute('aria-valuenow')).toBe('50');
  });

  it('passes orientation through', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
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

  it('handle receives orientation from context', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      orientation: 'vertical',
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Top'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Bottom'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);

    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    expect(handle.getAttribute('data-orientation')).toBe('vertical');
  });

  it('passes onResize through', async () => {
    const onResize = vi.fn();
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      onResize,
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Left'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);

    await flush();
    onResize.mockClear();
    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(onResize).toHaveBeenCalledWith([55, 45]);
  });

  it('panel defaultSize is respected', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      children: () => {
        const p1 = ComposedResizablePanel.Panel({
          children: ['Left'],
          defaultSize: 30,
        });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({
          children: ['Right'],
          defaultSize: 70,
        });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);
    await flush();

    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    expect(handle.getAttribute('aria-valuenow')).toBe('30');
  });

  it('renders children inside panels', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Hello'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['World'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);

    const panels = root.querySelectorAll('[data-part="panel"]');
    expect((panels[0] as HTMLElement).textContent).toBe('Hello');
    expect((panels[1] as HTMLElement).textContent).toBe('World');
  });

  it('throws when Panel is used outside root', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    expect(() => {
      ComposedResizablePanel.Panel({ children: ['Orphan'] });
    }).toThrow(/must be used inside/);
  });

  it('throws when Handle is used outside root', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    expect(() => {
      ComposedResizablePanel.Handle({});
    }).toThrow(/must be used inside/);
  });

  it('defaultSize={0} is treated as explicit zero, not unset', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      children: () => {
        const p1 = ComposedResizablePanel.Panel({
          children: ['Collapsed'],
          defaultSize: 0,
        });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({
          children: ['Full'],
          defaultSize: 100,
        });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);
    await flush();

    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    expect(handle.getAttribute('aria-valuenow')).toBe('0');
  });

  it('nested ResizablePanel does not interfere with outer', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const outerResize = vi.fn();
    const root = ComposedResizablePanel({
      onResize: outerResize,
      children: () => {
        const p1 = ComposedResizablePanel.Panel({
          children: () => {
            // Nested ResizablePanel inside the first panel
            return ComposedResizablePanel({
              orientation: 'vertical',
              children: () => {
                const ip1 = ComposedResizablePanel.Panel({ children: ['Top'] });
                const ih = ComposedResizablePanel.Handle({});
                const ip2 = ComposedResizablePanel.Panel({ children: ['Bottom'] });
                return [ip1, ih, ip2];
              },
            });
          },
        });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);

    // Outer root's group ID scopes its panels — should find only 2, not 4
    // Get the outer group ID from the first direct panel
    const allPanels = root.querySelectorAll('[data-part="panel"]');
    // There should be 4 total panels (2 outer + 2 inner)
    expect(allPanels.length).toBe(4);

    // The outer panels share a group ID, inner panels share a different one
    const outerGroupId = (allPanels[0] as HTMLElement).dataset.group;
    const innerGroupId = (allPanels[1] as HTMLElement).dataset.group;
    expect(outerGroupId).not.toBe(innerGroupId);

    // Count panels per group
    const outerPanelCount = root.querySelectorAll(
      `[data-part="panel"][data-group="${outerGroupId}"]`,
    ).length;
    expect(outerPanelCount).toBe(2);

    await flush();

    // Outer handle should have 50/50
    const outerHandle = root.querySelector(
      `[role="separator"][data-group="${outerGroupId}"]`,
    ) as HTMLElement;
    expect(outerHandle.getAttribute('aria-valuenow')).toBe('50');

    // Resize the outer handle — should only affect outer panels
    outerResize.mockClear();
    outerHandle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(outerResize).toHaveBeenCalledWith([55, 45]);
  });

  it('keyboard Home collapses left panel to minSize', async () => {
    const onResize = vi.fn();
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      onResize,
      children: () => {
        const p1 = ComposedResizablePanel.Panel({
          children: ['Left'],
          minSize: 10,
        });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);
    await flush();

    onResize.mockClear();
    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(onResize).toHaveBeenCalledWith([10, 90]);
  });

  it('keyboard End expands left panel to fill available space', async () => {
    const onResize = vi.fn();
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      onResize,
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Left'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({
          children: ['Right'],
          minSize: 10,
        });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);
    await flush();

    onResize.mockClear();
    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(onResize).toHaveBeenCalledWith([90, 10]);
  });

  it('handle has data-state="idle" initially', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Left'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);

    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    expect(handle.getAttribute('data-state')).toBe('idle');
  });

  it('vertical orientation: ArrowDown grows top panel', async () => {
    const onResize = vi.fn();
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      orientation: 'vertical',
      onResize,
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Top'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Bottom'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);
    await flush();

    onResize.mockClear();
    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(onResize).toHaveBeenCalledWith([55, 45]);
  });

  it('vertical orientation: ArrowUp shrinks top panel', async () => {
    const onResize = vi.fn();
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      orientation: 'vertical',
      onResize,
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Top'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Bottom'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);
    await flush();

    onResize.mockClear();
    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(onResize).toHaveBeenCalledWith([45, 55]);
  });

  it('pointer drag sets data-state to dragging then idle', async () => {
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Left'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);
    await flush();

    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    // Mock setPointerCapture/releasePointerCapture (not in happy-dom)
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();

    expect(handle.getAttribute('data-state')).toBe('idle');

    // Start drag
    handle.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, bubbles: true }),
    );
    expect(handle.getAttribute('data-state')).toBe('dragging');
    expect(handle.setPointerCapture).toHaveBeenCalledWith(1);

    // End drag
    handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    expect(handle.getAttribute('data-state')).toBe('idle');
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('pointer drag updates sizes proportionally', async () => {
    const onResize = vi.fn();
    const { ComposedResizablePanel } = await import('../resizable-panel-composed');
    const root = ComposedResizablePanel({
      onResize,
      children: () => {
        const p1 = ComposedResizablePanel.Panel({ children: ['Left'] });
        const h = ComposedResizablePanel.Handle({});
        const p2 = ComposedResizablePanel.Panel({ children: ['Right'] });
        return [p1, h, p2];
      },
    });
    container.appendChild(root);
    await flush();

    // Mock offsetWidth so drag delta calculation doesn't divide by zero
    Object.defineProperty(root, 'offsetWidth', { value: 1000, configurable: true });

    const handle = root.querySelector('[role="separator"]') as HTMLElement;
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();

    onResize.mockClear();

    // Start drag at x=500
    handle.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 500, bubbles: true }),
    );

    // Move to x=600 (100px / 1000px = 10%)
    handle.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 600, bubbles: true }),
    );
    expect(onResize).toHaveBeenCalledWith([60, 40]);

    // End drag
    handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
  });

  it('no imperative DOM manipulation in source', async () => {
    const source = await Bun.file(
      new URL('../resizable-panel-composed.tsx', import.meta.url).pathname,
    ).text();
    expect(source).not.toContain('resolveChildren');
    expect(source).not.toContain("from './resizable-panel'");
    expect(source).not.toContain('appendChild');
    expect(source).not.toContain('createTextNode');
    expect(source).not.toContain('querySelectorAll');
  });
});
