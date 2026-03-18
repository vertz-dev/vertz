import { describe, expect, it } from 'bun:test';
import { configureThemeBase } from '../base';

describe('theme globals', () => {
  it('hides dialog elements without open attribute to prevent SSR flash', () => {
    const { globals } = configureThemeBase();
    expect(globals.css).toContain('dialog:not([open])');
    expect(globals.css).toContain('display: none');
  });
});
