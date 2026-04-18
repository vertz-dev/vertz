import type { IconProps } from '@vertz/icons';
import { AppleIcon, GithubIcon, TwitterIcon } from '@vertz/icons';
import { token, variants } from '@vertz/ui';
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
function brandedIcon(providerId: string, size: number): HTMLSpanElement {
  const span = document.createElement('span');
  Object.assign(span.style, {
    display: 'inline-flex',
    alignItems: 'center',
    width: `${size}px`,
    height: `${size}px`,
    flexShrink: '0',
  });
  span.innerHTML = getProviderIcon(providerId, size);
  return span;
}

/** Map provider ID → icon component (from @vertz/icons) or null for branded SVGs. */
const ICON_COMPONENTS: Record<string, ((props?: IconProps) => HTMLSpanElement) | undefined> = {
  github: GithubIcon,
  apple: AppleIcon,
  twitter: TwitterIcon,
};

function renderProviderIcon(providerId: string, size: number): HTMLSpanElement {
  const IconComponent = ICON_COMPONENTS[providerId];
  if (IconComponent) {
    return IconComponent({ size });
  }
  // Google, Discord, Microsoft, and unknown providers use branded SVGs
  return brandedIcon(providerId, size);
}

const button = variants({
  base: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: token.spacing[3],
    paddingBlock: token.spacing['2.5'],
    borderRadius: token.radius.lg,
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
    cursor: 'pointer',
    borderWidth: '1px',
    width: '100%',
    transition: 'colors',
  },
  variants: {
    provider: {
      github: {
        backgroundColor: token.color.foreground,
        color: token.color.background,
        borderColor: token.color.foreground,
      },
      google: {
        backgroundColor: token.color.background,
        color: token.color.foreground,
        borderColor: token.color.border,
      },
      discord: {
        backgroundColor: token.color.primary[600],
        color: 'white',
        borderColor: token.color.primary[600],
      },
      apple: {
        backgroundColor: token.color.foreground,
        color: token.color.background,
        borderColor: token.color.foreground,
      },
      microsoft: {
        backgroundColor: token.color.foreground,
        color: token.color.background,
        borderColor: token.color.foreground,
      },
      twitter: {
        backgroundColor: token.color.foreground,
        color: token.color.background,
        borderColor: token.color.foreground,
      },
      default: {
        backgroundColor: token.color.foreground,
        color: token.color.background,
        borderColor: token.color.foreground,
      },
    },
    mode: {
      full: { paddingInline: token.spacing[5] },
      iconOnly: { paddingInline: token.spacing['2.5'] },
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
