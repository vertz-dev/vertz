import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';

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

    const panels = root.querySelectorAll('[data-panel]');
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

    const panels = root.querySelectorAll('[data-panel]');
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

    const panels = root.querySelectorAll('[data-panel]');
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
});
