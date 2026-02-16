import type { TableEntry } from '@vertz/db';
export type DomainType = 'persisted' | 'process' | 'view' | 'session';
export interface DomainContext<TRow = any> {
  user: {
    id: string;
    role: string;
    [key: string]: unknown;
  } | null;
  tenant: {
    id: string;
    [key: string]: unknown;
  } | null;
  request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    ip: string;
  };
  db: Record<string, any>;
  services: Record<string, unknown>;
  defaultHandler: (data: any) => Promise<TRow>;
}
export type AccessRule<TRow> = (row: TRow, ctx: DomainContext<TRow>) => boolean;
export interface AccessRules<TRow> {
  read?: AccessRule<TRow>;
  create?: AccessRule<Partial<TRow>>;
  update?: AccessRule<TRow>;
  delete?: AccessRule<TRow>;
}
export type Result<T, E = any> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: E;
    };
export interface DomainError {
  type: string;
  code: string;
  message: string;
  entity?: string;
  field?: string;
}
export interface DomainOptions<TEntry extends TableEntry<any, any>> {
  type: DomainType;
  table: TEntry;
  fields?: any;
  expose?: any;
  access?: AccessRules<any>;
  handlers?: any;
  actions?: Record<string, any>;
}
export interface DomainDefinition<TEntry extends TableEntry<any, any> = TableEntry<any, any>> {
  readonly name: string;
  readonly type: DomainType;
  readonly table: TEntry;
  readonly exposedRelations: Record<string, any>;
  readonly access: AccessRules<any>;
  readonly handlers: any;
  readonly actions: Record<string, any>;
}
//# sourceMappingURL=types.d.ts.map
