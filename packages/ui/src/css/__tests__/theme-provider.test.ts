import { describe, expect, it } from 'bun:test';
import { ThemeProvider } from '../theme-provider';

describe('ThemeProvider', () => {
  it('creates a wrapper div with data-theme attribute', () => {
    const el = ThemeProvider({ theme: 'dark', children: [] });
    expect(el).toBeInstanceOf(HTMLDivElement);
    expect(el.getAttribute('data-theme')).toBe('dark');
  });

  it('defaults to light theme when no theme specified', () => {
    const el = ThemeProvider({ children: [] });
    expect(el.getAttribute('data-theme')).toBe('light');
  });

  it('appends child elements', () => {
    const child = document.createElement('span');
    child.textContent = 'hello';

    const el = ThemeProvider({ theme: 'dark', children: [child] });
    expect(el.children.length).toBe(1);
    expect(el.children[0]).toBe(child);
  });

  it('appends multiple children', () => {
    const child1 = document.createElement('p');
    const child2 = document.createElement('div');

    const el = ThemeProvider({ theme: 'dark', children: [child1, child2] });
    expect(el.children.length).toBe(2);
  });

  it('appends string children as text nodes', () => {
    const el = ThemeProvider({ theme: 'dark', children: ['hello world'] });
    expect(el.textContent).toBe('hello world');
  });

  it('accepts a thunk returning a single child', () => {
    const child = document.createElement('div');
    const el = ThemeProvider({ theme: 'dark', children: () => child });
    expect(el.children.length).toBe(1);
    expect(el.children[0]).toBe(child);
  });

  it('accepts a thunk returning multiple children', () => {
    const nav = document.createElement('nav');
    const main = document.createElement('main');
    const el = ThemeProvider({ theme: 'dark', children: () => [nav, main] });
    expect(el.children.length).toBe(2);
    expect(el.children[0]).toBe(nav);
    expect(el.children[1]).toBe(main);
  });

  it('legacy array children still works', () => {
    const child = document.createElement('div');
    const el = ThemeProvider({ theme: 'dark', children: [child] });
    expect(el.children.length).toBe(1);
    expect(el.children[0]).toBe(child);
  });

  it('accepts a thunk returning text', () => {
    const el = ThemeProvider({ theme: 'dark', children: () => 'text' });
    expect(el.textContent).toBe('text');
  });
});
