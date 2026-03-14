import { useContext } from '@vertz/ui';
import type { User } from '@vertz/ui/auth';
import { AuthContext, getUserDisplayName } from '@vertz/ui/auth';
import { __child } from '@vertz/ui/internals';
import { Avatar } from './avatar';

export interface UserAvatarProps {
  size?: 'sm' | 'md' | 'lg';
  user?: User;
  fallback?: (() => unknown) | unknown;
  class?: string;
}

export function UserAvatar({
  size,
  user,
  fallback,
  class: className,
}: UserAvatarProps): HTMLElement {
  if (user) {
    const avatarUrl = typeof user.avatarUrl === 'string' ? user.avatarUrl : undefined;
    return (
      <Avatar
        src={avatarUrl}
        alt={getUserDisplayName(user)}
        size={size}
        fallback={fallback}
        class={className}
      />
    );
  }

  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('UserAvatar must be used within AuthProvider, or pass a `user` prop');
  }

  return __child(() => {
    const avatarUrl =
      ctx.user && typeof ctx.user.avatarUrl === 'string' ? ctx.user.avatarUrl : undefined;
    const alt = getUserDisplayName(ctx.user);
    return <Avatar src={avatarUrl} alt={alt} size={size} fallback={fallback} class={className} />;
  });
}
