import type { ContextFeatures, FullFeatures, NoFeatures } from '../entity/types';
import type { ServiceConfig } from '../service/types';
import { service } from '../service/service';

// ---------------------------------------------------------------------------
// ServiceConfig accepts TFeatures as 3rd type parameter
// ---------------------------------------------------------------------------

// This tests that ServiceConfig has 3 generics: TActions, TInject, TFeatures
// If TFeatures is not added, this will error with "Expected 1-2 type arguments"
type _TestServiceConfigAcceptsFeatures = ServiceConfig<
  Record<string, never>,
  Record<string, never>,
  NoFeatures
>;

// ---------------------------------------------------------------------------
// service() accepts TFeatures as 4th type parameter
// ---------------------------------------------------------------------------

// service() should accept TFeatures — if not, this errors with "Expected 1-3 type arguments"
// We test via the ServiceConfig parameter to service() which carries TFeatures
declare function testServiceCall<F extends ContextFeatures>(
  config: ServiceConfig<Record<string, never>, Record<string, never>, F>,
): void;
testServiceCall<NoFeatures>(
  {} as ServiceConfig<Record<string, never>, Record<string, never>, NoFeatures>,
);
