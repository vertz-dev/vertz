import { defineConfig } from '../index';

// Valid configs
defineConfig({ entry: ['src/index.ts'] });
defineConfig({ entry: ['src/index.ts'], dts: true });
defineConfig({ entry: ['src/index.ts'], target: 'browser' });
defineConfig({ entry: ['src/index.ts'], target: 'node' });
defineConfig({ entry: ['src/index.ts'], target: 'neutral' });
defineConfig({ entry: ['src/index.ts'], banner: '#!/usr/bin/env node' });
defineConfig({ entry: ['src/index.ts'], banner: { js: '/* license */' } });
defineConfig([{ entry: ['src/index.ts'] }, { entry: ['src/cli.ts'] }]);

// @ts-expect-error — entry must be string[]
defineConfig({ entry: 123 });

// @ts-expect-error — target must be 'browser' | 'node' | 'neutral'
defineConfig({ entry: ['src/index.ts'], target: 'deno' });

// @ts-expect-error — entry is required
defineConfig({});

// @ts-expect-error — dts must be boolean, not string
defineConfig({ entry: ['src/index.ts'], dts: 'yes' });
