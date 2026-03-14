/**
 * UserAvatar — renders user avatar from auth context.
 *
 * Reads from useAuth().user unless a `user` prop is provided.
 * Wraps the Avatar primitive with auth-resolved src and alt.
 *
 * When reading from auth context, returns a computed() signal so the
 * rendered avatar updates reactively when the user changes (login/logout).
 */

import { useContext } from '../component/context';
import { computed } from '../runtime/signal';
import type { ReadonlySignal } from '../runtime/signal-types';
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

export function UserAvatar({
  size,
  user,
  fallback,
  class: className,
}: UserAvatarProps): Element | ReadonlySignal<Element> {
  // Static case — user prop provided, no reactivity needed
  if (user) {
    return renderAvatar(user, size, fallback, className);
  }

  // Reactive case — read from auth context
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('UserAvatar must be used within AuthProvider, or pass a `user` prop');
  }

  return computed(() => {
    // ctx.user is auto-unwrapped by wrapSignalProps — reading it tracks the signal dependency
    return renderAvatar(ctx.user, size, fallback, className);
  });
}

function renderAvatar(
  user: User | null,
  size?: 'sm' | 'md' | 'lg',
  fallback?: (() => unknown) | unknown,
  className?: string,
): Element {
  const avatarUrl = user && typeof user.avatarUrl === 'string' ? user.avatarUrl : undefined;
  const alt = getUserDisplayName(user);
  return Avatar({ src: avatarUrl, alt, size, fallback, class: className });
}
