import type { InferFeatures } from '../typed';
import type { FullFeatures, NoFeatures } from '../entity/types';

// ---------------------------------------------------------------------------
// InferFeatures correctly infers feature flags from auth config shapes
// ---------------------------------------------------------------------------

// No auth — all false
type F0 = InferFeatures<undefined>;
const _f0Auth: false = {} as F0['auth'];
const _f0Tenant: false = {} as F0['tenant'];
const _f0ML: false = {} as F0['multiLevelTenant'];

// Auth only (no tenant)
type F1 = InferFeatures<{ session: { strategy: 'jwt'; ttl: '1h' } }>;
const _f1Auth: true = {} as F1['auth'];
const _f1Tenant: false = {} as F1['tenant'];
const _f1ML: false = {} as F1['multiLevelTenant'];

// Auth + tenant (single-level)
type F2 = InferFeatures<{
  session: { strategy: 'jwt'; ttl: '1h' };
  tenant: { verifyMembership: (userId: string, tenantId: string) => Promise<boolean> };
}>;
const _f2Auth: true = {} as F2['auth'];
const _f2Tenant: true = {} as F2['tenant'];
const _f2ML: false = {} as F2['multiLevelTenant'];

// Auth + multi-level tenant
type F3 = InferFeatures<{
  session: { strategy: 'jwt'; ttl: '1h' };
  tenant: {
    verifyMembership: (userId: string, tenantId: string) => Promise<boolean>;
    multiLevel: true;
  };
}>;
const _f3Auth: true = {} as F3['auth'];
const _f3Tenant: true = {} as F3['tenant'];
const _f3ML: true = {} as F3['multiLevelTenant'];

// Auth + tenant: false (explicitly disabled)
type F4 = InferFeatures<{ session: { strategy: 'jwt'; ttl: '1h' }; tenant: false }>;
const _f4Auth: true = {} as F4['auth'];
const _f4Tenant: false = {} as F4['tenant'];
const _f4ML: false = {} as F4['multiLevelTenant'];

// ---------------------------------------------------------------------------
// InferFeatures matches FullFeatures / NoFeatures structural equivalence
// ---------------------------------------------------------------------------

// F0 should be structurally equal to NoFeatures
const _f0AsNo: NoFeatures = {} as F0;
const _noAsF0: F0 = {} as NoFeatures;

// F3 should be structurally equal to FullFeatures
const _f3AsFull: FullFeatures = {} as F3;
const _fullAsF3: F3 = {} as FullFeatures;
