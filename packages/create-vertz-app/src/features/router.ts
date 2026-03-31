import {
  helloWorldAboutPageTemplate,
  helloWorldHomePageTemplate,
  helloWorldNavBarTemplate,
  helloWorldRouterTemplate,
} from '../templates/index.js';
import type { Feature, FeatureContext } from './types.js';

export const routerFeature: Feature = {
  name: 'router',
  dependencies: ['ui'],

  files(ctx: FeatureContext) {
    const files = [
      { path: 'src/router.tsx', content: helloWorldRouterTemplate() },
      { path: 'src/pages/about.tsx', content: helloWorldAboutPageTemplate() },
      { path: 'src/components/nav-bar.tsx', content: helloWorldNavBarTemplate() },
    ];

    // Only generate home page if client feature doesn't provide its own
    if (!ctx.hasFeature('client')) {
      files.push({ path: 'src/pages/home.tsx', content: helloWorldHomePageTemplate() });
    }

    return files;
  },
};
