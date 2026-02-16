import { describe, expectTypeOf, it } from 'vitest';

describe('ManifestGenerator type-level tests', () => {
  it('AppManifest requires version field', () => {
    // @ts-expect-error — missing version and other required fields
    const _bad = { app: { basePath: '/api' } };
  });
  it('ManifestModule requires name field', () => {
    // @ts-expect-error — missing required fields
    const _bad = { services: [], routers: [] };
  });
  it('ManifestRoute method matches HttpMethod', () => {
    // @ts-expect-error — invalid HTTP method
    const _bad = 'INVALID';
  });
  it('ManifestGenerator satisfies Generator interface', () => {
    expectTypeOf().toMatchTypeOf();
  });
  it('ManifestDiagnostic severity is union type', () => {
    expectTypeOf().toEqualTypeOf();
  });
});
//# sourceMappingURL=manifest-generator.test-d.js.map
