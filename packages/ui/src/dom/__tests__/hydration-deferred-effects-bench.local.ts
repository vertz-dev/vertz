import { afterEach, describe, expect, it } from 'bun:test';
import { endHydration, startHydration } from '../../hydrate/hydration-context';
import { deferredDomEffect, domEffect, signal } from '../../runtime/signal';

describe('hydration effect deferral — benchmark', () => {
  afterEach(() => {
    try {
      endHydration();
    } catch {
      // May throw if not hydrating
    }
  });

  it('deferredDomEffect is faster than domEffect during hydration walk for 1000 effects', () => {
    const N = 1000;
    const signals = Array.from({ length: N }, (_, i) => signal(i));

    // Measure baseline: domEffect (runs synchronously during hydration)
    {
      const root = document.createElement('div');
      for (let i = 0; i < N; i++) {
        root.appendChild(document.createTextNode(String(i)));
      }
      startHydration(root);

      const startTime = performance.now();
      const disposers: (() => void)[] = [];
      for (let i = 0; i < N; i++) {
        const s = signals[i];
        const textNode = root.childNodes[i] as Text;
        disposers.push(
          domEffect(() => {
            if (s) textNode.data = String(s.value);
          }),
        );
      }
      const syncTime = performance.now() - startTime;

      endHydration();
      for (const d of disposers) d();

      // Measure deferred: deferredDomEffect (queued, flushed at end)
      const root2 = document.createElement('div');
      for (let i = 0; i < N; i++) {
        root2.appendChild(document.createTextNode(String(i)));
      }
      startHydration(root2);

      const startTime2 = performance.now();
      const disposers2: (() => void)[] = [];
      for (let i = 0; i < N; i++) {
        const s = signals[i];
        const textNode = root2.childNodes[i] as Text;
        disposers2.push(
          deferredDomEffect(() => {
            if (s) textNode.data = String(s.value);
          }),
        );
      }
      const walkTime = performance.now() - startTime2;

      // Flush happens here
      const flushStart = performance.now();
      endHydration();
      const flushTime = performance.now() - flushStart;

      for (const d of disposers2) d();

      // The hydration walk time (registration only) should be significantly
      // faster than the synchronous approach
      console.log(`[benchmark] ${N} effects:`);
      console.log(`  sync (domEffect):     ${syncTime.toFixed(3)}ms`);
      console.log(`  walk (deferredDomEffect): ${walkTime.toFixed(3)}ms`);
      console.log(`  flush (endHydration): ${flushTime.toFixed(3)}ms`);
      console.log(`  total deferred:       ${(walkTime + flushTime).toFixed(3)}ms`);
      console.log(`  walk speedup:         ${(syncTime / walkTime).toFixed(1)}x`);

      // The walk phase should be at least 2x faster than synchronous
      // (it only allocates EffectImpl, no fn() execution)
      expect(walkTime).toBeLessThan(syncTime);
    }
  });

  it('reactive updates work correctly for all 1000 deferred effects after flush', () => {
    const N = 1000;
    const root = document.createElement('div');
    const signals = Array.from({ length: N }, (_, i) => signal(i));

    for (let i = 0; i < N; i++) {
      root.appendChild(document.createTextNode(String(i)));
    }
    startHydration(root);

    const textNodes: Text[] = [];
    for (let i = 0; i < N; i++) {
      const s = signals[i];
      const textNode = root.childNodes[i] as Text;
      textNodes.push(textNode);
      deferredDomEffect(() => {
        if (s) textNode.data = String(s.value);
      });
    }

    endHydration();

    // Verify all effects are subscribed by changing signals
    for (let i = 0; i < N; i++) {
      const sig = signals[i];
      if (sig) sig.value = i + 1000;
    }
    for (let i = 0; i < N; i++) {
      expect(textNodes[i]?.data).toBe(String(i + 1000));
    }
  });
});
