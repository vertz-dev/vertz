import { describe, expect, it } from 'bun:test';
import type { ComposedPrimitive } from '../composed/with-styles';
import { withStyles } from '../composed/with-styles';

describe('withStyles', () => {
  it('throws a descriptive error when component is undefined', () => {
    expect(() => {
      withStyles(undefined as unknown as ComposedPrimitive, {} as Record<string, string>);
    }).toThrow('withStyles() received an undefined component');
  });

  it('throws a descriptive error when component is null', () => {
    expect(() => {
      withStyles(null as unknown as ComposedPrimitive, {} as Record<string, string>);
    }).toThrow('withStyles() received an undefined component');
  });

  it('works correctly with a valid component', () => {
    const mockComponent = Object.assign(
      (props: { children?: unknown; classes?: Record<string, string> }) => {
        return document.createElement('div');
      },
      { SubComponent: () => document.createElement('span') },
    ) as unknown as ComposedPrimitive;

    const styled = withStyles(mockComponent, { base: 'test-class' } as Record<string, string>);
    expect(typeof styled).toBe('function');
    expect(styled.SubComponent).toBe(mockComponent.SubComponent);

    // Call the styled function to verify the closure works
    const result = styled({});
    expect(result).toBeInstanceOf(HTMLDivElement);
  });

  describe('Given props with getter descriptors (compiler-generated reactivity)', () => {
    describe('When withStyles passes props to the underlying component', () => {
      it('Then getter descriptors are preserved, not eagerly evaluated', () => {
        let callCount = 0;
        const propsWithGetters = Object.defineProperties(
          {} as Record<string, unknown>,
          {
            value: {
              get() {
                callCount++;
                return 'reactive-value';
              },
              enumerable: true,
              configurable: true,
            },
          },
        );

        let receivedProps: Record<string, unknown> | null = null;
        const mockComponent = Object.assign(
          (props: { children?: unknown; classes?: Record<string, string> }) => {
            receivedProps = props as Record<string, unknown>;
            return document.createElement('input');
          },
        ) as unknown as ComposedPrimitive;

        const styled = withStyles(mockComponent, { base: 'test-class' } as Record<string, string>);

        // Reset call count before invoking styled
        callCount = 0;
        styled(propsWithGetters as Omit<Parameters<typeof mockComponent>[0], 'classes'>);

        // The getter should NOT have been eagerly evaluated by withStyles
        // It should still be a getter on the props passed to the component
        const descriptor = Object.getOwnPropertyDescriptor(receivedProps!, 'value');
        expect(descriptor?.get).toBeDefined();
      });
    });
  });
});
