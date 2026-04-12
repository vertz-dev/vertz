import { describe, expect, it } from '@vertz/test';
import type { OnLoadArgs, OnLoadOptions, OnLoadResult, Plugin, PluginBuild } from 'esbuild';
import { createVertzLibraryPlugin } from '../compiler/library-plugin';

type OnLoadCallback = (args: OnLoadArgs) => Promise<OnLoadResult | null | undefined>;

function createMockBuild(): {
  build: PluginBuild;
  registrations: { options: OnLoadOptions; callback: OnLoadCallback }[];
} {
  const registrations: { options: OnLoadOptions; callback: OnLoadCallback }[] = [];
  // @ts-expect-error — partial mock: only onLoad is needed for plugin setup tests
  const build: PluginBuild = {
    onLoad(options: OnLoadOptions, callback: OnLoadCallback) {
      registrations.push({ options, callback });
    },
  };
  return { build, registrations };
}

describe('createVertzLibraryPlugin', () => {
  it('returns an esbuild Plugin with name and setup', () => {
    const plugin = createVertzLibraryPlugin();
    // Type-level check: plugin must satisfy esbuild Plugin
    const _typeCheck: Plugin = plugin;
    void _typeCheck;
    expect(plugin.name).toBe('vertz-library-plugin');
    expect(typeof plugin.setup).toBe('function');
  });

  it('registers an onLoad handler for .tsx files', () => {
    const plugin = createVertzLibraryPlugin();
    const { build, registrations } = createMockBuild();
    plugin.setup(build);

    expect(registrations).toHaveLength(1);
    expect(registrations[0].options.filter).toEqual(/\.tsx$/);
    expect(registrations[0].options.namespace).toBe('file');
  });

  it('uses custom filter when provided', () => {
    const plugin = createVertzLibraryPlugin({ filter: /\.ts$/ });
    const { build, registrations } = createMockBuild();
    plugin.setup(build);

    expect(registrations[0].options.filter).toEqual(/\.ts$/);
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
