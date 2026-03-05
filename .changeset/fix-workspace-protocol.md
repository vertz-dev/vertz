---
'@vertz/cli': patch
---

fix(release): use workspace:^ protocol and unify fixed version group

Two changes to prevent broken npm installs caused by version gaps:

1. Changed all `workspace:*` to `workspace:^` so published packages use
   caret ranges (e.g., `"^0.2.3"`) instead of exact versions (`"0.2.3"`).
   This makes installs resilient when an exact patch version is missing.

2. Expanded the changeset `fixed` group to include all 20 publishable
   packages. Every release now bumps all packages to the same version,
   eliminating version gaps between sibling dependencies.
