import type { ModelDef } from '@vertz/db';
import type {
  BaseContext,
  EntityConfig,
  EntityContext,
  FullFeatures,
  NoFeatures,
} from '../entity/types';
import { entity } from '../entity/entity';

// Minimal model stub for type-level tests
declare const tasksModel: ModelDef;

// ---------------------------------------------------------------------------
// Default: entity() with FullFeatures — all ctx fields available in hooks
// ---------------------------------------------------------------------------

// entity() with default TFeatures — hooks have full context
entity('tasks', {
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      const _u: string | null = ctx.userId;
      const _t: string | null = ctx.tenantId;
      const _auth: boolean = ctx.authenticated();
      const _tenant: boolean = ctx.tenant();
      ctx.entity; // always present
      ctx.entities; // always present
      return data;
    },
  },
});

// ---------------------------------------------------------------------------
// entity() with explicit NoFeatures — no auth/tenant fields on ctx
// ---------------------------------------------------------------------------

entity<typeof tasksModel, {}, {}, NoFeatures>('tasks', {
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      // @ts-expect-error — userId not on NoFeatures context
      ctx.userId;
      // @ts-expect-error — tenantId not on NoFeatures context
      ctx.tenantId;
      // @ts-expect-error — authenticated not on NoFeatures context
      ctx.authenticated;
      // OK — entity operations always available
      ctx.entity;
      ctx.entities;
      return data;
    },
  },
});

// ---------------------------------------------------------------------------
// entity() with auth-only features — auth fields but not tenant
// ---------------------------------------------------------------------------

type AuthOnly = { auth: true; tenant: false; multiLevelTenant: false };

entity<typeof tasksModel, {}, {}, AuthOnly>('tasks', {
  model: tasksModel,
  before: {
    create: (data, ctx) => {
      const _u: string | null = ctx.userId;
      const _auth: boolean = ctx.authenticated();
      // @ts-expect-error — tenantId not on auth-only context
      ctx.tenantId;
      // @ts-expect-error — tenant() not on auth-only context
      ctx.tenant;
      return data;
    },
  },
});

// ---------------------------------------------------------------------------
// EntityContext is still assignable to BaseContext<FullFeatures>
// ---------------------------------------------------------------------------

const ec = {} as EntityContext;
const _bc: BaseContext<FullFeatures> = ec;

// EntityDefinition output type is unchanged
const def = entity('tasks', { model: tasksModel });
const _kind: 'entity' = def.kind;
const _name: string = def.name;
