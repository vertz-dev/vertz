import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { GithubProfile } from '../providers/github';
import { github } from '../providers/github';

describe('github provider', () => {
  const config = {
    clientId: 'github-client-id',
    clientSecret: 'github-client-secret',
    redirectUrl: 'http://localhost:3000/api/auth/oauth/github/callback',
  };

  it('has trustEmail: false', () => {
    const provider = github(config);
    expect(provider.trustEmail).toBe(false);
  });

  it('getAuthorizationUrl includes client_id, redirect_uri, state, scope', () => {
    const provider = github(config);
    const url = provider.getAuthorizationUrl('test-state');
    const parsed = new URL(url);
    expect(parsed.hostname).toBe('github.com');
    expect(parsed.searchParams.get('client_id')).toBe('github-client-id');
    expect(parsed.searchParams.get('redirect_uri')).toBe(config.redirectUrl);
    expect(parsed.searchParams.get('state')).toBe('test-state');
    expect(parsed.searchParams.get('scope')).toContain('read:user');
  });

  it('getAuthorizationUrl does NOT include code_challenge (GitHub no PKCE)', () => {
    const provider = github(config);
    const url = provider.getAuthorizationUrl('state', 'challenge');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('code_challenge')).toBeNull();
  });

  describe('exchangeCode', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('sends POST with Accept: application/json', async () => {
      let capturedHeaders: Record<string, string> = {};
      globalThis.fetch = async (_input, init) => {
        const headers = init?.headers as Record<string, string>;
        capturedHeaders = headers;
        return new Response(
          JSON.stringify({
            access_token: 'github-access',
            token_type: 'bearer',
          }),
        );
      };

      const provider = github(config);
      const tokens = await provider.exchangeCode('auth-code');
      expect(tokens.accessToken).toBe('github-access');
      expect(capturedHeaders.Accept).toBe('application/json');
    });
  });

  describe('getUserInfo', () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('fetches /user and /user/emails endpoints', async () => {
      const fetchedUrls: string[] = [];
      globalThis.fetch = async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        fetchedUrls.push(url);
        if (url.includes('/user/emails')) {
          return new Response(
            JSON.stringify([
              { email: 'primary@github.com', primary: true, verified: true },
              { email: 'secondary@github.com', primary: false, verified: true },
            ]),
          );
        }
        return new Response(
          JSON.stringify({
            id: 12345,
            login: 'octocat',
            name: 'Octocat',
            avatar_url: 'https://github.com/avatar.jpg',
          }),
        );
      };

      const provider = github(config);
      const userInfo = await provider.getUserInfo('github-token');
      expect(fetchedUrls).toContain('https://api.github.com/user');
      expect(fetchedUrls).toContain('https://api.github.com/user/emails');
      expect(userInfo.providerId).toBe('12345');
      expect(userInfo.email).toBe('primary@github.com');
      expect(userInfo.emailVerified).toBe(true);
      expect(userInfo.raw.name).toBe('Octocat');
    });

    it('includes raw with the full GitHub API response', async () => {
      const githubUserData = {
        id: 12345,
        login: 'octocat',
        node_id: 'MDQ6VXNlcjEyMzQ1',
        avatar_url: 'https://github.com/avatar.jpg',
        name: 'Octocat',
        company: '@github',
        blog: 'https://github.com/blog',
        location: 'San Francisco',
        email: null,
        bio: 'Open source enthusiast',
        twitter_username: 'octocat',
        public_repos: 42,
        public_gists: 10,
        followers: 1000,
        following: 50,
        created_at: '2012-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      globalThis.fetch = async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('/user/emails')) {
          return new Response(
            JSON.stringify([{ email: 'octo@github.com', primary: true, verified: true }]),
          );
        }
        return new Response(JSON.stringify(githubUserData));
      };

      const provider = github(config);
      const userInfo = await provider.getUserInfo('github-token');

      expect(userInfo.raw).toBeDefined();
      expect(userInfo.raw.login).toBe('octocat');
      expect(userInfo.raw.bio).toBe('Open source enthusiast');
      expect(userInfo.raw.company).toBe('@github');
      expect(userInfo.raw.public_repos).toBe(42);
    });

    it('includes raw with the full GitHub API response', async () => {
      const githubUserData = {
        id: 12345,
        login: 'octocat',
        node_id: 'MDQ6VXNlcjEyMzQ1',
        avatar_url: 'https://github.com/avatar.jpg',
        name: 'Octocat',
        company: '@github',
        blog: 'https://github.com/blog',
        location: 'San Francisco',
        email: null,
        bio: 'Open source enthusiast',
        twitter_username: 'octocat',
        public_repos: 42,
        public_gists: 10,
        followers: 1000,
        following: 50,
        created_at: '2012-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };
      globalThis.fetch = async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('/user/emails')) {
          return new Response(
            JSON.stringify([{ email: 'octo@github.com', primary: true, verified: true }]),
          );
        }
        return new Response(JSON.stringify(githubUserData));
      };

      const provider = github(config);
      const userInfo = await provider.getUserInfo('github-token');

      expect(userInfo.raw).toBeDefined();
      expect(userInfo.raw.login).toBe('octocat');
      expect(userInfo.raw.bio).toBe('Open source enthusiast');
      expect(userInfo.raw.company).toBe('@github');
      expect(userInfo.raw.public_repos).toBe(42);
    });

    it('uses primary verified email', async () => {
      globalThis.fetch = async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('/user/emails')) {
          return new Response(
            JSON.stringify([
              { email: 'not-primary@github.com', primary: false, verified: true },
              { email: 'primary@github.com', primary: true, verified: true },
            ]),
          );
        }
        return new Response(JSON.stringify({ id: 1, login: 'user', name: 'User' }));
      };

      const provider = github(config);
      const userInfo = await provider.getUserInfo('token');
      expect(userInfo.email).toBe('primary@github.com');
      expect(userInfo.emailVerified).toBe(true);
    });
  });

  describe('mapProfile', () => {
    it('has a default mapProfile that returns name and avatarUrl', () => {
      const provider = github(config);
      const result = provider.mapProfile({
        name: 'Octocat',
        login: 'octocat',
        avatar_url: 'https://github.com/avatar.jpg',
      });
      expect(result).toEqual({
        name: 'Octocat',
        avatarUrl: 'https://github.com/avatar.jpg',
      });
    });

    it('default mapProfile falls back to login when name is null', () => {
      const provider = github(config);
      const result = provider.mapProfile({
        name: null,
        login: 'octocat',
        avatar_url: 'https://github.com/avatar.jpg',
      });
      expect(result.name).toBe('octocat');
    });

    it('uses custom mapProfile when provided', () => {
      const provider = github({
        ...config,
        mapProfile: (profile: GithubProfile) => ({
          name: profile.name ?? profile.login,
          avatarUrl: profile.avatar_url,
          githubUsername: profile.login,
          bio: profile.bio,
        }),
      });
      const result = provider.mapProfile({
        name: 'Octocat',
        login: 'octocat',
        avatar_url: 'https://github.com/avatar.jpg',
        bio: 'Open source enthusiast',
      });
      expect(result).toEqual({
        name: 'Octocat',
        avatarUrl: 'https://github.com/avatar.jpg',
        githubUsername: 'octocat',
        bio: 'Open source enthusiast',
      });
    });
  });
});
