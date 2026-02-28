/**
 * Client-side entry point for Entity Todo.
 *
 * This file is loaded in the browser and mounts the app.
 */

import { mount } from '@vertz/ui';
import { App } from './app';
import { globalStyles } from './styles/global';
import { todoTheme } from './styles/theme';

// HMR self-accept — prevents Bun from triggering full page reloads when
// @vertz/ui dist chunks are included in HMR updates (false positives from
// Bun's file watcher). Component-level Fast Refresh handles actual changes.
import.meta.hot.accept();

mount(App, '#app', {
  theme: todoTheme,
  styles: [globalStyles.css],
});
