import { mount } from '@vertz/ui';
import { App, styles } from './app';
import { catalogTheme } from './styles/theme';

import.meta.hot.accept();

mount(App, {
  theme: catalogTheme,
  styles,
});
