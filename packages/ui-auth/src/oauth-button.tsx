import type { OAuthProviderInfo } from '@vertz/ui/auth';
import { getProviderIcon, useAuth } from '@vertz/ui/auth';

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
  provider: string;
  label?: string;
  iconOnly?: boolean;
  /** @internal — injected providers array for testing. Uses useAuth() in production. */
  _providers?: OAuthProviderInfo[];
}

export function OAuthButton({ provider, label, iconOnly, _providers }: OAuthButtonProps) {
  const providers = _providers ?? useAuth().providers;

  const providerInfo = (providers as OAuthProviderInfo[]).find((p) => p.id === provider);

  if (!providerInfo) {
    return <span />;
  }

  const safeAuthUrl = isSafeUrl(providerInfo.authUrl) ? providerInfo.authUrl : '#';

  return (
    <button
      type="button"
      aria-label={iconOnly ? `Continue with ${providerInfo.name}` : undefined}
      onClick={() => {
        window.location.href = safeAuthUrl;
      }}
    >
      <span innerHTML={getProviderIcon(provider, 20)} />
      {!iconOnly && <span>{label ?? `Continue with ${providerInfo.name}`}</span>}
    </button>
  );
}
