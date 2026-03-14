import { computed, useContext } from '@vertz/ui';
import type { User } from '@vertz/ui/auth';
import { AuthContext, getUserDisplayName } from '@vertz/ui/auth';

export interface UserNameProps {
  fallback?: string;
  user?: User;
  class?: string;
}

export function UserName({ fallback = 'Unknown', user, class: className }: UserNameProps) {
  if (user) {
    return <span class={className}>{getUserDisplayName(user, fallback)}</span>;
  }

  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('UserName must be used within AuthProvider, or pass a `user` prop');
  }

  return computed(() => {
    return <span class={className}>{getUserDisplayName(ctx.user, fallback)}</span>;
  });
}
