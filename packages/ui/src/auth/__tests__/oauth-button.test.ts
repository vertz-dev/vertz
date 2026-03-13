import { describe, expect, it } from 'bun:test';
import type { OAuthProviderInfo } from '../auth-types';
import { OAuthButton } from '../oauth-button';
import { OAuthButtons } from '../oauth-buttons';

function mockProviders(providers: OAuthProviderInfo[]) {
  return providers;
}

describe('OAuthButton', () => {
  it('renders a button with "Continue with" text for known provider', () => {
    const providers = mockProviders([
      { id: 'github', name: 'GitHub', authUrl: '/api/auth/oauth/github' },
    ]);

    const el = OAuthButton({ provider: 'github', _providers: providers });
    expect(el).toBeDefined();
    expect(el.tagName).toBe('BUTTON');
    expect(el.textContent).toContain('Continue with GitHub');
  });

  it('renders the provider icon', () => {
    const providers = mockProviders([
      { id: 'github', name: 'GitHub', authUrl: '/api/auth/oauth/github' },
    ]);

    const el = OAuthButton({ provider: 'github', _providers: providers });
    expect(el.innerHTML).toContain('<svg');
  });

  it('clicking the button sets window.location.href to authUrl', () => {
    const providers = mockProviders([
      { id: 'github', name: 'GitHub', authUrl: '/api/auth/oauth/github' },
    ]);

    // Mock window.location
    const origLocation = globalThis.window?.location;
    const locationMock = { href: '' };
    if (typeof globalThis.window === 'undefined') {
      (globalThis as Record<string, unknown>).window = { location: locationMock };
    } else {
      Object.defineProperty(window, 'location', { value: locationMock, writable: true });
    }

    const el = OAuthButton({ provider: 'github', _providers: providers });
    el.click();

    expect(locationMock.href).toBe('/api/auth/oauth/github');

    // Restore
    if (origLocation) {
      Object.defineProperty(window, 'location', { value: origLocation, writable: true });
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it('renders nothing when provider is not in list', () => {
    const providers = mockProviders([
      { id: 'github', name: 'GitHub', authUrl: '/api/auth/oauth/github' },
    ]);

    const el = OAuthButton({ provider: 'gitlab', _providers: providers });
    // Should return an empty element or comment
    expect(el.textContent).toBe('');
  });

  it('renders custom label when provided', () => {
    const providers = mockProviders([
      { id: 'github', name: 'GitHub', authUrl: '/api/auth/oauth/github' },
    ]);

    const el = OAuthButton({
      provider: 'github',
      label: 'Sign in with GitHub',
      _providers: providers,
    });
    expect(el.textContent).toContain('Sign in with GitHub');
  });

  it('renders icon only when iconOnly is true', () => {
    const providers = mockProviders([
      { id: 'github', name: 'GitHub', authUrl: '/api/auth/oauth/github' },
    ]);

    const el = OAuthButton({ provider: 'github', iconOnly: true, _providers: providers });
    expect(el.innerHTML).toContain('<svg');
    expect(el.textContent).not.toContain('Continue');
  });
});

describe('OAuthButtons', () => {
  it('renders a button for each configured provider', () => {
    const providers = mockProviders([
      { id: 'github', name: 'GitHub', authUrl: '/api/auth/oauth/github' },
      { id: 'google', name: 'Google', authUrl: '/api/auth/oauth/google' },
    ]);

    const el = OAuthButtons({ _providers: providers });
    const buttons = el.querySelectorAll('button');
    expect(buttons.length).toBe(2);
  });

  it('renders nothing when no providers configured', () => {
    const providers = mockProviders([]);

    const el = OAuthButtons({ _providers: providers });
    const buttons = el.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });
});
