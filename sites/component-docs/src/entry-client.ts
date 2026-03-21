import { mount } from '@vertz/ui';
import { App, getInitialTheme, styles } from './app';
import { docsTheme } from './styles/theme';

import.meta.hot.accept();

document.documentElement.dataset.theme = getInitialTheme();

mount(App, {
  theme: docsTheme,
  styles,
});
