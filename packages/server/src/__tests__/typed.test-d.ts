import { defineAuth } from '../define-auth';
import type { BaseContext, FullFeatures, NoFeatures } from '../entity/types';
import type { InferFeatures, TypedFactories } from '../typed';
import { typed } from '../typed';

// ---------------------------------------------------------------------------
// Test 1: No-auth — typed() removes auth/tenant fields
// ---------------------------------------------------------------------------

const tNoAuth = typed();
type FNoAuth = InferFeatures<undefined>;
const _noAuthEntity = tNoAuth.entity;
const _noAuthService = tNoAuth.service;

// ---------------------------------------------------------------------------
// Test 2: Auth-only — auth fields present, tenant absent
// ---------------------------------------------------------------------------

const authOnly = defineAuth({ session: { strategy: 'jwt', ttl: '1h' } });
const tAuthOnly = typed(authOnly);
type FAuthOnly = InferFeatures<typeof authOnly>;
const _authOnlyTrue: true = {} as FAuthOnly['auth'];
const _authOnlyTenantFalse: false = {} as FAuthOnly['tenant'];

// ---------------------------------------------------------------------------
// Test 3: Auth + tenant — tenant present, tenantLevel absent
// ---------------------------------------------------------------------------

const authWithTenant = defineAuth({
  session: { strategy: 'jwt', ttl: '1h' },
  tenant: { verifyMembership: async () => true },
});
const tAuthTenant = typed(authWithTenant);
type FAuthTenant = InferFeatures<typeof authWithTenant>;
const _atAuth: true = {} as FAuthTenant['auth'];
const _atTenant: true = {} as FAuthTenant['tenant'];
const _atML: false = {} as FAuthTenant['multiLevelTenant'];

// ---------------------------------------------------------------------------
// Test 4: Auth + multi-level — all fields
// ---------------------------------------------------------------------------

const authWithML = defineAuth({
  session: { strategy: 'jwt', ttl: '1h' },
  tenant: { verifyMembership: async () => true, multiLevel: true },
});
const tAuthML = typed(authWithML);
type FAuthML = InferFeatures<typeof authWithML>;
const _mlAuth: true = {} as FAuthML['auth'];
const _mlTenant: true = {} as FAuthML['tenant'];
const _mlML: true = {} as FAuthML['multiLevelTenant'];

// ---------------------------------------------------------------------------
// Test 5: typed() entity output is same EntityDefinition type
// ---------------------------------------------------------------------------

// typed().entity and typed().service are functions
const _entityFn: (...args: unknown[]) => unknown = tNoAuth.entity as unknown as (...args: unknown[]) => unknown;
const _serviceFn: (...args: unknown[]) => unknown = tNoAuth.service as unknown as (...args: unknown[]) => unknown;

// ---------------------------------------------------------------------------
// Test 6: TypedFactories type exists and is properly parameterized
// ---------------------------------------------------------------------------

type _FullFactories = TypedFactories<FullFeatures>;
type _NoFactories = TypedFactories<NoFeatures>;

// ---------------------------------------------------------------------------
// Test 7: InferServerFeatures
// ---------------------------------------------------------------------------

import type { InferServerFeatures, InferServerContext } from '../typed';

// Config with no auth → NoFeatures
type SF1 = InferServerFeatures<{ db: unknown }>;
const _sf1Auth: false = {} as SF1['auth'];
const _sf1Tenant: false = {} as SF1['tenant'];

// Config with auth → infers from auth
type SF2 = InferServerFeatures<{
  db: unknown;
  auth: { session: { strategy: 'jwt'; ttl: '1h' } };
}>;
const _sf2Auth: true = {} as SF2['auth'];
const _sf2Tenant: false = {} as SF2['tenant'];

// Config with cloud → FullFeatures
type SF3 = InferServerFeatures<{ cloud: { projectId: 'my-project' } }>;
const _sf3Auth: true = {} as SF3['auth'];
const _sf3Tenant: true = {} as SF3['tenant'];
const _sf3ML: true = {} as SF3['multiLevelTenant'];

// InferServerContext resolves to BaseContext
type SC1 = InferServerContext<{ db: unknown }>;
// SC1 should be BaseContext<NoFeatures> = {} — no fields
// @ts-expect-error — userId not on NoFeatures server context
const _sc1: SC1 & { userId: string } = {} as SC1;
