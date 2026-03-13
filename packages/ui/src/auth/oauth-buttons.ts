/**
 * OAuthButtons — renders a button for every configured OAuth provider.
 *
 * Vertical stack layout. For custom layout, use useAuth().providers.map().
 */

import { useAuth } from './auth-context';
import type { OAuthProviderInfo } from './auth-types';
import { OAuthButton } from './oauth-button';

export interface OAuthButtonsProps {
  /** @internal — injected providers array for testing. Uses useAuth() in production. */
  _providers?: OAuthProviderInfo[];
}

export function OAuthButtons({ _providers }: OAuthButtonsProps = {}): HTMLElement {
  const providers = _providers ?? useAuth().providers;

  const container = document.createElement('div');

  for (const provider of providers as OAuthProviderInfo[]) {
    const button = OAuthButton({
      provider: provider.id,
      _providers: providers as OAuthProviderInfo[],
    });
    container.appendChild(button);
  }

  return container;
}
