/**
 * Client-side entry point for the Linear clone.
 *
 * Mounts the app in the browser. SSR renders HTML on the server,
 * and this script hydrates it.
 */

import { mount } from '@vertz/ui';
import { App, styles } from './app';
import { linearTheme } from './styles/theme';

import.meta.hot?.accept();

mount(App, {
  theme: linearTheme,
  styles,
});
