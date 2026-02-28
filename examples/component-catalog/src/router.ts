import { computed, createLink, createRouter, defineRoutes } from '@vertz/ui';
import type { ComponentEntry } from './demos';
import { componentRegistry } from './demos';
import { DemoPage } from './pages/demo';
import { HomePage } from './pages/home';

function buildRoutes() {
  const map: Record<string, { component: () => HTMLElement }> = {
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

const initialPath =
  typeof window !== 'undefined' && window.location
    ? window.location.pathname
    : (globalThis as any).__SSR_URL__ || '/';

export const appRouter = createRouter(routes, initialPath);

const currentPath = computed(() => {
  const match = appRouter.current.value;
  return match ? window.location.pathname : initialPath;
});

export const Link = createLink(currentPath, (url: string) => {
  appRouter.navigate(url as Parameters<typeof appRouter.navigate>[0]);
});
