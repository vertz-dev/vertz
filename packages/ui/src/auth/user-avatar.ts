/**
 * UserAvatar — renders user avatar from auth context.
 *
 * Reads from useAuth().user unless a `user` prop is provided.
 * Wraps the Avatar primitive with auth-resolved src and alt.
 */

import { useContext } from '../component/context';
import { AuthContext } from './auth-context';
import type { User } from './auth-types';
import { Avatar } from './avatar';
import { getUserDisplayName } from './user-display';

export interface UserAvatarProps {
  size?: 'sm' | 'md' | 'lg';
  user?: User;
  fallback?: (() => unknown) | unknown;
  class?: string;
}

export function UserAvatar({ size, user, fallback, class: className }: UserAvatarProps): Element {
  const resolvedUser = user ?? resolveAuthUser();

  const avatarUrl = typeof resolvedUser.avatarUrl === 'string' ? resolvedUser.avatarUrl : undefined;
  const alt = getUserDisplayName(resolvedUser);

  return Avatar({ src: avatarUrl, alt, size, fallback, class: className });
}

function resolveAuthUser(): User {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('UserAvatar must be used within AuthProvider, or pass a `user` prop');
  }
  // ctx is wrapped by wrapSignalProps — ctx.user is already auto-unwrapped from the signal
  const user = ctx.user as unknown as User | null;
  return user ?? { id: '', email: '', role: '' };
}
