/**
 * UserName — renders user display name from auth context.
 *
 * Reads from useAuth().user unless a `user` prop is provided.
 * Fallback chain: name → email → fallback (default: 'Unknown').
 * Renders a <span> element.
 */

import { useContext } from '../component/context';
import { __element, __staticText } from '../dom/element';
import { AuthContext } from './auth-context';
import type { User } from './auth-types';
import { getUserDisplayName } from './user-display';

export interface UserNameProps {
  fallback?: string;
  user?: User;
  class?: string;
}

export function UserName({ fallback = 'Unknown', user, class: className }: UserNameProps): Element {
  const resolvedUser = user ?? resolveAuthUser();
  const span = __element('span');
  if (className) {
    span.setAttribute('class', className);
  }
  span.appendChild(__staticText(getUserDisplayName(resolvedUser, fallback)));
  return span;
}

function resolveAuthUser(): User {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('UserName must be used within AuthProvider, or pass a `user` prop');
  }
  // ctx is wrapped by wrapSignalProps — ctx.user is already auto-unwrapped from the signal
  const user = ctx.user as unknown as User | null;
  // Return a safe empty user if null (getUserDisplayName handles null gracefully)
  return user ?? { id: '', email: '', role: '' };
}
