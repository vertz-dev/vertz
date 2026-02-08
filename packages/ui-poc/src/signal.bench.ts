import { bench, describe } from 'vitest';
import { batch, computed, effect, signal } from './signal';

describe('signal runtime performance', () => {
  bench('signal create + get + set (1000 iterations)', () => {
    for (let i = 0; i < 1000; i++) {
      const s = signal(i);
      s.get();
      s.set(i + 1);
    }
  });

  bench('computed derivation chain (depth=10, 100 updates)', () => {
    const root = signal(0);
    let current: { get(): number } = root;
    for (let i = 0; i < 10; i++) {
      const prev = current;
      current = computed(() => prev.get() + 1);
    }
    for (let i = 0; i < 100; i++) {
      root.set(i);
      current.get();
    }
  });

  bench('effect with 100 signals, batch update all', () => {
    const signals = Array.from({ length: 100 }, (_, i) => signal(i));
    let _sum = 0;
    const dispose = effect(() => {
      _sum = 0;
      for (const s of signals) {
        _sum += s.get();
      }
    });
    batch(() => {
      for (let i = 0; i < signals.length; i++) {
        signals[i]?.set(i * 2);
      }
    });
    dispose();
  });

  bench('1000 subscribers on one signal', () => {
    const s = signal(0);
    const disposes: (() => void)[] = [];
    for (let i = 0; i < 1000; i++) {
      disposes.push(
        effect(() => {
          s.get();
        }),
      );
    }
    s.set(1);
    for (const d of disposes) {
      d();
    }
  });

  bench('diamond dependency graph (100 updates)', () => {
    const source = signal(0);
    const left = computed(() => source.get() + 1);
    const right = computed(() => source.get() * 2);
    const bottom = computed(() => left.get() + right.get());
    const dispose = effect(() => {
      bottom.get();
    });
    for (let i = 0; i < 100; i++) {
      source.set(i);
    }
    dispose();
  });
});
