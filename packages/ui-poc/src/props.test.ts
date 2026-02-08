import { describe, expect, it } from 'vitest';
import { effect, signal } from './signal';

/**
 * Validates the prop getter wrapping pattern described in the design:
 *
 * When a parent passes a reactive value to a child, the compiler wraps it
 * as a getter on the props object:
 *
 *   Child({ get value() { return __count.get() } })
 *
 * The child reads props.value inside a reactive closure -> auto-tracks
 * the parent's signal.
 */
describe('prop getter wrapping', () => {
  it('child reads parent reactive prop via getter', () => {
    // Simulate compiled output: parent has a signal
    const __count = signal(0);

    // Simulate compiled output: child receives getter-wrapped props
    function Child(props: { value: number }) {
      const values: number[] = [];
      const dispose = effect(() => {
        values.push(props.value); // reads via getter -> tracks __count
      });
      return { values, dispose };
    }

    // Compiled call: Child({ get value() { return __count.get() } })
    const result = Child({
      get value() {
        return __count.get();
      },
    });

    expect(result.values).toEqual([0]);

    __count.set(5);
    expect(result.values).toEqual([0, 5]);

    __count.set(10);
    expect(result.values).toEqual([0, 5, 10]);

    result.dispose();
  });

  it('child receives multiple getter-wrapped props', () => {
    const __name = signal('Alice');
    const __age = signal(30);

    function Profile(props: { name: string; age: number }) {
      const outputs: string[] = [];
      const dispose = effect(() => {
        outputs.push(`${props.name} (${props.age})`);
      });
      return { outputs, dispose };
    }

    const result = Profile({
      get name() {
        return __name.get();
      },
      get age() {
        return __age.get();
      },
    });

    expect(result.outputs).toEqual(['Alice (30)']);

    __name.set('Bob');
    expect(result.outputs).toEqual(['Alice (30)', 'Bob (30)']);

    __age.set(25);
    expect(result.outputs).toEqual(['Alice (30)', 'Bob (30)', 'Bob (25)']);

    result.dispose();
  });

  it('static props (non-reactive) are not wrapped as getters', () => {
    const __count = signal(0);

    function Mixed(props: { dynamic: number; label: string }) {
      const outputs: string[] = [];
      const dispose = effect(() => {
        outputs.push(`${props.label}: ${props.dynamic}`);
      });
      return { outputs, dispose };
    }

    // dynamic is a getter, label is a plain value
    const result = Mixed({
      get dynamic() {
        return __count.get();
      },
      label: 'Count', // static: plain value, not a getter
    });

    expect(result.outputs).toEqual(['Count: 0']);

    __count.set(42);
    expect(result.outputs).toEqual(['Count: 0', 'Count: 42']);

    result.dispose();
  });

  it('prop getter wrapping works with spread props', () => {
    const __x = signal(1);
    const __y = signal(2);

    function Point(props: { x: number; y: number }) {
      const outputs: string[] = [];
      const dispose = effect(() => {
        outputs.push(`(${props.x}, ${props.y})`);
      });
      return { outputs, dispose };
    }

    // Spread followed by getter: the getter wins because it's defined after spread
    const baseProps = { x: 0, y: 0 };
    const result = Point(
      Object.defineProperties({} as { x: number; y: number }, {
        ...Object.getOwnPropertyDescriptors(baseProps),
        x: {
          get() {
            return __x.get();
          },
          enumerable: true,
          configurable: true,
        },
        y: {
          get() {
            return __y.get();
          },
          enumerable: true,
          configurable: true,
        },
      }),
    );

    expect(result.outputs).toEqual(['(1, 2)']);

    __x.set(10);
    expect(result.outputs).toEqual(['(1, 2)', '(10, 2)']);

    result.dispose();
  });

  it('conditional prop expression works with getter', () => {
    const __show = signal(true);
    const __text = signal('hello');

    function Display(props: { content: string | null }) {
      const outputs: (string | null)[] = [];
      const dispose = effect(() => {
        outputs.push(props.content);
      });
      return { outputs, dispose };
    }

    const result = Display({
      get content() {
        return __show.get() ? __text.get() : null;
      },
    });

    expect(result.outputs).toEqual(['hello']);

    __show.set(false);
    expect(result.outputs).toEqual(['hello', null]);

    __show.set(true);
    __text.set('world');
    // show=true triggers first, then text change triggers again
    // Both happen synchronously in sequence
    expect(result.outputs.length).toBeGreaterThanOrEqual(3);
    expect(result.outputs[result.outputs.length - 1]).toBe('world');

    result.dispose();
  });
});
