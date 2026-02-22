import { watch } from '../component/lifecycle';
import type { Router } from './navigate';
import { RouterContext } from './router-context';

export interface RouterViewProps {
  router: Router;
  fallback?: () => Node;
}

export function RouterView({ router, fallback }: RouterViewProps): HTMLElement {
  const container = document.createElement('div');
  let renderGen = 0;

  watch(
    () => router.current.value,
    (match) => {
      const gen = ++renderGen;
      container.innerHTML = '';

      if (!match) {
        if (fallback) {
          container.appendChild(fallback());
        }
        return;
      }

      RouterContext.Provider(router, () => {
        const result = match.route.component();

        if (result instanceof Promise) {
          result.then((mod) => {
            if (gen !== renderGen) return;
            RouterContext.Provider(router, () => {
              const node = (mod as { default: () => Node }).default();
              container.appendChild(node);
            });
          });
        } else {
          container.appendChild(result);
        }
      });
    },
  );

  return container;
}
