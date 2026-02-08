import { describe, expectTypeOf, it } from 'vitest';
import type { Generator } from '../base-generator';
import type {
  AppManifest,
  ManifestDiagnostic,
  ManifestGenerator,
  ManifestModule,
  ManifestRoute,
} from '../manifest-generator';

describe('ManifestGenerator type-level tests', () => {
  it('AppManifest requires version field', () => {
    // @ts-expect-error — missing version and other required fields
    const _bad: AppManifest = { app: { basePath: '/api' } };
  });

  it('ManifestModule requires name field', () => {
    // @ts-expect-error — missing required fields
    const _bad: ManifestModule = { services: [], routers: [] };
  });

  it('ManifestRoute method matches HttpMethod', () => {
    // @ts-expect-error — invalid HTTP method
    const _bad: ManifestRoute['method'] = 'INVALID';
  });

  it('ManifestGenerator satisfies Generator interface', () => {
    expectTypeOf<ManifestGenerator>().toMatchTypeOf<Generator>();
  });

  it('ManifestDiagnostic severity is union type', () => {
    expectTypeOf<ManifestDiagnostic['severity']>().toEqualTypeOf<'error' | 'warning' | 'info'>();
  });
});
