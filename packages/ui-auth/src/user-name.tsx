import { useContext } from '@vertz/ui';
import type { User } from '@vertz/ui/auth';
import { AuthContext, getUserDisplayName } from '@vertz/ui/auth';
import type { JSX } from '@vertz/ui/jsx-runtime';

export interface UserNameProps {
  fallback?: string;
  user?: User;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export function UserName({
  fallback = 'Unknown',
  user,
  className,
  class: classProp,
}: UserNameProps): JSX.Element {
  const effectiveClass = className ?? classProp;
  if (user) {
    return <span className={effectiveClass}>{getUserDisplayName(user, fallback)}</span>;
  }

  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('UserName must be used within AuthProvider, or pass a `user` prop');
  }

  return <span className={effectiveClass}>{getUserDisplayName(ctx.user, fallback)}</span>;
}
