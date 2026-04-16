---
'@vertz/native-compiler': patch
---

fix(native-compiler): add repository/license/description fields to package.json

npm publish with `--provenance` rejected the 0.2.66 publish with:

    npm error code E422
    Error verifying sigstore provenance bundle: Failed to validate
    repository information: package.json: "repository.url" is "",
    expected to match "https://github.com/vertz-dev/vertz" from provenance

The `@vertz/native-compiler` package had never been published before, and its package.json was missing `repository`, `license`, and `description`. npm's provenance attestation requires the manifest's `repository.url` to match the source repo recorded in the provenance bundle. Added all three fields matching the pattern used by the other `@vertz/*` packages.
