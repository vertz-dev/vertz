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
});
