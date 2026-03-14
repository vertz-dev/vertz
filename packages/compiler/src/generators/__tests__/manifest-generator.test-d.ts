import { describe, it } from 'bun:test';
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
    const _check: Generator = {} as ManifestGenerator;
    void _check;
  });

  it('ManifestDiagnostic severity is union type', () => {
    const _check1: 'error' | 'warning' | 'info' = {} as ManifestDiagnostic['severity'];
    const _check2: ManifestDiagnostic['severity'] = {} as 'error' | 'warning' | 'info';
    void _check1;
    void _check2;
  });
});
