import { describe, expect, it } from 'bun:test';
import type { OAuthProviderInfo } from '../auth-types';
import { OAuthButton } from '../oauth-button';
import { OAuthButtons } from '../oauth-buttons';

const providers: OAuthProviderInfo[] = [
  { id: 'github', name: 'GitHub', authUrl: '/api/auth/oauth/github' },
  { id: 'google', name: 'Google', authUrl: '/api/auth/oauth/google' },
];

describe('OAuthButton', () => {
  it('renders a button with "Continue with" text for known provider', () => {
    const el = OAuthButton({ provider: 'github', _providers: providers });
    expect(el).toBeDefined();
    expect(el.tagName).toBe('BUTTON');
    expect(el.textContent).toContain('Continue with GitHub');
  });

  it('renders the provider icon', () => {
    const el = OAuthButton({ provider: 'github', _providers: providers });
    expect(el.innerHTML).toContain('<svg');
  });

  it('clicking the button sets window.location.href to authUrl', () => {
    const origLocation = globalThis.window?.location;
    const locationMock = { href: '' };
    if (typeof globalThis.window === 'undefined') {
      (globalThis as Record<string, unknown>).window = { location: locationMock };
    } else {
      Object.defineProperty(window, 'location', { value: locationMock, writable: true });
    }

    const el = OAuthButton({ provider: 'github', _providers: providers });
    (el as HTMLButtonElement).click();

    expect(locationMock.href).toBe('/api/auth/oauth/github');

    if (origLocation) {
      Object.defineProperty(window, 'location', { value: origLocation, writable: true });
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it('renders empty span when provider is not in list', () => {
    const el = OAuthButton({ provider: 'gitlab', _providers: providers });
    expect(el.tagName).toBe('SPAN');
    expect(el.textContent).toBe('');
  });

  it('renders custom label when provided', () => {
    const el = OAuthButton({
      provider: 'github',
      label: 'Sign in with GitHub',
      _providers: providers,
    });
    expect(el.textContent).toContain('Sign in with GitHub');
  });

  it('renders icon only when iconOnly is true', () => {
    const el = OAuthButton({ provider: 'github', iconOnly: true, _providers: providers });
    expect(el.innerHTML).toContain('<svg');
    expect(el.textContent).not.toContain('Continue');
  });

  it('sets aria-label when iconOnly is true', () => {
    const el = OAuthButton({ provider: 'github', iconOnly: true, _providers: providers });
    expect(el.getAttribute('aria-label')).toBe('Continue with GitHub');
  });

  it('sanitizes dangerous authUrl schemes', () => {
    const origLocation = globalThis.window?.location;
    const locationMock = { href: '' };
    if (typeof globalThis.window === 'undefined') {
      (globalThis as Record<string, unknown>).window = { location: locationMock };
    } else {
      Object.defineProperty(window, 'location', { value: locationMock, writable: true });
    }

    const dangerousProviders: OAuthProviderInfo[] = [
      { id: 'evil', name: 'Evil', authUrl: 'javascript:alert(1)' },
    ];

    const el = OAuthButton({ provider: 'evil', _providers: dangerousProviders });
    (el as HTMLButtonElement).click();

    // Should redirect to '#' instead of the dangerous URL
    expect(locationMock.href).toBe('#');

    if (origLocation) {
      Object.defineProperty(window, 'location', { value: origLocation, writable: true });
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  });
});

describe('OAuthButtons', () => {
  it('renders a button for each configured provider', () => {
    const el = OAuthButtons({ _providers: providers });
    const buttons = el.querySelectorAll('button');
    expect(buttons.length).toBe(2);
  });

  it('renders nothing when no providers configured', () => {
    const el = OAuthButtons({ _providers: [] });
    const buttons = el.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });
});
