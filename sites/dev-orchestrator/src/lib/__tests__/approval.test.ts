import { describe, expect, it, beforeEach, afterEach, vi } from 'bun:test';
import { checkApproval } from '../approval';

describe('Feature: Approval checker', () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mockFetch.mockReset();
  });

  describe('Given an issue with an "/approve" comment from viniciusdacal', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          { id: 100, user: { login: 'viniciusdacal' }, body: '/approve' },
        ],
      });
    });

    describe('When checkApproval is called', () => {
      it('Then returns approved: true with approvedBy', async () => {
        const result = await checkApproval('vertz-dev/vertz', 1, 0, 'gh-token');
        expect(result.approved).toBe(true);
        expect(result.approvedBy).toBe('viniciusdacal');
        expect(result.comment).toBe('/approve');
      });
    });
  });

  describe('Given an issue with an "LGTM" comment from viniciusdacal', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          { id: 101, user: { login: 'viniciusdacal' }, body: 'LGTM' },
        ],
      });
    });

    describe('When checkApproval is called', () => {
      it('Then returns approved: true', async () => {
        const result = await checkApproval('vertz-dev/vertz', 1, 0, 'gh-token');
        expect(result.approved).toBe(true);
        expect(result.approvedBy).toBe('viniciusdacal');
      });
    });
  });

  describe('Given an issue with an "/approve" comment from a non-collaborator', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          { id: 102, user: { login: 'random-user' }, body: '/approve' },
        ],
      });
    });

    describe('When checkApproval is called', () => {
      it('Then returns approved: false', async () => {
        const result = await checkApproval('vertz-dev/vertz', 1, 0, 'gh-token');
        expect(result.approved).toBe(false);
        expect(result.approvedBy).toBeUndefined();
      });
    });
  });

  describe('Given an issue with no approval comments', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [
          { id: 103, user: { login: 'viniciusdacal' }, body: 'looks interesting' },
        ],
      });
    });

    describe('When checkApproval is called', () => {
      it('Then returns approved: false', async () => {
        const result = await checkApproval('vertz-dev/vertz', 1, 0, 'gh-token');
        expect(result.approved).toBe(false);
      });
    });
  });

  describe('Given an issue with no comments at all', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      });
    });

    describe('When checkApproval is called', () => {
      it('Then returns approved: false', async () => {
        const result = await checkApproval('vertz-dev/vertz', 1, 0, 'gh-token');
        expect(result.approved).toBe(false);
      });
    });
  });

  describe('Given the GitHub API call', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [],
      });
    });

    describe('When checkApproval is called', () => {
      it('Then passes the correct URL and authorization header', async () => {
        await checkApproval('vertz-dev/vertz', 42, 99, 'my-token');
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, opts] = mockFetch.mock.calls[0];
        expect(url).toBe(
          'https://api.github.com/repos/vertz-dev/vertz/issues/42/comments?since_id=99',
        );
        expect(opts.headers.Authorization).toBe('Bearer my-token');
      });
    });
  });
});
