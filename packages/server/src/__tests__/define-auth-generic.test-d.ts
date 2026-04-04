import { defineAuth } from '../define-auth';
import type { TenantConfig } from '../auth/types';

// ---------------------------------------------------------------------------
// defineAuth preserves literal type — no widening to AuthConfig
// ---------------------------------------------------------------------------

// Auth only (no tenant)
const authNoTenant = defineAuth({ session: { strategy: 'jwt', ttl: '1h' } });
type T1 = typeof authNoTenant;

// T1 should NOT have 'tenant' as a property
// @ts-expect-error — tenant does not exist on auth-only config
const _t1Tenant: T1['tenant'] = undefined;

// Auth with tenant
const authWithTenant = defineAuth({
  session: { strategy: 'jwt', ttl: '1h' },
  tenant: {
    verifyMembership: async () => true,
  },
});
type T2 = typeof authWithTenant;

// T2['tenant'] should be assignable to TenantConfig (it's a narrower literal)
const _t2Tenant: TenantConfig = {} as NonNullable<T2['tenant']>;

// Auth with tenant + multiLevel
const authWithMultiLevel = defineAuth({
  session: { strategy: 'jwt', ttl: '1h' },
  tenant: {
    verifyMembership: async () => true,
    multiLevel: true,
  },
});
type T3 = typeof authWithMultiLevel;

// T3['tenant'] should exist and have multiLevel: true
type T3Tenant = NonNullable<T3['tenant']>;
const _t3MultiLevel: true = {} as T3Tenant extends { multiLevel: true } ? true : false;

// Auth with tenant: false (explicitly disabled)
const authTenantFalse = defineAuth({
  session: { strategy: 'jwt', ttl: '1h' },
  tenant: false,
});
type T4 = typeof authTenantFalse;

// T4['tenant'] should be false
const _t4Tenant: false = {} as NonNullable<T4['tenant']>;
