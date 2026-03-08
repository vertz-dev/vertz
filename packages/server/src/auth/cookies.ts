/**
 * Cookie building utilities for auth module
 */

import type { CookieConfig } from './types';

export const DEFAULT_COOKIE_CONFIG: CookieConfig = {
  name: 'vertz.sid',
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60, // 60 seconds (Phase 2: short-lived JWT)
};

export const DEFAULT_REFRESH_COOKIE_NAME = 'vertz.ref';

export function buildSessionCookie(
  value: string,
  cookieConfig: CookieConfig,
  clear = false,
): string {
  const name = cookieConfig.name || 'vertz.sid';
  const maxAge = cookieConfig.maxAge ?? 60;
  const path = cookieConfig.path || '/';
  const sameSite = cookieConfig.sameSite || 'lax';
  const secure = cookieConfig.secure ?? true;

  if (clear) {
    return `${name}=; Path=${path}; HttpOnly${secure ? '; Secure' : ''}; SameSite=${sameSite}; Max-Age=0`;
  }

  return `${name}=${value}; Path=${path}; HttpOnly${secure ? '; Secure' : ''}; SameSite=${sameSite}; Max-Age=${maxAge}`;
}

export function buildRefreshCookie(
  value: string,
  cookieConfig: CookieConfig,
  refreshName: string,
  refreshMaxAge: number,
  clear = false,
): string {
  const name = refreshName;
  const sameSite = cookieConfig.sameSite || 'lax';
  const secure = cookieConfig.secure ?? true;
  const path = '/api/auth/refresh';

  if (clear) {
    return `${name}=; Path=${path}; HttpOnly${secure ? '; Secure' : ''}; SameSite=${sameSite}; Max-Age=0`;
  }

  return `${name}=${value}; Path=${path}; HttpOnly${secure ? '; Secure' : ''}; SameSite=${sameSite}; Max-Age=${refreshMaxAge}`;
}

export function buildMfaChallengeCookie(
  value: string,
  cookieConfig: CookieConfig,
  clear = false,
): string {
  const name = 'vertz.mfa';
  const path = '/api/auth/mfa';
  const sameSite = cookieConfig.sameSite || 'lax';
  const secure = cookieConfig.secure ?? true;

  if (clear) {
    return `${name}=; Path=${path}; HttpOnly${secure ? '; Secure' : ''}; SameSite=${sameSite}; Max-Age=0`;
  }

  return `${name}=${value}; Path=${path}; HttpOnly${secure ? '; Secure' : ''}; SameSite=${sameSite}; Max-Age=300`;
}

export function buildOAuthStateCookie(
  value: string,
  cookieConfig: CookieConfig,
  clear = false,
): string {
  const name = 'vertz.oauth';
  const path = '/api/auth/oauth';
  const sameSite = cookieConfig.sameSite || 'lax';
  const secure = cookieConfig.secure ?? true;

  if (clear) {
    return `${name}=; Path=${path}; HttpOnly${secure ? '; Secure' : ''}; SameSite=${sameSite}; Max-Age=0`;
  }

  return `${name}=${value}; Path=${path}; HttpOnly${secure ? '; Secure' : ''}; SameSite=${sameSite}; Max-Age=300`;
}
