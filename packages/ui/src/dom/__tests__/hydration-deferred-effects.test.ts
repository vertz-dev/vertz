import { afterEach, describe, expect, it, vi } from 'bun:test';
import {
  endHydration,
  pauseHydration,
  resumeHydration,
  startHydration,
} from '../../hydrate/hydration-context';
import { deferredDomEffect, signal } from '../../runtime/signal';
import { __attr } from '../attributes';
import { __child, __text } from '../element';

describe('deferred effects during hydration', () => {
  afterEach(() => {
    // Ensure hydration is ended even if test fails
    try {
      endHydration();
    } catch {
      // May throw if not hydrating
    }
  });

  describe('domEffect deferral', () => {
    it('does not run effect function immediately during hydration', () => {
      const root = document.createElement('div');
      startHydration(root);

      let ran = false;
      deferredDomEffect(() => {
        ran = true;
      });

      expect(ran).toBe(false);

      endHydration();
    });

    it('runs deferred effects when endHydration is called', () => {
      const root = document.createElement('div');
      startHydration(root);

      let ran = false;
      deferredDomEffect(() => {
        ran = true;
      });

      expect(ran).toBe(false);
      endHydration();
      expect(ran).toBe(true);
    });

    it('establishes dependency tracking after flush', () => {
      const root = document.createElement('div');
      startHydration(root);

      const count = signal(0);
      let effectValue = -1;
      deferredDomEffect(() => {
        effectValue = count.value;
      });

      // Effect hasn't run yet
      expect(effectValue).toBe(-1);

      endHydration();

      // Effect ran during flush — tracked dependencies
      expect(effectValue).toBe(0);

      // Reactive updates work after flush
      count.value = 42;
      expect(effectValue).toBe(42);
    });

    it('preserves effect execution order', () => {
      const root = document.createElement('div');
      startHydration(root);

      const order: number[] = [];
      deferredDomEffect(() => {
        order.push(1);
      });
      deferredDomEffect(() => {
        order.push(2);
      });
      deferredDomEffect(() => {
        order.push(3);
      });

      expect(order).toEqual([]);
      endHydration();
      expect(order).toEqual([1, 2, 3]);
    });

    it('dispose works on deferred effects before flush', () => {
      const root = document.createElement('div');
      startHydration(root);

      let ran = false;
      const dispose = deferredDomEffect(() => {
        ran = true;
      });

      // Dispose before flush — effect should not run
      dispose();
      endHydration();
      expect(ran).toBe(false);
    });
  });

  describe('__text deferred during hydration', () => {
    it('defers effect but preserves SSR text content', () => {
      const root = document.createElement('div');
      root.appendChild(document.createTextNode('Count: 0'));
      startHydration(root);

      const count = signal(0);
      let effectRuns = 0;
      const node = __text(() => {
        effectRuns++;
        return `Count: ${count.value}`;
      });

      // Text node adopted from SSR — content is correct
      expect(node.data).toBe('Count: 0');
      // Effect was deferred, not run yet
      expect(effectRuns).toBe(0);

      endHydration();

      // Effect ran during flush
      expect(effectRuns).toBe(1);
      expect(node.data).toBe('Count: 0');
    });

    it('reactive updates work after hydration flush', () => {
      const root = document.createElement('div');
      root.appendChild(document.createTextNode('hello'));
      startHydration(root);

      const text = signal('hello');
      const node = __text(() => text.value);

      endHydration();

      text.value = 'world';
      expect(node.data).toBe('world');
    });
  });

  describe('__attr deferred during hydration', () => {
    it('defers attribute effect during hydration', () => {
      const root = document.createElement('div');
      const btn = document.createElement('button');
      btn.setAttribute('disabled', '');
      root.appendChild(btn);
      startHydration(root);

      const disabled = signal(true);
      let effectRuns = 0;
      __attr(btn, 'disabled', () => {
        effectRuns++;
        return disabled.value ? '' : null;
      });

      // Attribute already set from SSR
      expect(btn.getAttribute('disabled')).toBe('');
      // Effect was deferred
      expect(effectRuns).toBe(0);

      endHydration();

      // Effect ran during flush
      expect(effectRuns).toBe(1);
    });

    it('reactive attribute updates work after flush', () => {
      const root = document.createElement('div');
      const btn = document.createElement('button');
      btn.setAttribute('disabled', '');
      root.appendChild(btn);
      startHydration(root);

      const disabled = signal(true);
      __attr(btn, 'disabled', () => (disabled.value ? '' : null));

      endHydration();

      disabled.value = false;
      expect(btn.hasAttribute('disabled')).toBe(false);
    });
  });

  describe('__child NOT deferred (pauseHydration)', () => {
    it('runs __child effect synchronously because pauseHydration is called', () => {
      const root = document.createElement('div');
      const span = document.createElement('span');
      span.style.display = 'contents';
      span.textContent = 'ssr-content';
      root.appendChild(span);
      startHydration(root);

      let effectRuns = 0;
      const wrapper = __child(() => {
        effectRuns++;
        return 'csr-content';
      });

      // __child's effect ran synchronously (pauseHydration disables deferral)
      expect(effectRuns).toBe(1);
      expect(wrapper.textContent).toBe('csr-content');

      endHydration();
    });

    it('__attr runs synchronously inside pauseHydration region', () => {
      const root = document.createElement('div');
      const btn = document.createElement('button');
      root.appendChild(btn);
      startHydration(root);

      // Simulate the __child pattern: pause hydration, then call __attr
      pauseHydration();
      let effectRuns = 0;
      const disabled = signal(true);
      __attr(btn, 'disabled', () => {
        effectRuns++;
        return disabled.value ? '' : null;
      });
      resumeHydration();

      // __attr ran synchronously (pauseHydration prevents deferral)
      expect(effectRuns).toBe(1);
      expect(btn.getAttribute('disabled')).toBe('');

      endHydration();
    });
  });

  describe('flush resilience', () => {
    it('continues flushing after a throwing effect', () => {
      const root = document.createElement('div');
      startHydration(root);

      const order: number[] = [];
      deferredDomEffect(() => {
        order.push(1);
      });
      deferredDomEffect(() => {
        throw new Error('boom');
      });
      deferredDomEffect(() => {
        order.push(3);
      });

      // Suppress expected console.error
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      endHydration();
      spy.mockRestore();

      // Effect 1 and 3 should have run despite effect 2 throwing
      expect(order).toEqual([1, 3]);
    });
  });
});
