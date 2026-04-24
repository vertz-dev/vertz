/**
 * Type flow verification — rules.entitlement() narrowing via EntitlementRegistry [#2992]
 *
 * Simulates what `@vertz/codegen`'s AccessTypesGenerator emits into `access.d.ts`
 * at build time and verifies the narrowing propagates end-to-end through the
 * published `@vertz/server` package:
 *
 *   1. rules.entitlement('task:update') — declared, compiles clean
 *   2. rules.entitlement('task:udpate') — typo, rejected at compile time
 *   3. ctx.can('task:delete') / ctx.authorize('task:delete') — same narrowing
 *
 * If this file compiles clean, the augmentation flow the generator relies on
 * still reaches the builder signature through the package boundary.
 */
import { rules } from '@vertz/server';
import type { AccessContext } from '@vertz/server';

// Augmentation mirrors what AccessTypesGenerator emits into access.d.ts:
//   declare module '@vertz/server' {
//     interface EntitlementRegistry {
//       'task:update': true;
//       ...
//     }
//   }
// Entitlements that appear elsewhere in this package's type-checked files
// are included so sibling `.test-d.ts` tests keep compiling.
declare module '@vertz/server' {
  interface EntitlementRegistry {
    'task:update': true;
    'task:delete': true;
    'project:view': true;
    'organization:manage': true;
  }
}

// Positive: declared entitlement compiles.
rules.entitlement('task:update');
rules.entitlement('task:delete');

// Negative: undeclared entitlement is rejected.
// @ts-expect-error -- 'task:udpate' is not a registered entitlement
rules.entitlement('task:udpate');

// @ts-expect-error -- empty string is not a registered entitlement
rules.entitlement('');

// @ts-expect-error -- arbitrary string is not a registered entitlement
rules.entitlement('unknown:action');

// The same registry powers AccessContext — narrowing flows to can()/authorize().
declare const ctx: AccessContext;
void ctx.can('task:update');
void ctx.authorize('task:delete');

// @ts-expect-error -- narrowing reaches AccessContext.can() too
void ctx.can('task:udpate');
