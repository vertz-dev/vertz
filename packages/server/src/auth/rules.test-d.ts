import { expectTypeOf } from '@vertz/test';
import type { Entitlement } from './access-context';
import type { EntitlementRule } from './rules';
import { rules } from './rules';

// rules.entitlement must accept the narrowed Entitlement type.
// When user code augments EntitlementRegistry via @vertz/codegen's
// AccessTypesGenerator, `Entitlement` narrows to a literal-string union
// and typos in rules.entitlement('...') become compile errors.
expectTypeOf(rules.entitlement).toEqualTypeOf<(name: Entitlement) => EntitlementRule>();

// Positive: any string is accepted when the registry is empty (fallback)
const ok: EntitlementRule = rules.entitlement('task:update');
void ok;

// Negative: non-string inputs are rejected regardless of registry state
// @ts-expect-error -- entitlement names must be strings
rules.entitlement(42);

// @ts-expect-error -- entitlement names must be defined
rules.entitlement(undefined);
