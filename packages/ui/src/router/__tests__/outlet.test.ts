import { describe, expect, test } from 'bun:test';
import { onMount } from '../../component/lifecycle';
import { endHydration, startHydration } from '../../hydrate/hydration-context';
import { signal } from '../../runtime/signal';
import type { Router } from '../navigate';
import { Outlet, OutletContext } from '../outlet';

// Minimal mock router for OutletContext (only used for async context restoration)
const mockRouter = { current: signal(null) } as unknown as Router;

describe('Outlet', () => {
  test('returns empty element when no OutletContext', () => {
    const result = Outlet();
    expect(result.nodeType).toBe(Node.ELEMENT_NODE);
    expect((result as HTMLElement).style.display).toBe('contents');
    expect(result.childNodes.length).toBe(0);
  });

  test('renders child component from context', () => {
    const child = document.createElement('span');
    child.textContent = 'Child Content';
    const childComponent = signal<(() => Node) | undefined>(() => child);

    let result: Node | undefined;
    OutletContext.Provider({ childComponent, router: mockRouter }, () => {
      result = Outlet();
    });

    expect(result).toBeInstanceOf(HTMLDivElement);
    expect((result as HTMLElement).textContent).toBe('Child Content');
  });

  test('reactively swaps child when signal changes', () => {
    const child1 = document.createElement('span');
    child1.textContent = 'First';
    const child2 = document.createElement('span');
    child2.textContent = 'Second';
    const childComponent = signal<(() => Node) | undefined>(() => child1);

    let result: HTMLElement | undefined;
    OutletContext.Provider({ childComponent, router: mockRouter }, () => {
      result = Outlet() as HTMLElement;
    });

    // biome-ignore lint/style/noNonNullAssertion: value is guaranteed set inside Provider callback
    expect(result!.textContent).toBe('First');

    // Update the signal — Outlet should reactively swap
    childComponent.value = () => child2;
    // biome-ignore lint/style/noNonNullAssertion: value is guaranteed set inside Provider callback
    expect(result!.textContent).toBe('Second');
  });

  test('cleans up previous child scope on swap', () => {
    let cleanedUp = false;
    const childComponent = signal<(() => Node) | undefined>(() => {
      onMount(() => {
        return () => {
          cleanedUp = true;
        };
      });
      return document.createElement('div');
    });

    OutletContext.Provider({ childComponent, router: mockRouter }, () => {
      Outlet();
    });

    expect(cleanedUp).toBe(false);

    // Swap to new child — previous child's cleanup should run
    childComponent.value = () => document.createElement('span');
    expect(cleanedUp).toBe(true);
  });

  test('signal reads inside child do NOT trigger Outlet re-render', () => {
    const externalSignal = signal('initial');
    let renderCount = 0;

    const childComponent = signal<(() => Node) | undefined>(() => {
      renderCount++;
      // Read an external signal inside the child factory
      const _value = externalSignal.value;
      const el = document.createElement('div');
      el.textContent = _value;
      return el;
    });

    OutletContext.Provider({ childComponent, router: mockRouter }, () => {
      Outlet();
    });

    expect(renderCount).toBe(1);

    // Changing the external signal should NOT re-trigger Outlet's domEffect
    externalSignal.value = 'updated';
    expect(renderCount).toBe(1);
  });

  test('hydration with lazy child does not produce duplicate elements (#1347)', async () => {
    // Simulate SSR-rendered DOM:
    // <div> (Outlet container)
    //   <div data-testid="child">SSR Child</div>
    // </div>
    const root = document.createElement('div');
    root.innerHTML = '<div><div data-testid="child">SSR Child</div></div>';

    const outletContainer = root.firstChild as HTMLElement;
    expect(outletContainer.children.length).toBe(1);

    startHydration(root);

    const childComponent = signal<(() => Node | Promise<{ default: () => Node }>) | undefined>(() =>
      Promise.resolve({
        default: () => {
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'child');
          el.textContent = 'CSR Child';
          return el;
        },
      }),
    );

    let outlet: HTMLElement;
    OutletContext.Provider({ childComponent, router: mockRouter }, () => {
      outlet = Outlet();
    });

    endHydration();

    // Before promise resolves, SSR content should still be present
    expect(outlet!.children.length).toBe(1);

    // After promise resolves, the lazy component replaces SSR content
    await new Promise((r) => setTimeout(r, 0));

    // Must have exactly 1 child — NOT 2 (the bug was SSR + CSR both present)
    expect(outlet!.children.length).toBe(1);
    expect(outlet!.textContent).toBe('CSR Child');
  });
});
