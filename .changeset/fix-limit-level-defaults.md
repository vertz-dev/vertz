---
'@vertz/server': patch
---

fix(auth): resolveAllLimitStates uses level-specific defaultPlan in multi-level mode

When a subscription expires in multi-level billing, `resolveAllLimitStates` now uses the per-level default plan (`defaultPlans[entry.type]`) instead of the global `defaultPlan`. Fixes inconsistency where gate check and limit resolution could fall back to different plans.
