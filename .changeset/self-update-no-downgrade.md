---
'@vertz/runtime': patch
---

fix(vtz): refuse to silently downgrade in `vtz self-update`

`vtz self-update` previously compared the installed and target versions with
string equality, so any time the GitHub `/releases/latest` endpoint pointed at
an older tag than what was installed (e.g., during a parallel-release race
where an older workflow run wins the `latest` pointer, or when a developer is
on a locally-built newer build) the updater happily replaced the binary with
an older version.

The updater now performs a semver comparison and refuses to proceed when the
target version is older than the installed one, unless the user explicitly
opts in via `vtz self-update --version <v>`.

Addresses bug 3 in #2860. Bugs 1 and 2 (release workflow asset-upload race
and `latest`-pointer race) remain open.
