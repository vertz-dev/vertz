import { afterEach, describe, expect, it } from 'bun:test';
import { _getComponent, _getPrimitive, _resetTheme, registerTheme } from '../theme/registry';

describe('theme registry', () => {
  afterEach(() => _resetTheme());

  it('stores components and makes them retrievable via _getComponent', () => {
    const mockButton = () => document.createElement('button');
    registerTheme({ components: { Button: mockButton } });
    expect(_getComponent('Button')).toBe(mockButton);
  });

  it('throws when _getComponent is called without registering a theme', () => {
    expect(() => _getComponent('Button')).toThrow('No theme registered');
  });

  it('throws when _getPrimitive is called without registering a theme', () => {
    expect(() => _getPrimitive('Button')).toThrow('No theme registered');
  });

  it('stores primitives from components.primitives', () => {
    const mockDialog = () => document.createElement('div');
    registerTheme({ components: { primitives: { Dialog: mockDialog } } });
    expect(_getPrimitive('Dialog')).toBe(mockDialog);
  });

  it('defaults primitives to empty object when not provided', () => {
    registerTheme({ components: { Button: () => {} } });
    expect(_getPrimitive('Dialog')).toBeUndefined();
  });

  it('replaces previously registered theme', () => {
    const first = () => 'first';
    const second = () => 'second';
    registerTheme({ components: { Button: first } });
    registerTheme({ components: { Button: second } });
    expect(_getComponent('Button')).toBe(second);
  });

  it('throws descriptive error when called with invalid input', () => {
    // @ts-expect-error -- testing runtime validation
    expect(() => registerTheme(null)).toThrow('registerTheme() expects an object');
    // @ts-expect-error -- testing runtime validation
    expect(() => registerTheme({})).toThrow('registerTheme() expects an object');
    // @ts-expect-error -- testing runtime validation
    expect(() => registerTheme({ components: null })).toThrow('registerTheme() expects an object');
  });

  it('returns undefined for components not in the registered theme', () => {
    registerTheme({ components: { Button: () => {} } });
    expect(_getComponent('NonExistent')).toBeUndefined();
  });
});
