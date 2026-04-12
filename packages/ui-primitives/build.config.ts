import { existsSync, readdirSync } from 'node:fs';
import { defineConfig } from '@vertz/build';
import { createVertzLibraryPlugin } from '@vertz/ui-server';
import { createFixBarrelReExportsHook, createStripBareChunkImportsHook } from './src/build-hooks';

// Auto-discover component entries: each src/<component>/<component>.ts(x) file
// and composed variants src/<component>/<component>-composed.tsx.
const componentDirs = readdirSync('src', { withFileTypes: true }).filter(
  (d) => d.isDirectory() && d.name !== '__tests__' && d.name !== 'utils' && d.name !== 'composed',
);

const componentEntries = componentDirs.flatMap((d) => {
  const tsx = `src/${d.name}/${d.name}.tsx`;
  const ts = `src/${d.name}/${d.name}.ts`;
  if (existsSync(tsx)) return [tsx];
  if (existsSync(ts)) return [ts];
  return [];
});

const composedEntries = componentDirs.flatMap((d) => {
  const composed = `src/${d.name}/${d.name}-composed.tsx`;
  return existsSync(composed) ? [composed] : [];
});

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/utils.ts',
    'src/composed/with-styles.ts',
    'src/dialog/dialog-stack-parts.tsx',
    ...componentEntries,
    ...composedEntries,
  ],
  dts: true,
  plugins: [createVertzLibraryPlugin()],
  onSuccess: [createFixBarrelReExportsHook(), createStripBareChunkImportsHook()],
  external: ['@vertz/ui', '@vertz/ui/internals'],
});
