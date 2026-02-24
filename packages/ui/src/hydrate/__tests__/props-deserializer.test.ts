import { describe, expect, it } from 'bun:test';
import { deserializeProps } from '../props-deserializer';

describe('deserializeProps', () => {
  it('reads props from script tag with application/json type', () => {
    const container = document.createElement('div');
    container.innerHTML = '<script type="application/json">{"initial":0}</script>';

    const props = deserializeProps(container);
    expect(props).toEqual({ initial: 0 });
  });

  it('returns empty object when no script tag exists', () => {
    const container = document.createElement('div');
    container.innerHTML = '<span>No script here</span>';

    const props = deserializeProps(container);
    expect(props).toEqual({});
  });

  it('returns empty object when script tag has no content', () => {
    const container = document.createElement('div');
    container.innerHTML = '<script type="application/json"></script>';

    const props = deserializeProps(container);
    expect(props).toEqual({});
  });

  it('returns empty object for invalid JSON', () => {
    const container = document.createElement('div');
    container.innerHTML = '<script type="application/json">{invalid}</script>';

    const props = deserializeProps(container);
    expect(props).toEqual({});
  });

  it('handles nested objects', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<script type="application/json">{"user":{"name":"Alice","age":30}}</script>';

    const props = deserializeProps(container);
    expect(props).toEqual({ user: { name: 'Alice', age: 30 } });
  });

  it('handles arrays in props', () => {
    const container = document.createElement('div');
    container.innerHTML = '<script type="application/json">{"items":[1,2,3]}</script>';

    const props = deserializeProps(container);
    expect(props).toEqual({ items: [1, 2, 3] });
  });
});
