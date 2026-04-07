import { describe, expect, it } from 'bun:test';
import { AccessTypesGenerator } from '../generators/access-types-generator';
import { AuthSdkGenerator } from '../generators/auth-sdk-generator';
import { ClientGenerator } from '../generators/client-generator';
import { EntitySchemaGenerator } from '../generators/entity-schema-generator';
import { EntitySchemaManifestGenerator } from '../generators/entity-schema-manifest-generator';
import { EntitySdkGenerator } from '../generators/entity-sdk-generator';
import { EntityTypesGenerator } from '../generators/entity-types-generator';
import { RlsPolicyGenerator } from '../generators/rls-policy-generator';
import { RouterAugmentationGenerator } from '../generators/router-augmentation-generator';
import { ServiceSdkGenerator } from '../generators/service-sdk-generator';
import type { CodegenIR, GeneratorConfig } from '../types';

const emptyIR: CodegenIR = {
  basePath: '/api',
  modules: [],
  schemas: [],
  entities: [],
  services: [],
  auth: { schemes: [], operations: [] },
};

const defaultConfig: GeneratorConfig = { outputDir: '.vertz/generated', options: {} };

describe('Generator name properties', () => {
  it('AccessTypesGenerator has name "access-types"', () => {
    expect(new AccessTypesGenerator().name).toBe('access-types');
  });

  it('AuthSdkGenerator has name "auth-sdk"', () => {
    expect(new AuthSdkGenerator().name).toBe('auth-sdk');
  });

  it('ClientGenerator has name "client"', () => {
    expect(new ClientGenerator().name).toBe('client');
  });

  it('EntitySchemaGenerator has name "entity-schema"', () => {
    expect(new EntitySchemaGenerator().name).toBe('entity-schema');
  });

  it('EntitySchemaManifestGenerator has name "entity-schema-manifest"', () => {
    expect(new EntitySchemaManifestGenerator().name).toBe('entity-schema-manifest');
  });

  it('EntitySdkGenerator has name "entity-sdk"', () => {
    expect(new EntitySdkGenerator().name).toBe('entity-sdk');
  });

  it('EntityTypesGenerator has name "entity-types"', () => {
    expect(new EntityTypesGenerator().name).toBe('entity-types');
  });

  it('RlsPolicyGenerator has name "rls-policies"', () => {
    expect(new RlsPolicyGenerator().name).toBe('rls-policies');
  });

  it('RouterAugmentationGenerator has name "router-augmentation"', () => {
    expect(new RouterAugmentationGenerator().name).toBe('router-augmentation');
  });
});

describe('Generator edge cases with empty IR', () => {
  it('AccessTypesGenerator returns empty for no access', () => {
    expect(new AccessTypesGenerator().generate(emptyIR, defaultConfig)).toEqual([]);
  });

  it('AuthSdkGenerator returns empty for no auth operations', () => {
    expect(new AuthSdkGenerator().generate(emptyIR, defaultConfig)).toEqual([]);
  });

  it('ClientGenerator returns client file even with no entities', () => {
    const files = new ClientGenerator().generate(emptyIR, defaultConfig);
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it('EntitySchemaGenerator returns empty for no entities', () => {
    expect(new EntitySchemaGenerator().generate(emptyIR, defaultConfig)).toEqual([]);
  });

  it('EntitySchemaManifestGenerator returns manifest even with no entities', () => {
    const files = new EntitySchemaManifestGenerator().generate(emptyIR, defaultConfig);
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it('EntitySdkGenerator returns empty for no entities', () => {
    expect(new EntitySdkGenerator().generate(emptyIR, defaultConfig)).toEqual([]);
  });

  it('EntityTypesGenerator returns empty for no entities', () => {
    expect(new EntityTypesGenerator().generate(emptyIR, defaultConfig)).toEqual([]);
  });

  it('RlsPolicyGenerator returns empty for no access', () => {
    expect(new RlsPolicyGenerator().generate(emptyIR, defaultConfig)).toEqual([]);
  });

  it('RouterAugmentationGenerator returns empty when no route module found', () => {
    // Use a nonexistent output dir so findProjectRoot returns null
    const config: GeneratorConfig = { outputDir: '/nonexistent/path', options: {} };
    expect(new RouterAugmentationGenerator().generate(emptyIR, config)).toEqual([]);
  });
});

describe('ServiceSdkGenerator', () => {
  it('returns empty for no services', () => {
    expect(new ServiceSdkGenerator().generate(emptyIR, defaultConfig)).toEqual([]);
  });

  it('has name "service-sdk"', () => {
    expect(new ServiceSdkGenerator().name).toBe('service-sdk');
  });
});

describe('ClientGenerator with services', () => {
  it('includes service SDKs in the generated client', () => {
    const ir: CodegenIR = {
      ...emptyIR,
      services: [
        {
          serviceName: 'notifications',
          actions: [
            {
              name: 'send',
              method: 'POST',
              path: '/notifications/send',
              operationId: 'sendNotifications',
            },
          ],
        },
      ],
    };
    const files = new ClientGenerator().generate(ir, defaultConfig);
    const clientFile = files.find((f) => f.path === 'client.ts');
    expect(clientFile).toBeDefined();
    expect(clientFile!.content).toContain(
      "import { createNotificationsSdk } from './services/notifications'",
    );
    expect(clientFile!.content).toContain('notifications: createNotificationsSdk(client)');
  });
});

describe('AccessTypesGenerator with entitlements', () => {
  it('generates access types with special characters in entitlements', () => {
    const ir: CodegenIR = {
      ...emptyIR,
      access: {
        entitlements: ['task:update', "user's:delete"],
        entities: [],
        whereClauses: [],
      },
    };

    const files = new AccessTypesGenerator().generate(ir, defaultConfig);
    expect(files.length).toBe(1);
    expect(files[0]?.path).toBe('access.d.ts');
    expect(files[0]?.content).toContain('task:update');
  });
});
