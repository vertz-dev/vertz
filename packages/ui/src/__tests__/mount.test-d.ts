/**
 * Type-level tests for mount() MountOptions.
 *
 * mount() always uses tolerant hydration — there is no hydration mode option.
 * Checked by `tsc --noEmit`, not vitest.
 */

import { mount } from '../mount';

const App = () => document.createElement('div');
const root = document.createElement('div');

// ─── Valid usage ─────────────────────────────────────────────

mount(App, root); // default (no options)
mount(App, root, {}); // empty options
mount(App, root, { theme: undefined }); // valid option

// ─── Invalid: hydration option no longer exists ──────────────

// @ts-expect-error — hydration option has been removed; tolerant is always used
mount(App, root, { hydration: 'tolerant' });

// @ts-expect-error — hydration option has been removed
mount(App, root, { hydration: 'replace' });

// @ts-expect-error — hydration option has been removed
mount(App, root, { hydration: 'strict' });
