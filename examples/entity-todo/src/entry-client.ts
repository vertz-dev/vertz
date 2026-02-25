/**
 * Client-side entry point for Entity Todo.
 *
 * This file is loaded in the browser and mounts the React app.
 */

import { mount } from '@vertz/ui';
import { App } from './app';
import { globalStyles } from './styles/global';
import { todoTheme } from './styles/theme';

mount(App, '#app', {
  theme: todoTheme,
  styles: [globalStyles.css],
});

console.log('Entity Todo app mounted');
