import { useContext } from '@vertz/ui';
import type { User } from '@vertz/ui/auth';
import { AuthContext, getUserDisplayName } from '@vertz/ui/auth';
import { __child } from '@vertz/ui/internals';

export interface UserNameProps {
  fallback?: string;
  user?: User;
  class?: string;
}

export function UserName({
  fallback = 'Unknown',
  user,
  class: className,
}: UserNameProps): HTMLElement {
  if (user) {
    return <span class={className}>{getUserDisplayName(user, fallback)}</span>;
  }

  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('UserName must be used within AuthProvider, or pass a `user` prop');
  }

  return __child(() => {
    return <span class={className}>{getUserDisplayName(ctx.user, fallback)}</span>;
  });
}
