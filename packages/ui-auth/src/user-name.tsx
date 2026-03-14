import { useContext } from '@vertz/ui';
import type { User } from '@vertz/ui/auth';
import { AuthContext, getUserDisplayName } from '@vertz/ui/auth';
import type { JSX } from '@vertz/ui/jsx-runtime';

export interface UserNameProps {
  fallback?: string;
  user?: User;
  class?: string;
}

export function UserName({
  fallback = 'Unknown',
  user,
  class: className,
}: UserNameProps): JSX.Element {
  if (user) {
    return <span class={className}>{getUserDisplayName(user, fallback)}</span>;
  }

  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('UserName must be used within AuthProvider, or pass a `user` prop');
  }

  return <span class={className}>{getUserDisplayName(ctx.user, fallback)}</span>;
}
