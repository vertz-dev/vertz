import { describe, expect, it } from '@vertz/test';
import type { Plugin } from 'esbuild';
import { createVertzLibraryPlugin } from '../compiler/library-plugin';

describe('createVertzLibraryPlugin', () => {
  it('returns an esbuild Plugin with name and setup', () => {
    const plugin = createVertzLibraryPlugin();
    // Type-level check: plugin must satisfy esbuild Plugin
    const _typeCheck: Plugin = plugin;
    void _typeCheck;
    expect(plugin.name).toBe('vertz-library-plugin');
    expect(typeof plugin.setup).toBe('function');
  });

  it('accepts filter option', () => {
    const plugin = createVertzLibraryPlugin({ filter: /\.ts$/ });
    expect(plugin.name).toBe('vertz-library-plugin');
  });

  it('accepts exclude option', () => {
    const plugin = createVertzLibraryPlugin({ exclude: /node_modules/ });
    expect(plugin.name).toBe('vertz-library-plugin');
  });

  it('accepts target option', () => {
    const plugin = createVertzLibraryPlugin({ target: 'tui' });
    expect(plugin.name).toBe('vertz-library-plugin');
  });
});
