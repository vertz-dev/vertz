import type { IconProps } from '@vertz/icons';
import { AppleIcon, GithubIcon, TwitterIcon } from '@vertz/icons';
import { variants } from '@vertz/ui';
import type { OAuthProviderInfo } from '@vertz/ui/auth';
import { getProviderIcon, useAuth } from '@vertz/ui/auth';
import type { JSX } from '@vertz/ui/jsx-runtime';

const DANGEROUS_SCHEMES = ['javascript:', 'data:', 'vbscript:'];

function isSafeUrl(url: string): boolean {
  const normalized = url.replace(/\s/g, '').toLowerCase();
  if (normalized.startsWith('//')) return false;
  for (const scheme of DANGEROUS_SCHEMES) {
    if (normalized.startsWith(scheme)) return false;
  }
  return true;
}

/**
 * For providers not in @vertz/icons (Google, Discord, Microsoft),
 * render the branded SVG from provider-icons.ts the same way @vertz/icons does.
 */
function BrandedIcon({ providerId, size }: { providerId: string; size: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: '0',
      }}
      innerHTML={getProviderIcon(providerId, size)}
    />
  );
}

/** Map provider ID → icon component (from @vertz/icons) or null for branded SVGs. */
const ICON_COMPONENTS: Record<string, ((props?: IconProps) => HTMLSpanElement) | undefined> = {
  github: GithubIcon,
  apple: AppleIcon,
  twitter: TwitterIcon,
};

function renderProviderIcon(providerId: string, size: number) {
  const IconComponent = ICON_COMPONENTS[providerId];
  if (IconComponent) {
    return IconComponent({ size });
  }
  return <BrandedIcon providerId={providerId} size={size} />;
}

const button = variants({
  base: [
    'flex',
    'items:center',
    'justify:center',
    'gap:3',
    'py:2.5',
    'rounded:lg',
    'text:sm',
    'font:medium',
    'cursor:pointer',
    'border:1',
    'w:full',
    'transition:colors',
  ],
  variants: {
    provider: {
      github: ['bg:foreground', 'text:background', 'border:foreground'],
      google: ['bg:background', 'text:foreground', 'border:border'],
      discord: ['bg:primary.600', 'text:white', 'border:primary.600'],
      apple: ['bg:foreground', 'text:background', 'border:foreground'],
      microsoft: ['bg:foreground', 'text:background', 'border:foreground'],
      twitter: ['bg:foreground', 'text:background', 'border:foreground'],
      default: ['bg:foreground', 'text:background', 'border:foreground'],
    },
    mode: {
      full: ['px:5'],
      iconOnly: ['px:2.5'],
    },
  },
  defaultVariants: { provider: 'default', mode: 'full' },
});

/** Known provider keys for variant lookup. */
const KNOWN_PROVIDERS = new Set(['github', 'google', 'discord', 'apple', 'microsoft', 'twitter']);

type ProviderVariant =
  | 'github'
  | 'google'
  | 'discord'
  | 'apple'
  | 'microsoft'
  | 'twitter'
  | 'default';

export interface OAuthButtonProps {
  provider: string;
  label?: string;
  iconOnly?: boolean;
  /** @internal — injected providers array for testing. Uses useAuth() in production. */
  _providers?: OAuthProviderInfo[];
}

export function OAuthButton({
  provider,
  label,
  iconOnly,
  _providers,
}: OAuthButtonProps): JSX.Element {
  const providers = _providers ?? useAuth().providers;

  const providerInfo = (providers as OAuthProviderInfo[]).find((p) => p.id === provider);

  const safeAuthUrl = providerInfo
    ? isSafeUrl(providerInfo.authUrl)
      ? providerInfo.authUrl
      : '#'
    : '#';

  const providerVariant: ProviderVariant = KNOWN_PROVIDERS.has(provider)
    ? (provider as ProviderVariant)
    : 'default';

  if (!providerInfo) {
    return (<span />) as JSX.Element;
  }

  return (
    <button
      type="button"
      className={button({ provider: providerVariant, mode: iconOnly ? 'iconOnly' : 'full' })}
      aria-label={iconOnly ? `Continue with ${providerInfo.name}` : undefined}
      onClick={() => {
        window.location.href = safeAuthUrl;
      }}
    >
      {renderProviderIcon(provider, 20)}
      {!iconOnly && <span>{label ?? `Continue with ${providerInfo.name}`}</span>}
    </button>
  );
}
