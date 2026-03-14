import type { User } from './auth-types';

/**
 * Get a display name for a user with a fallback chain.
 * Chain: user.name (if string & non-empty) → user.email → fallback (default: 'Unknown')
 */
export function getUserDisplayName(user: User | null | undefined, fallback = 'Unknown'): string {
  if (!user) return fallback;
  const name = user.name;
  if (typeof name === 'string' && name.trim().length > 0) return name;
  if (user.email) return user.email;
  return fallback;
}

/**
 * Get initials from a user's name or email (max 2 characters).
 * Chain: first + last word initials from name → first char of email → '?'
 */
export function getUserInitials(user: User | null | undefined): string {
  if (!user) return '?';
  const name = user.name;
  if (typeof name === 'string' && name.trim().length > 0) {
    const words = name.trim().split(/\s+/);
    const first = words[0] ?? '';
    const last = words[words.length - 1] ?? '';
    if (words.length === 1 || !last) return first.charAt(0).toUpperCase() || '?';
    return (first.charAt(0) + last.charAt(0)).toUpperCase();
  }
  if (user.email && user.email.length > 0) return user.email.charAt(0).toUpperCase();
  return '?';
}
