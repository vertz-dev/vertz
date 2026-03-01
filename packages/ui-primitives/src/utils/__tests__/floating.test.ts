import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ComputePositionReturn } from '@floating-ui/dom';

// Mock @floating-ui/dom — happy-dom doesn't implement real layout
const mockComputePosition = mock<() => Promise<ComputePositionReturn>>(() =>
  Promise.resolve({
    x: 100,
    y: 200,
    placement: 'bottom-start',
    strategy: 'fixed',
    middlewareData: {},
  } as ComputePositionReturn),
);

const mockAutoUpdate = mock<() => () => void>(() => {
  // Call the update function once to simulate initial position
  const updateFn = mockAutoUpdate.mock.calls.at(-1)?.[2] as (() => void) | undefined;
  if (updateFn) updateFn();
  return () => {};
});

mock.module('@floating-ui/dom', () => ({
  computePosition: mockComputePosition,
  autoUpdate: mockAutoUpdate,
  offset: (n: number) => ({ name: 'offset', options: n }),
  flip: () => ({ name: 'flip' }),
  shift: () => ({ name: 'shift' }),
}));

// Import after mock
const { createFloatingPosition, virtualElement } = await import('../floating');

describe('createFloatingPosition', () => {
  let reference: HTMLElement;
  let floating: HTMLElement;

  beforeEach(() => {
    reference = document.createElement('button');
    floating = document.createElement('div');
    document.body.appendChild(reference);
    document.body.appendChild(floating);
    mockComputePosition.mockClear();
    mockAutoUpdate.mockClear();
    // Re-set default return
    mockComputePosition.mockImplementation(() =>
      Promise.resolve({
        x: 100,
        y: 200,
        placement: 'bottom-start',
        strategy: 'fixed',
        middlewareData: {},
      } as ComputePositionReturn),
    );
    mockAutoUpdate.mockImplementation((_ref, _fl, updateFn) => {
      (updateFn as () => void)();
      return () => {};
    });
  });

  afterEach(() => {
    reference.remove();
    floating.remove();
    // Clean up any portaled elements
    for (const el of document.body.querySelectorAll('[data-side]')) {
      el.remove();
    }
  });

  it('sets position strategy on floating element', async () => {
    const result = createFloatingPosition(reference, floating);
    // Wait for async computePosition
    await result.update();
    expect(floating.style.position).toBe('fixed');
  });

  it('sets data-side and data-align from resolved placement', async () => {
    const result = createFloatingPosition(reference, floating);
    await result.update();
    expect(floating.getAttribute('data-side')).toBe('bottom');
    expect(floating.getAttribute('data-align')).toBe('start');
  });

  it('sets data-align to center when placement has no alignment', async () => {
    mockComputePosition.mockImplementation(() =>
      Promise.resolve({
        x: 50,
        y: 100,
        placement: 'top',
        strategy: 'fixed',
        middlewareData: {},
      } as ComputePositionReturn),
    );
    const result = createFloatingPosition(reference, floating, { placement: 'top' });
    await result.update();
    expect(floating.getAttribute('data-side')).toBe('top');
    expect(floating.getAttribute('data-align')).toBe('center');
  });

  it('returns cleanup function', () => {
    const result = createFloatingPosition(reference, floating);
    expect(typeof result.cleanup).toBe('function');
    // Should not throw
    result.cleanup();
  });

  it('portal mode appends to document.body', () => {
    const container = document.createElement('div');
    const portalFloating = document.createElement('div');
    container.appendChild(portalFloating);
    document.body.appendChild(container);

    expect(portalFloating.parentElement).toBe(container);

    const result = createFloatingPosition(reference, portalFloating, { portal: true });
    expect(portalFloating.parentElement).toBe(document.body);

    result.cleanup();
    portalFloating.remove();
    container.remove();
  });

  it('does not portal when portal option is false', () => {
    const container = document.createElement('div');
    const nonPortalFloating = document.createElement('div');
    container.appendChild(nonPortalFloating);
    document.body.appendChild(container);

    const result = createFloatingPosition(reference, nonPortalFloating, { portal: false });
    expect(nonPortalFloating.parentElement).toBe(container);

    result.cleanup();
    nonPortalFloating.remove();
    container.remove();
  });

  it('sets left and top from computed position', async () => {
    const result = createFloatingPosition(reference, floating);
    await result.update();
    expect(floating.style.left).toBe('100px');
    expect(floating.style.top).toBe('200px');
  });
});

describe('virtualElement', () => {
  it('returns valid rect at coordinates', () => {
    const ve = virtualElement(150, 300);
    const rect = ve.getBoundingClientRect();
    expect(rect.x).toBe(150);
    expect(rect.y).toBe(300);
    expect(rect.left).toBe(150);
    expect(rect.top).toBe(300);
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });
});
