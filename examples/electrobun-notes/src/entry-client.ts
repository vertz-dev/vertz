import { mount } from '@vertz/ui';
import { App, styles } from './app';
import { notesTheme } from './styles/theme';

import.meta.hot.accept();

mount(App, {
  theme: notesTheme,
  styles,
});
