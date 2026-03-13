/**
 * OAuthButton — renders a single OAuth login button for a given provider.
 *
 * Reads provider metadata from useAuth().providers to resolve the auth URL.
 * Uses window.location.href for redirect (OAuth requires full-page navigation).
 *
 * Uses __element/__on/__enterChildren/__exitChildren/__append/__staticText
 * so that during hydration it claims existing SSR nodes.
 */

import { __append, __element, __enterChildren, __exitChildren, __staticText } from '../dom/element';
import { __on } from '../dom/events';
import { useAuth } from './auth-context';
import type { OAuthProviderInfo } from './auth-types';
import { getProviderIcon } from './provider-icons';

/** Dangerous URL schemes that must never appear in redirects. */
const DANGEROUS_SCHEMES = ['javascript:', 'data:', 'vbscript:'];

function isSafeUrl(url: string): boolean {
  const normalized = url.replace(/\s/g, '').toLowerCase();
  if (normalized.startsWith('//')) return false;
  for (const scheme of DANGEROUS_SCHEMES) {
    if (normalized.startsWith(scheme)) return false;
  }
  return true;
}

export interface OAuthButtonProps {
  /** Provider ID (e.g., 'github', 'google') */
  provider: string;
  /** Custom label text. Defaults to "Continue with {Name}". */
  label?: string;
  /** Render icon only, no text. */
  iconOnly?: boolean;
  /** @internal — injected providers array for testing. Uses useAuth() in production. */
  _providers?: OAuthProviderInfo[];
}

export function OAuthButton({ provider, label, iconOnly, _providers }: OAuthButtonProps): Element {
  const providers = _providers ?? useAuth().providers;

  const providerInfo = (providers as OAuthProviderInfo[]).find((p) => p.id === provider);

  if (!providerInfo) {
    return __element('span');
  }

  const safeAuthUrl = isSafeUrl(providerInfo.authUrl) ? providerInfo.authUrl : '#';

  const props: Record<string, string> = { type: 'button' };
  if (iconOnly) {
    props['aria-label'] = `Continue with ${providerInfo.name}`;
  }

  const el = __element('button', props);

  __on(el, 'click', () => {
    window.location.href = safeAuthUrl;
  });

  __enterChildren(el);

  // Icon
  const iconSpan = __element('span');
  iconSpan.innerHTML = getProviderIcon(provider, 20);
  __append(el, iconSpan);

  // Label (unless iconOnly)
  if (!iconOnly) {
    const text = label ?? `Continue with ${providerInfo.name}`;
    const textSpan = __element('span');
    __enterChildren(textSpan);
    __append(textSpan, __staticText(text));
    __exitChildren();
    __append(el, textSpan);
  }

  __exitChildren();

  return el;
}
