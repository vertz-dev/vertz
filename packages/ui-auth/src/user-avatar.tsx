import { useContext } from '@vertz/ui';
import type { User } from '@vertz/ui/auth';
import { AuthContext, getUserDisplayName } from '@vertz/ui/auth';
import type { JSX } from '@vertz/ui/jsx-runtime';
import { Avatar } from './avatar';

export interface UserAvatarProps {
  size?: 'sm' | 'md' | 'lg';
  user?: User;
  fallback?: (() => unknown) | unknown;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export function UserAvatar({
  size,
  user,
  fallback,
  className,
  class: classProp,
}: UserAvatarProps): JSX.Element {
  const effectiveClass = className ?? classProp;
  if (user) {
    const src = typeof user.avatarUrl === 'string' ? user.avatarUrl : undefined;
    return (
      <Avatar
        src={src}
        alt={getUserDisplayName(user)}
        size={size}
        fallback={fallback}
        className={effectiveClass}
      />
    );
  }

  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('UserAvatar must be used within AuthProvider, or pass a `user` prop');
  }

  const avatarUrl =
    ctx.user && typeof ctx.user.avatarUrl === 'string' ? ctx.user.avatarUrl : undefined;
  const alt = getUserDisplayName(ctx.user);

  return (
    <Avatar src={avatarUrl} alt={alt} size={size} fallback={fallback} className={effectiveClass} />
  );
}
