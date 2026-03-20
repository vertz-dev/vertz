import { useRouter } from '@vertz/ui/router';
import { components } from '../manifest';

export function IndexRedirect() {
  const { navigate } = useRouter();
  const first = components[0];
  if (first) {
    navigate({ to: `/components/${first.name}` });
  }
  return <div />;
}
