/**
 * OAuthButtons — renders a button for every configured OAuth provider.
 *
 * Vertical stack layout. For custom layout, use useAuth().providers.map().
 *
 * Uses __element/__enterChildren/__exitChildren/__append
 * so that during hydration it claims existing SSR nodes.
 */

import { __append, __element, __enterChildren, __exitChildren } from '../dom/element';
import { useAuth } from './auth-context';
import type { OAuthProviderInfo } from './auth-types';
import { OAuthButton } from './oauth-button';

export interface OAuthButtonsProps {
  /** @internal — injected providers array for testing. Uses useAuth() in production. */
  _providers?: OAuthProviderInfo[];
}

export function OAuthButtons({ _providers }: OAuthButtonsProps = {}): HTMLDivElement {
  const providers = _providers ?? useAuth().providers;

  const container = __element('div');

  __enterChildren(container);

  for (const provider of providers as OAuthProviderInfo[]) {
    const button = OAuthButton({
      provider: provider.id,
      _providers: providers as OAuthProviderInfo[],
    });
    __append(container, button);
  }

  __exitChildren();

  return container;
}
