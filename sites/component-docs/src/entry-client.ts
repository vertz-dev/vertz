import { mount } from '@vertz/ui';
import { App, styles } from './app';
import { docsTheme } from './styles/theme';

import.meta.hot.accept();

document.documentElement.dataset.theme = 'dark';

mount(App, {
  theme: docsTheme,
  styles,
});
