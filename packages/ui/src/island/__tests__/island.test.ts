import { describe, expect, it } from 'bun:test';
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
});
