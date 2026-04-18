/**
 * Client-side entry point for Task Manager.
 *
 * Mounts the app in the browser. In SSR mode, the server renders HTML
 * and this script hydrates it. In HMR mode, this is the main entry.
 */

import { mount } from '@vertz/ui';
import { App, styles } from './app';
import { taskManagerTheme } from './styles/theme';

// HMR self-accept — prevents Bun from triggering full page reloads when
// @vertz/ui dist chunks are included in HMR updates (false positives from
// Bun's file watcher). Component-level Fast Refresh handles actual changes.
import.meta.hot?.accept();

mount(App, {
  theme: taskManagerTheme,
  styles,
});
