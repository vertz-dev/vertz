import type { BaseContext } from '../entity/types';

// ---------------------------------------------------------------------------
// Structural compatibility with @vertz/agents BaseContextLike
// ---------------------------------------------------------------------------

// Mirror of the structural type used in create-agent-runner.ts
interface BaseContextLike {
  readonly userId: string | null;
  readonly tenantId: string | null;
  readonly tenantLevel?: string | null;
  authenticated(): boolean;
  tenant(): boolean;
  role(...roles: string[]): boolean;
}

// Default BaseContext (FullFeatures) must be assignable to BaseContextLike
const _compat: BaseContextLike = {} as BaseContext;
