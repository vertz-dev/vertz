import { afterEach, describe, expect, it, mock } from 'bun:test';
import { endHydration, getIsHydrating, startHydration } from '../../hydrate/hydration-context';
import { Island } from '../island';

describe('Feature: Island component', () => {
  describe('Given a component and valid props', () => {
    describe('When Island renders', () => {
      it('Then the output has data-v-island attribute with the island id', () => {
        const wrapper = Island({
          id: 'Counter',
          component: () => document.createElement('button'),
          props: { start: 0 },
        });

        expect(wrapper.getAttribute('data-v-island')).toBe('Counter');
      });

      it('Then the output contains a script tag with serialized props', () => {
        const wrapper = Island({
          id: 'Counter',
          component: () => document.createElement('button'),
          props: { start: 0, label: 'Click me' },
        });

        const script = wrapper.querySelector('script[data-v-island-props]');
        expect(script).not.toBeNull();
        expect(script!.getAttribute('type')).toBe('application/json');
        expect(script!.textContent).toBe('{"start":0,"label":"Click me"}');
      });

      it('Then the component content is rendered inside the wrapper', () => {
        const wrapper = Island({
          id: 'Counter',
          component: () => {
            const btn = document.createElement('button');
            btn.textContent = 'Count: 0';
            return btn;
          },
          props: {},
        });

        const btn = wrapper.querySelector('button');
        expect(btn).not.toBeNull();
        expect(btn!.textContent).toBe('Count: 0');
      });
    });
  });

  describe('Given props with default empty object', () => {
    describe('When Island renders without explicit props', () => {
      it('Then the serialized props script contains an empty object', () => {
        const wrapper = Island({
          id: 'Simple',
          component: () => document.createElement('span'),
        });

        const script = wrapper.querySelector('script[data-v-island-props]');
        expect(script!.textContent).toBe('{}');
      });
    });
  });

  describe('Given a function prop', () => {
    describe('When Island renders', () => {
      it('Then it throws a clear error about non-serializable props', () => {
        expect(() => {
          Island({
            id: 'Form',
            component: () => document.createElement('form'),
            props: { onSubmit: () => {} },
          });
        }).toThrow('function prop "onSubmit"');
      });
    });
  });

  describe('Given a Symbol prop', () => {
    describe('When Island renders', () => {
      it('Then it throws a clear error about non-serializable props', () => {
        expect(() => {
          Island({
            id: 'Widget',
            component: () => document.createElement('div'),
            props: { key: Symbol('test') },
          });
        }).toThrow('Symbol prop "key"');
      });
    });
  });

  describe('Given valid serializable props (strings, numbers, booleans, arrays, objects)', () => {
    describe('When Island renders', () => {
      it('Then all props are serialized correctly', () => {
        const wrapper = Island({
          id: 'Config',
          component: () => document.createElement('div'),
          props: {
            name: 'test',
            count: 42,
            active: true,
            tags: ['a', 'b'],
            nested: { x: 1 },
          },
        });

        const script = wrapper.querySelector('script[data-v-island-props]');
        const parsed = JSON.parse(script!.textContent!);
        expect(parsed).toEqual({
          name: 'test',
          count: 42,
          active: true,
          tags: ['a', 'b'],
          nested: { x: 1 },
        });
      });
    });
  });

  describe('Given a component that returns a string', () => {
    describe('When Island renders', () => {
      it('Then the string is rendered as a text node inside the wrapper', () => {
        const wrapper = Island({
          id: 'Text',
          component: () => 'Hello World',
          props: {},
        });

        // Script tag + text node
        expect(wrapper.childNodes.length).toBe(2);
        expect(wrapper.textContent).toContain('Hello World');
      });
    });
  });

  describe('Given SSR-rendered Island DOM and active hydration', () => {
    afterEach(() => {
      if (getIsHydrating()) endHydration();
      document.body.innerHTML = '';
    });

    describe('When Island renders during hydration', () => {
      it('Then it claims the existing wrapper instead of creating a new one', () => {
        // Simulate SSR output
        document.body.innerHTML = `
          <div data-v-island="CopyBtn">
            <script data-v-island-props type="application/json">{}</script>
            <button>Copy</button>
          </div>
        `;

        const ssrWrapper = document.body.firstElementChild as HTMLDivElement;
        const ssrButton = ssrWrapper.querySelector('button')!;

        startHydration(document.body);

        const componentFn = mock((_props: Record<string, unknown>) => {
          // Component doesn't need to return anything during hydration —
          // it attaches handlers to the claimed SSR nodes
        });

        const result = Island({
          id: 'CopyBtn',
          component: componentFn,
          props: {},
        });

        endHydration();

        // The returned element is the same SSR node, not a new one
        expect(result).toBe(ssrWrapper);
        // The component was called with props
        expect(componentFn).toHaveBeenCalledTimes(1);
        expect(componentFn).toHaveBeenCalledWith({});
        // The original button is still in the DOM (not replaced)
        expect(ssrWrapper.querySelector('button')).toBe(ssrButton);
      });

      it('Then the component can claim child elements and attach handlers', () => {
        document.body.innerHTML = `
          <div data-v-island="CopyBtn">
            <script data-v-island-props type="application/json">{}</script>
            <button>Click me</button>
          </div>
        `;

        const ssrButton = document.querySelector('button')!;

        startHydration(document.body);

        let clickHandler: (() => void) | null = null;
        const result = Island({
          id: 'CopyBtn',
          component: () => {
            // During hydration, the cursor is inside the island wrapper,
            // past the script tag. The button is the next claimable element.
            const { claimElement: claim } = require('../../hydrate/hydration-context');
            const btn = claim('button');
            if (btn) {
              clickHandler = mock(() => {});
              btn.addEventListener('click', clickHandler);
            }
            return btn;
          },
          props: {},
        });

        endHydration();

        // The button is the same SSR node
        expect(ssrButton.parentElement).toBe(result);
        // The click handler was attached
        expect(clickHandler).not.toBeNull();
        ssrButton.click();
        expect(clickHandler).toHaveBeenCalledTimes(1);
      });
    });

    describe('When Island renders during hydration with no matching SSR node', () => {
      it('Then it falls through to CSR path and creates fresh DOM', () => {
        // Empty body — no SSR content to claim
        document.body.innerHTML = '';

        startHydration(document.body);

        const result = Island({
          id: 'CopyBtn',
          component: () => {
            const btn = document.createElement('button');
            btn.textContent = 'Fresh';
            return btn;
          },
          props: {},
        });

        endHydration();

        // Created fresh DOM since there's nothing to claim
        expect(result.getAttribute('data-v-island')).toBe('CopyBtn');
        expect(result.querySelector('button')!.textContent).toBe('Fresh');
      });
    });
  });
});
