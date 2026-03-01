/**
 * Client-side entry point for Entity Todo.
 *
 * This file is loaded in the browser and mounts the app.
 */

import { mount } from '@vertz/ui';
import { App, styles } from './app';
import { todoTheme } from './styles/theme';

// HMR self-accept — prevents Bun from triggering full page reloads when
// @vertz/ui dist chunks are included in HMR updates (false positives from
// Bun's file watcher). Component-level Fast Refresh handles actual changes.
import.meta.hot.accept();

// WORKAROUND: Clear SSR content before mounting to force CSR.
//
// Hydration is broken for reactive inserts (V$) that contain component trees
// rendered via JSX runtime callbacks (e.g., queryMatch data branch). The
// reactive insert claims the <span> wrapper but doesn't scope the hydration
// cursor into its children. Components inside the callback (TodoItem) try to
// claim SSR elements but the cursor is exhausted — they create detached
// elements instead. Event handlers end up on invisible nodes.
//
// The query picks up SSR data synchronously from __VERTZ_SSR_DATA__, so the
// CSR render produces the same content with minimal flash.
//
// TODO: Fix V$ hydration cursor scoping in @vertz/ui
const root = document.querySelector('#app');
if (root) root.textContent = '';

mount(App, '#app', {
  theme: todoTheme,
  styles,
});
