import { createRouter, defineRoutes } from '@vertz/ui';
import { componentRegistry } from './demos';
import { DemoPage } from './pages/demo';
import { HomePage } from './pages/home';

function buildRoutes() {
  const map: Record<string, { component: () => Node }> = {
    '/': { component: () => HomePage() },
  };

  for (const entry of componentRegistry) {
    map[`/${entry.slug}`] = {
      component: () => DemoPage(entry),
    };
  }

  return defineRoutes(map);
}

export const routes = buildRoutes();

export const appRouter = createRouter(routes);
