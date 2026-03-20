import { describe, expect, it } from 'bun:test';
import { CachedWalletStore } from '../../cloud/cached-wallet-store';
import { CloudWalletStore } from '../../cloud/cloud-wallet-store';
import { createCloudWalletStore } from '../../cloud/create-cloud-wallet-store';
import { defineAccess } from '../../define-access';

describe('Feature: Storage configuration in defineAccess', () => {
  const baseInput = {
    entities: {
      workspace: { roles: ['admin', 'member'] },
    },
    entitlements: {
      'workspace:view': { roles: ['admin', 'member'] },
    },
  };

  describe('Given defineAccess with storage.cloud config', () => {
    describe('When cloud config is valid', () => {
      it('Then stores the cloud config on the definition', () => {
        const def = defineAccess({
          ...baseInput,
          storage: {
            cloud: { apiKey: 'vtz_live_abc123' },
          },
        });

        expect(def._cloudConfig).toEqual({
          apiKey: 'vtz_live_abc123',
        });
      });
    });

    describe('When cloud config has custom settings', () => {
      it('Then preserves all settings', () => {
        const def = defineAccess({
          ...baseInput,
          storage: {
            cloud: {
              apiKey: 'vtz_live_abc123',
              failMode: 'open',
              baseUrl: 'https://custom.vertz.cloud',
              timeoutMs: 5000,
            },
          },
        });

        expect(def._cloudConfig?.failMode).toBe('open');
        expect(def._cloudConfig?.baseUrl).toBe('https://custom.vertz.cloud');
        expect(def._cloudConfig?.timeoutMs).toBe(5000);
      });
    });

    describe('When cloud config has invalid failMode', () => {
      it('Then throws a validation error', () => {
        expect(() =>
          defineAccess({
            ...baseInput,
            storage: {
              cloud: { apiKey: 'vtz_live_abc123', failMode: 'invalid' as 'closed' },
            },
          }),
        ).toThrow("failMode must be 'closed', 'open', or 'cached'");
      });
    });

    describe('When cloud config has empty apiKey', () => {
      it('Then throws a validation error', () => {
        expect(() =>
          defineAccess({
            ...baseInput,
            storage: { cloud: { apiKey: '' } },
          }),
        ).toThrow('apiKey is required');
      });
    });
  });

  describe('Given no storage config', () => {
    describe('When defineAccess is called without storage', () => {
      it('Then _cloudConfig is undefined', () => {
        const def = defineAccess(baseInput);
        expect(def._cloudConfig).toBeUndefined();
      });
    });
  });
});

describe('Feature: createCloudWalletStore helper', () => {
  describe('Given a cloud config with default failMode', () => {
    describe('When creating a cloud wallet store', () => {
      it('Then returns a CloudWalletStore', () => {
        const store = createCloudWalletStore({
          apiKey: 'vtz_live_test',
          baseUrl: 'http://localhost:9999',
        });

        expect(store).toBeInstanceOf(CloudWalletStore);
      });
    });
  });

  describe('Given a cloud config with failMode "cached"', () => {
    describe('When creating a cloud wallet store', () => {
      it('Then returns a CachedWalletStore wrapping a CloudWalletStore', () => {
        const store = createCloudWalletStore({
          apiKey: 'vtz_live_test',
          baseUrl: 'http://localhost:9999',
          failMode: 'cached',
        });

        expect(store).toBeInstanceOf(CachedWalletStore);
      });
    });
  });

  describe('Given a cloud config with failMode "closed"', () => {
    describe('When creating a cloud wallet store', () => {
      it('Then returns a plain CloudWalletStore (no cache)', () => {
        const store = createCloudWalletStore({
          apiKey: 'vtz_live_test',
          baseUrl: 'http://localhost:9999',
          failMode: 'closed',
        });

        expect(store).toBeInstanceOf(CloudWalletStore);
      });
    });
  });
});
