import { useRouter } from '@vertz/ui/router';
import { components } from '../manifest';

export function IndexRedirect() {
  const { navigate } = useRouter();
  const first = components[0];
  if (first) {
    // Defer navigation to avoid re-entrant domEffect during hydration.
    // Synchronous navigate() would trigger a re-render while __append
    // is still suppressed by hydration mode, producing a blank page.
    queueMicrotask(() => navigate({ to: `/components/${first.name}`, replace: true }));
  }
  return <div />;
}
