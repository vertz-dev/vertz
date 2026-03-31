import { clientTemplate, homePageTemplate } from '../templates/index.js';
import type { Feature } from './types.js';

export const clientFeature: Feature = {
  name: 'client',
  dependencies: ['api', 'ui'],

  files() {
    return [
      { path: 'src/client.ts', content: clientTemplate() },
      { path: 'src/pages/home.tsx', content: homePageTemplate() },
    ];
  },

  packages: {
    imports: {
      '#generated': './.vertz/generated/client.ts',
      '#generated/types': './.vertz/generated/types/index.ts',
    },
  },
};
