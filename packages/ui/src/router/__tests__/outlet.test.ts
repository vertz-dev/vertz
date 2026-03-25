import { describe, expect, test } from 'bun:test';
import { onMount } from '../../component/lifecycle';
import { __element } from '../../dom/element';
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

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- value is guaranteed set inside Provider callback
    expect(result!.textContent).toBe('First');

    // Update the signal — Outlet should reactively swap
    childComponent.value = () => child2;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- value is guaranteed set inside Provider callback
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

  test('hydration with lazy child claims SSR nodes instead of recreating (#1347)', async () => {
    // Simulate SSR-rendered DOM:
    // <div> (Outlet container)
    //   <div data-testid="child">SSR Child</div>
    // </div>
    const root = document.createElement('div');
    root.innerHTML = '<div><div data-testid="child">SSR Child</div></div>';

    const outletContainer = root.firstChild as HTMLElement;
    const ssrChildNode = outletContainer.firstChild as HTMLElement;
    expect(outletContainer.children.length).toBe(1);

    startHydration(root);

    const childComponent = signal<(() => Node | Promise<{ default: () => Node }>) | undefined>(() =>
      Promise.resolve({
        default: () => {
          // Use __element like a real compiled component — claims SSR node during hydration
          const el = __element('div');
          el.setAttribute('data-testid', 'child');
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

    // After promise resolves, the lazy component should claim the SSR node
    await new Promise((r) => setTimeout(r, 0));

    // Must have exactly 1 child — NOT 2
    expect(outlet!.children.length).toBe(1);
    // The SSR node should be preserved (same DOM reference, not recreated)
    expect(outlet!.firstChild).toBe(ssrChildNode);
  });

  test('sync child with mismatched tag during hydration re-entry appears in DOM (#1368)', () => {
    // Simulate SSR-rendered DOM:
    // <div> (outlet container)
    //   <div data-testid="child">SSR Child</div>
    const root = document.createElement('div');
    root.innerHTML = '<div><div data-testid="child">SSR Child</div></div>';

    startHydration(root);

    // Sync child creates a <span> — mismatches SSR's <div>
    const childComponent = signal<(() => Node) | undefined>(() => {
      const el = __element('span');
      el.textContent = 'Client Child';
      return el;
    });

    let outlet: HTMLElement;
    OutletContext.Provider({ childComponent, router: mockRouter }, () => {
      outlet = Outlet();
    });

    endHydration();

    // The <span> should be in the DOM despite the mismatch
    expect(outlet!.children.length).toBe(1);
    expect(outlet!.firstChild!.nodeName).toBe('SPAN');
    expect(outlet!.textContent).toBe('Client Child');
  });

  test('sync child using document.createElement during hydration re-entry is appended (#1368)', () => {
    // Non-compiled component uses document.createElement instead of __element
    const root = document.createElement('div');
    root.innerHTML = '<div><div>SSR Content</div></div>';

    startHydration(root);

    const childComponent = signal<(() => Node) | undefined>(() => {
      // Non-compiled component — doesn't use __element at all
      const el = document.createElement('p');
      el.textContent = 'Non-compiled';
      return el;
    });

    let outlet: HTMLElement;
    OutletContext.Provider({ childComponent, router: mockRouter }, () => {
      outlet = Outlet();
    });

    endHydration();

    expect(outlet!.children.length).toBe(1);
    expect(outlet!.firstChild!.nodeName).toBe('P');
    expect(outlet!.textContent).toBe('Non-compiled');
  });

  test('sync child that claims SSR node during hydration is not double-appended (#1368)', () => {
    // When the tag matches, the SSR node is claimed — no duplicate append
    const root = document.createElement('div');
    root.innerHTML = '<div><div data-testid="child">SSR Child</div></div>';

    const outletContainer = root.firstChild as HTMLElement;
    const ssrChildNode = outletContainer.firstChild as HTMLElement;

    startHydration(root);

    const childComponent = signal<(() => Node) | undefined>(() => {
      // Sync child claims the SSR <div> — tags match
      const el = __element('div');
      el.setAttribute('data-testid', 'child');
      return el;
    });

    let outlet: HTMLElement;
    OutletContext.Provider({ childComponent, router: mockRouter }, () => {
      outlet = Outlet();
    });

    endHydration();

    // The claimed SSR node should still be the only child (no duplication)
    expect(outlet!.children.length).toBe(1);
    expect(outlet!.firstChild).toBe(ssrChildNode);
  });
});
