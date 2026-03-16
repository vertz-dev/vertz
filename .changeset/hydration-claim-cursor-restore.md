---
'@vertz/ui': patch
---

Hydration claim functions (`claimElement`, `claimText`, `claimComment`) now restore the cursor on failure instead of exhausting it. This fixes cursor corruption when composed primitives use `resolveChildren` + `scanSlots` during hydration, where failed slot marker claims would break all subsequent claims.
