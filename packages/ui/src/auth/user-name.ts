/**
 * UserName — renders user display name from auth context.
 *
 * Reads from useAuth().user unless a `user` prop is provided.
 * Fallback chain: name → email → fallback (default: 'Unknown').
 * Renders a <span> element.
 *
 * When reading from auth context, returns a computed() signal so the
 * rendered name updates reactively when the user changes (login/logout).
 */

import { useContext } from '../component/context';
import { __element, __staticText } from '../dom/element';
import { computed } from '../runtime/signal';
import type { ReadonlySignal } from '../runtime/signal-types';
import { AuthContext } from './auth-context';
import type { User } from './auth-types';
import { getUserDisplayName } from './user-display';

export interface UserNameProps {
  fallback?: string;
  user?: User;
  class?: string;
}

export function UserName({
  fallback = 'Unknown',
  user,
  class: className,
}: UserNameProps): Element | ReadonlySignal<Element> {
  // Static case — user prop provided, no reactivity needed
  if (user) {
    return renderSpan(user, fallback, className);
  }

  // Reactive case — read from auth context
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('UserName must be used within AuthProvider, or pass a `user` prop');
  }

  return computed(() => {
    // ctx.user is auto-unwrapped by wrapSignalProps — reading it tracks the signal dependency
    return renderSpan(ctx.user, fallback, className);
  });
}

function renderSpan(user: User | null, fallback: string, className?: string): Element {
  const span = __element('span');
  if (className) {
    span.setAttribute('class', className);
  }
  span.appendChild(__staticText(getUserDisplayName(user, fallback)));
  return span;
}
