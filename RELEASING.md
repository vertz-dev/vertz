# Releasing

Vertz uses [Changesets](https://github.com/changesets/changesets) to manage versions, changelogs, and npm publishing.

All `@vertz/*` packages use **fixed versioning** — they always share the same version number.

## For Contributors

### Adding a changeset

When your PR includes user-facing changes, add a changeset:

```bash
bunx changeset
```

The interactive prompt will ask you to:
1. Select which packages are affected
2. Choose the semver bump type (patch / minor / major)
3. Write a summary of the change

This creates a markdown file in `.changeset/` that should be committed with your PR.

**When to add a changeset:**
- New features, bug fixes, breaking changes
- Changes that affect the public API of any `@vertz/*` package

**When NOT to add a changeset:**
- Internal refactors with no public API change
- Documentation-only changes
- CI/tooling changes

### Changeset summary guidelines

Write the summary as a changelog entry that users will read:

```
Good:  Add `app.listen()` method for starting HTTP servers
Good:  Fix route path validation to reject empty strings
Bad:   Update code
Bad:   Fix bug
```

## For Maintainers

### How releases work

1. Contributors add changesets to their PRs
2. When PRs with changesets are merged to `main`, the Release workflow creates (or updates) a **Version Packages** PR
3. The Version PR shows the version bumps and changelog entries for review
4. When you merge the Version PR, the Release workflow publishes all packages to npm

### Manual release (if needed)

```bash
# Version packages (updates package.json and CHANGELOG.md)
bun run changeset:version

# Build and publish to npm
bun run changeset:publish
```

### Pre-releases

For alpha/beta/rc releases:

```bash
# Enter pre-release mode
bunx changeset pre enter alpha

# Add changesets and version as normal
bunx changeset
bun run changeset:version

# Publish pre-release versions (e.g., 0.2.0-alpha.0)
bun run changeset:publish

# Exit pre-release mode when ready for stable
bunx changeset pre exit
```

## npm Setup

Before the first publish, ensure:
1. The `@vertz` npm organization exists
2. An npm automation token is added as `NPM_TOKEN` in GitHub repo secrets (or trusted publishing is configured)
3. Package names `@vertz/schema`, `@vertz/core`, `@vertz/compiler`, `@vertz/testing` are available
