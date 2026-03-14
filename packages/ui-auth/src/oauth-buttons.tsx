import type { OAuthProviderInfo } from '@vertz/ui/auth';
import { useAuth } from '@vertz/ui/auth';
import type { JSX } from '@vertz/ui/jsx-runtime';
import { OAuthButton } from './oauth-button';

export interface OAuthButtonsProps {
  /** @internal — injected providers array for testing. Uses useAuth() in production. */
  _providers?: OAuthProviderInfo[];
}

export function OAuthButtons({ _providers }: OAuthButtonsProps): JSX.Element {
  const providers = _providers ?? useAuth().providers;

  return (
    <div>
      {(providers as OAuthProviderInfo[]).map((p) => (
        <OAuthButton provider={p.id} _providers={providers as OAuthProviderInfo[]} />
      ))}
    </div>
  );
}
