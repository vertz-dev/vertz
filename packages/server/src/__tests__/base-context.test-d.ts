import type {
  AuthContext,
  BaseContext,
  ContextFeatures,
  EntityContext,
  FullFeatures,
  MultiLevelTenantContext,
  NoFeatures,
  TenantContext,
} from '../entity/types';

// ---------------------------------------------------------------------------
// BaseContext<FullFeatures> (default) — has all fields (backwards compat)
// ---------------------------------------------------------------------------

const fullCtx = {} as BaseContext;

const _userId: string | null = fullCtx.userId;
const _tenantId: string | null = fullCtx.tenantId;
const _tenantLevel: string | null = fullCtx.tenantLevel;
const _auth: boolean = fullCtx.authenticated();
const _tenant: boolean = fullCtx.tenant();
const _role: boolean = fullCtx.role('admin');

// ---------------------------------------------------------------------------
// BaseContext<NoFeatures> — has NO auth/tenant fields
// ---------------------------------------------------------------------------

const noCtx = {} as BaseContext<NoFeatures>;

// @ts-expect-error — userId does not exist on no-features context
noCtx.userId;

// @ts-expect-error — tenantId does not exist
noCtx.tenantId;

// @ts-expect-error — authenticated does not exist
noCtx.authenticated;

// @ts-expect-error — tenant does not exist
noCtx.tenant;

// @ts-expect-error — role does not exist
noCtx.role;

// @ts-expect-error — tenantLevel does not exist
noCtx.tenantLevel;

// ---------------------------------------------------------------------------
// BaseContext<{ auth: true; tenant: false; multiLevelTenant: false }> — auth only
// ---------------------------------------------------------------------------

type AuthOnly = { auth: true; tenant: false; multiLevelTenant: false };
const authCtx = {} as BaseContext<AuthOnly>;

const _authUserId: string | null = authCtx.userId;
const _authAuth: boolean = authCtx.authenticated();
const _authRole: boolean = authCtx.role('admin');

// @ts-expect-error — tenantId not on auth-only context
authCtx.tenantId;

// @ts-expect-error — tenant() not on auth-only context
authCtx.tenant;

// @ts-expect-error — tenantLevel not on auth-only context
authCtx.tenantLevel;

// ---------------------------------------------------------------------------
// BaseContext<{ auth: true; tenant: true; multiLevelTenant: false }> — auth + tenant
// ---------------------------------------------------------------------------

type AuthTenant = { auth: true; tenant: true; multiLevelTenant: false };
const authTenantCtx = {} as BaseContext<AuthTenant>;

const _atUserId: string | null = authTenantCtx.userId;
const _atTenantId: string | null = authTenantCtx.tenantId;
const _atAuth: boolean = authTenantCtx.authenticated();
const _atTenant: boolean = authTenantCtx.tenant();

// @ts-expect-error — tenantLevel not on single-level tenant context
authTenantCtx.tenantLevel;

// ---------------------------------------------------------------------------
// BaseContext<FullFeatures> — all fields including tenantLevel
// ---------------------------------------------------------------------------

const fullFeatCtx = {} as BaseContext<FullFeatures>;
const _ffLevel: string | null = fullFeatCtx.tenantLevel;

// ---------------------------------------------------------------------------
// EntityContext extends BaseContext (FullFeatures default) — backwards compat
// ---------------------------------------------------------------------------

const entityCtx = {} as EntityContext;
const _ecUserId: string | null = entityCtx.userId;
const _ecTenantId: string | null = entityCtx.tenantId;
const _ecAuth: boolean = entityCtx.authenticated();
entityCtx.entity; // always present
entityCtx.entities; // always present

// EntityContext is assignable to BaseContext (default = FullFeatures)
const _baseFromEntity: BaseContext = entityCtx;

// ---------------------------------------------------------------------------
// Mixin interfaces are correctly typed
// ---------------------------------------------------------------------------

const authMixin = {} as AuthContext;
const _amUserId: string | null = authMixin.userId;
const _amAuth: boolean = authMixin.authenticated();
const _amRole: boolean = authMixin.role('admin');

const tenantMixin = {} as TenantContext;
const _tmTenantId: string | null = tenantMixin.tenantId;
const _tmTenant: boolean = tenantMixin.tenant();

const mlMixin = {} as MultiLevelTenantContext;
const _mlLevel: string | null = mlMixin.tenantLevel;
