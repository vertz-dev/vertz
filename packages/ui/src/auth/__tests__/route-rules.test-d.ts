/**
 * Type-level tests for route access rules.
 *
 * Verifies that RouteAccessRule accepts all descriptor rules
 * except `where()` (routes have no row context).
 */
import type { RouteAccessRule } from '../route-rules';
import { rules } from '../route-rules';

// ─── Positive: valid route access rules ─────────────────────────────────────

// Public rule
const _public: RouteAccessRule = rules.public;
void _public;

// Authenticated rule
const _auth: RouteAccessRule = rules.authenticated();
void _auth;

// Role rule
const _role: RouteAccessRule = rules.role('admin', 'editor');
void _role;

// Entitlement rule
const _ent: RouteAccessRule = rules.entitlement('page:view');
void _ent;

// FVA rule
const _fva: RouteAccessRule = rules.fva(600);
void _fva;

// Composed: all
const _all: RouteAccessRule = rules.all(rules.authenticated(), rules.entitlement('page:view'));
void _all;

// Composed: any
const _any: RouteAccessRule = rules.any(rules.role('admin'), rules.entitlement('page:view'));
void _any;

// Nested composition
const _nested: RouteAccessRule = rules.all(
  rules.authenticated(),
  rules.any(rules.role('admin'), rules.entitlement('page:view')),
);
void _nested;

// ─── Negative: where() rejected on routes ───────────────────────────────────

// @ts-expect-error — where() produces WhereRule, not RouteAccessRule
const _where: RouteAccessRule = rules.where({ tenantId: rules.user.tenantId });
void _where;

// where() inside all() rejected at the argument level
const _allWithWhere: RouteAccessRule = rules.all(
  rules.authenticated(),
  // @ts-expect-error — WhereRule is not assignable to RouteAccessRule
  rules.where({ createdBy: rules.user.id }),
);
void _allWithWhere;

// where() inside any() rejected at the argument level
const _anyWithWhere: RouteAccessRule = rules.any(
  rules.role('admin'),
  // @ts-expect-error — WhereRule is not assignable to RouteAccessRule
  rules.where({ tenantId: rules.user.tenantId }),
);
void _anyWithWhere;
