/**
 * OAuthButton — renders a single OAuth login button for a given provider.
 *
 * Reads provider metadata from useAuth().providers to resolve the auth URL.
 * Uses window.location.href for redirect (OAuth requires full-page navigation).
 */

import { useAuth } from './auth-context';
import type { OAuthProviderInfo } from './auth-types';
import { getProviderIcon } from './provider-icons';

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

export function OAuthButton({
  provider,
  label,
  iconOnly,
  _providers,
}: OAuthButtonProps): HTMLElement {
  const providers = _providers ?? useAuth().providers;

  const providerInfo = (providers as OAuthProviderInfo[]).find((p) => p.id === provider);

  if (!providerInfo) {
    // Provider not configured — render empty span
    return document.createElement('span');
  }

  const button = document.createElement('button');
  button.type = 'button';

  // Icon
  const iconSpan = document.createElement('span');
  iconSpan.innerHTML = getProviderIcon(provider, 20);
  button.appendChild(iconSpan);

  // Label (unless iconOnly)
  if (!iconOnly) {
    const text = label ?? `Continue with ${providerInfo.name}`;
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    button.appendChild(textSpan);
  }

  // Redirect on click
  button.addEventListener('click', () => {
    window.location.href = providerInfo.authUrl;
  });

  return button;
}
