import { describe, expect, it } from 'bun:test';
import { type CloudConfig, validateCloudConfig } from '../../cloud/cloud-config';

describe('Feature: Cloud configuration', () => {
  describe('Given a valid cloud config with apiKey', () => {
    describe('When validating the config', () => {
      it('Then accepts the config without errors', () => {
        const config: CloudConfig = {
          apiKey: 'vtz_live_abc123',
        };
        expect(() => validateCloudConfig(config)).not.toThrow();
      });
    });
  });

  describe('Given a cloud config with explicit failMode', () => {
    describe('When failMode is "closed"', () => {
      it('Then accepts the config', () => {
        const config: CloudConfig = {
          apiKey: 'vtz_live_abc123',
          failMode: 'closed',
        };
        expect(() => validateCloudConfig(config)).not.toThrow();
      });
    });

    describe('When failMode is "open"', () => {
      it('Then accepts the config', () => {
        const config: CloudConfig = {
          apiKey: 'vtz_live_abc123',
          failMode: 'open',
        };
        expect(() => validateCloudConfig(config)).not.toThrow();
      });
    });

    describe('When failMode is "cached"', () => {
      it('Then accepts the config', () => {
        const config: CloudConfig = {
          apiKey: 'vtz_live_abc123',
          failMode: 'cached',
        };
        expect(() => validateCloudConfig(config)).not.toThrow();
      });
    });
  });

  describe('Given a cloud config with missing apiKey', () => {
    describe('When validating the config', () => {
      it('Then throws an error', () => {
        const config = {} as CloudConfig;
        expect(() => validateCloudConfig(config)).toThrow('apiKey is required');
      });
    });
  });

  describe('Given a cloud config with empty apiKey', () => {
    describe('When validating the config', () => {
      it('Then throws an error', () => {
        const config: CloudConfig = { apiKey: '' };
        expect(() => validateCloudConfig(config)).toThrow('apiKey is required');
      });
    });
  });

  describe('Given a cloud config with invalid failMode', () => {
    describe('When validating the config', () => {
      it('Then throws an error', () => {
        const config = { apiKey: 'vtz_live_abc123', failMode: 'invalid' } as CloudConfig;
        expect(() => validateCloudConfig(config)).toThrow(
          "failMode must be 'closed', 'open', or 'cached'",
        );
      });
    });
  });

  describe('Given a cloud config with custom baseUrl', () => {
    describe('When validating the config', () => {
      it('Then accepts the config', () => {
        const config: CloudConfig = {
          apiKey: 'vtz_live_abc123',
          baseUrl: 'https://custom.vertz.cloud',
        };
        expect(() => validateCloudConfig(config)).not.toThrow();
      });
    });
  });

  describe('Given a cloud config with custom timeoutMs', () => {
    describe('When validating the config', () => {
      it('Then accepts the config', () => {
        const config: CloudConfig = {
          apiKey: 'vtz_live_abc123',
          timeoutMs: 5000,
        };
        expect(() => validateCloudConfig(config)).not.toThrow();
      });
    });
  });

  describe('Given a cloud config with timeoutMs <= 0', () => {
    describe('When validating the config', () => {
      it('Then throws an error', () => {
        const config: CloudConfig = {
          apiKey: 'vtz_live_abc123',
          timeoutMs: 0,
        };
        expect(() => validateCloudConfig(config)).toThrow('timeoutMs must be a positive number');
      });
    });
  });
});
