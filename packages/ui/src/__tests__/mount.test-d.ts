/**
 * Type-level tests for mount() MountOptions.
 *
 * These tests verify the hydration option type accepts valid values
 * and rejects invalid ones. Checked by `tsc --noEmit`, not vitest.
 */

import { mount } from '../mount';

const App = () => document.createElement('div');
const root = document.createElement('div');

// ─── Valid hydration values ───────────────────────────────────

mount(App, root); // default (no options)
mount(App, root, {}); // empty options
mount(App, root, { hydration: 'replace' });
mount(App, root, { hydration: 'tolerant' });
mount(App, root, { hydration: 'strict' });

// ─── Invalid hydration values ─────────────────────────────────

// @ts-expect-error — 'aggressive' is not a valid hydration mode
mount(App, root, { hydration: 'aggressive' });

// @ts-expect-error — boolean is not a valid hydration value
mount(App, root, { hydration: true });

// @ts-expect-error — number is not a valid hydration value
mount(App, root, { hydration: 0 });
