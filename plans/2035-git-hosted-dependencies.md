# Git-Hosted Dependencies (`github:owner/repo`)

**Issue:** #2035
**Status:** Design
**Author:** viniciusdacal

## API Surface

### `vertz add` with GitHub specifiers

```bash
# Default branch HEAD
vertz add github:user/my-lib

# Specific branch
vertz add github:user/my-lib#develop

# Specific tag
vertz add github:user/my-lib#v2.1.0

# Specific commit SHA (full or abbreviated)
vertz add github:user/my-lib#a1b2c3d

# With dep-type flags (same as npm specifiers)
vertz add github:user/my-lib --dev
vertz add github:user/my-lib#v2.0.0 --peer
```

### Package name discovery

The **key** in `package.json` is the `name` field from the GitHub repo's `package.json`, NOT the repo name. The repo is downloaded, its `package.json` is read, and the `name` field becomes the dependency key.

Example: `vertz add github:shadcn/ui` where the repo's `package.json` has `"name": "@shadcn/ui"`:

```jsonc
{
  "dependencies": {
    "@shadcn/ui": "github:shadcn/ui"  // key is package name, value is specifier
  }
}
```

Error cases:
- Repo has no `package.json` → error: `GitHub repo "user/repo" has no package.json`
- `package.json` has no `name` field → error: `package.json in "user/repo" is missing the "name" field`

### package.json output

```jsonc
{
  "dependencies": {
    // Key is the name from the repo's package.json
    // Value is the original GitHub specifier
    "my-lib": "github:user/my-lib#v2.1.0"
  }
}
```

### Lockfile output

```
my-lib@github:user/my-lib#v2.1.0:
  version "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
  resolved "https://codeload.github.com/user/my-lib/tar.gz/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
  integrity "sha512-<base64>"
  dependencies:
    "zod" "^3.24.0"
```

- **Key:** `{pkg-name}@github:{owner}/{repo}[#{ref}]` — preserves the original specifier for lockfile matching
- **Version:** Full 40-char commit SHA — the resolved, pinned commit
- **Resolved:** `codeload.github.com` tarball URL with the SHA — deterministic, content-addressable
- **Integrity:** SHA-512 of the downloaded tarball bytes — computed by us, not provided by GitHub
- **Dependencies:** Transitive deps read from the package's `package.json`

### `vertz install` from lockfile

When reinstalling from lockfile, GitHub entries are detected by the `github:` prefix in the spec key. The resolved URL (`codeload.github.com/...`) is fetched directly — no ref resolution needed since the SHA is already pinned.

### `vertz list` / `vertz why` display

```
my-lib@github:user/my-lib#v2.1.0 (a1b2c3d)
└── zod@3.24.4
```

GitHub packages show the specifier and abbreviated SHA instead of a semver version.

### `vertz add` output

```
resolving github:user/my-lib#v2.1.0...
+ my-lib (github:user/my-lib#v2.1.0 → a1b2c3d)
```

Shows the specifier and the resolved abbreviated SHA. Progress indication during GitHub API resolution prevents perceived hangs.

### `vertz remove` behavior

GitHub dependencies are removed by **package name**, same as npm dependencies:

```bash
vertz remove my-lib
```

No special handling needed — `remove()` already works by package name, not by specifier. The `github:...` range in `package.json` is irrelevant to removal.

## Manifesto Alignment

### Principle 1: "If it builds, it works"

The lockfile pins exact commit SHAs. `vertz install --frozen` verifies that every GitHub dep has a matching lockfile entry. No non-determinism from branch resolution at install time.

### Principle 2: "One way to do things"

Only `github:owner/repo[#ref]` syntax is supported. No `git+https://`, no `git://`, no `git+ssh://` — those are deferred. One clear specifier format.

### Principle 7: "Performance is not optional"

- Tarballs are cached in the global store by `{name}@{sha}` — same cache semantics as npm packages
- SHA-pinned `codeload.github.com` URLs avoid redirect chains (GitHub's API redirects to `codeload` anyway)
- No GitHub API call needed during `vertz install` from lockfile — just fetch the tarball URL

### Principle 8: "No ceilings"

The internal `GitHubClient` is a standalone module. Future specifier types (`gitlab:`, `bitbucket:`, `git+https://`) can follow the same pattern without changing the resolver or lockfile format.

## Non-Goals

1. **Private repository support** — Requires GitHub token auth. Deferred to a separate issue.
2. **`git+https://` or `git+ssh://` URLs** — Only the `github:` shorthand. Full git URLs are a separate feature.
3. **Monorepo subdirectory support** — `github:user/monorepo#branch&path=packages/foo` is deferred.
4. **`prepare` script execution** — Some GitHub packages need a build step (`prepare` script). Deferred — only pre-built packages work.
5. **`vertz update` for GitHub deps** — Updating to latest commit on a branch. Requires re-resolution; deferred.
6. **GitLab / Bitbucket specifiers** — Only GitHub for now.
7. **Bare `owner/repo` shorthand** — Only the explicit `github:` prefix is supported. No ambiguity with package names.

## Unknowns

1. **GitHub tarball prefix format** — GitHub archives use a variable top-level directory: `{repo}-{full-sha}/` for commit SHAs, `{repo}-{tag-without-v}/` for tags, `{repo}-{branch}/` for branches. NOT the `package/` prefix npm uses. **Resolution:** Add a separate `extract_github_tarball()` function that unconditionally strips the first path component, regardless of its name. The existing `strip_package_prefix()` for npm tarballs remains unchanged — no risk of breaking npm extraction.

2. **Resolving refs without the GitHub API** — We need the commit SHA for lockfile pinning. For `vertz add`, we can use the GitHub API (`GET /repos/{owner}/{repo}/commits/{ref}` → response JSON `sha` field). For `vertz install` from lockfile, the SHA is already recorded — no API needed. **Resolution:** Use the GitHub API only during `vertz add` (one-time resolution). Install uses the lockfile's pinned SHA. The GitHub client uses 3 retries with exponential backoff, matching the registry client.

3. **Rate limiting** — GitHub API has rate limits (60 req/hr unauthenticated, 5000/hr authenticated). **Resolution:** Support `GITHUB_TOKEN` env var in Phase 1. If set, send it as `Authorization: Bearer $GITHUB_TOKEN` on API requests. This is NOT private repo support — it only raises the rate limit. The error message for rate limiting must be actionable: `"GitHub API rate limit exceeded (60 requests/hour unauthenticated). Set GITHUB_TOKEN env var to increase to 5000/hr."` Distinguish rate limits from access denied by checking the `X-RateLimit-Remaining: 0` response header on 403s.

4. **Package name vs repo name** — The repo name may differ from the npm package name in the repo's `package.json`. **Resolution:** Always read the `name` field from the downloaded `package.json`. If the `name` field is missing, error with a clear message. Scoped names (`@org/lib`) are supported — the lockfile spec key format handles them correctly (`@org/lib@github:user/repo`).

## Type Flow Map

```
CLI input: "github:user/my-lib#v2.1.0"
    ↓
parse_package_specifier() → GitHubSpecifier { owner: "user", repo: "my-lib", ref_: Some("v2.1.0") }
    ↓
GitHubClient::resolve_ref("user", "my-lib", "v2.1.0") → "a1b2c3d...40chars"
    ↓
GitHubClient::tarball_url("user", "my-lib", "a1b2c3d...") → "https://codeload.github.com/..."
    ↓
TarballManager::fetch_and_extract_github(name, sha, url) → PathBuf
    ↓
read_package_json(extracted_path) → PackageJson { name: "my-lib", dependencies: {...} }
    ↓
LockfileEntry {
    name: "my-lib",
    range: "github:user/my-lib#v2.1.0",
    version: "a1b2c3d...40chars",
    resolved: "https://codeload.github.com/user/my-lib/tar.gz/a1b2c3d...",
    integrity: "sha512-...",
    dependencies: { "zod": "^3.24.0" },
}
    ↓
ResolvedPackage {
    name: "my-lib",
    version: "a1b2c3d...40chars",
    tarball_url: "https://codeload.github.com/...",
    integrity: "sha512-...",
    dependencies: { "zod": "^3.24.0" },
    bin: {},
    nest_path: [],
}
```

## E2E Acceptance Test

```typescript
describe('Feature: Git-hosted dependencies', () => {
  describe('Given a project with no dependencies', () => {
    describe('When running `vertz add github:user/repo`', () => {
      it('Then package.json contains "pkg-name": "github:user/repo"', () => {});
      it('Then vertz.lock contains an entry with the resolved commit SHA', () => {});
      it('Then the package is extracted in node_modules/pkg-name/', () => {});
    });
  });

  describe('Given a project with no dependencies', () => {
    describe('When running `vertz add github:user/repo#branch-name`', () => {
      it('Then package.json contains "pkg-name": "github:user/repo#branch-name"', () => {});
      it('Then vertz.lock records the resolved SHA for that branch HEAD', () => {});
    });
  });

  describe('Given a project with no dependencies', () => {
    describe('When running `vertz add github:user/repo#v1.0.0`', () => {
      it('Then package.json contains "pkg-name": "github:user/repo#v1.0.0"', () => {});
      it('Then vertz.lock records the SHA that v1.0.0 points to', () => {});
    });
  });

  describe('Given a vertz.lock with a GitHub dependency pinned to SHA abc123', () => {
    describe('When running `vertz install`', () => {
      it('Then downloads from the codeload URL with SHA abc123', () => {});
      it('Then the installed package matches the pinned SHA', () => {});
      it('Then transitive npm dependencies are also installed', () => {});
    });
  });

  describe('Given a vertz.lock with a GitHub dependency', () => {
    describe('When running `vertz install --frozen`', () => {
      it('Then succeeds if package.json matches the lockfile entry', () => {});
      it('Then fails if package.json has a GitHub dep not in the lockfile', () => {});
    });
  });

  // Scoped package from GitHub
  describe('Given a GitHub repo whose package.json has name "@org/utils"', () => {
    describe('When running `vertz add github:user/utils-repo`', () => {
      it('Then package.json key is "@org/utils", not "utils-repo"', () => {});
      it('Then vertz.lock key is "@org/utils@github:user/utils-repo"', () => {});
    });
  });

  // Removal
  describe('Given a project with a GitHub dependency "my-lib"', () => {
    describe('When running `vertz remove my-lib`', () => {
      it('Then removes "my-lib" from package.json dependencies', () => {});
      it('Then removes the GitHub entry from vertz.lock', () => {});
    });
  });

  // Negative cases
  describe('Given an invalid GitHub specifier "github:invalid"', () => {
    describe('When running `vertz add github:invalid`', () => {
      it('Then returns error: invalid GitHub specifier "github:invalid" — expected format: github:owner/repo[#ref]', () => {});
    });
  });

  describe('Given a non-existent repo "github:user/does-not-exist"', () => {
    describe('When running `vertz add github:user/does-not-exist`', () => {
      it('Then returns an error about repo not found (HTTP 404)', () => {});
    });
  });

  describe('Given a GitHub repo with package.json missing the "name" field', () => {
    describe('When running `vertz add github:user/no-name-repo`', () => {
      it('Then returns error: package.json in "user/no-name-repo" is missing the "name" field', () => {});
    });
  });
});
```

---

## Implementation Plan

### Phase 1: GitHub specifier parsing + resolution (thinnest E2E slice)

Parse `github:owner/repo[#ref]` specifiers, resolve refs to commit SHAs, download and extract GitHub tarballs, wire into `vertz add` and `vertz install`.

**Acceptance criteria:**

```typescript
describe('Phase 1: GitHub specifier parsing + resolution', () => {
  // Specifier parsing
  describe('Given the specifier "github:user/my-lib"', () => {
    describe('When parsing the package specifier', () => {
      it('Then returns a GitHubSpecifier with owner="user", repo="my-lib", ref_=None', () => {});
    });
  });

  describe('Given the specifier "github:user/my-lib#develop"', () => {
    describe('When parsing the package specifier', () => {
      it('Then returns a GitHubSpecifier with owner="user", repo="my-lib", ref_=Some("develop")', () => {});
    });
  });

  describe('Given the specifier "github:user/my-lib#v2.1.0"', () => {
    describe('When parsing the package specifier', () => {
      it('Then returns GitHubSpecifier with ref_=Some("v2.1.0")', () => {});
    });
  });

  describe('Given the specifier "github:user/my-lib#a1b2c3d"', () => {
    describe('When parsing the package specifier', () => {
      it('Then returns GitHubSpecifier with ref_=Some("a1b2c3d")', () => {});
    });
  });

  describe('Given the specifier "github:invalid"', () => {
    describe('When parsing the package specifier', () => {
      it('Then returns an error about missing owner/repo format', () => {});
    });
  });

  // Tarball prefix stripping
  describe('Given a GitHub tarball with prefix "my-lib-abc123/"', () => {
    describe('When extracting the tarball', () => {
      it('Then strips the single top-level directory prefix', () => {});
      it('Then files are extracted at the root level', () => {});
    });
  });

  // GitHub URL construction
  describe('Given owner="user", repo="my-lib", sha="abc123...40chars"', () => {
    describe('When constructing the tarball URL', () => {
      it('Then returns "https://codeload.github.com/user/my-lib/tar.gz/abc123...40chars"', () => {});
    });
  });

  // Lockfile round-trip
  describe('Given a lockfile entry with range "github:user/my-lib#v2.1.0"', () => {
    describe('When writing and re-reading the lockfile', () => {
      it('Then the entry is preserved with the correct spec key', () => {});
      it('Then the version field contains the full 40-char SHA', () => {});
      it('Then the resolved field contains the codeload URL', () => {});
    });
  });

  // Resolver integration
  describe('Given a dependency map with "my-lib": "github:user/my-lib#v2.1.0"', () => {
    describe('When resolving all dependencies', () => {
      it('Then the resolved graph contains the GitHub package', () => {});
      it('Then transitive npm deps from the GitHub package are also resolved', () => {});
    });
  });

  // Add command integration
  describe('Given a clean project directory', () => {
    describe('When running add() with "github:user/my-lib"', () => {
      it('Then package.json key uses the name from the repo package.json', () => {});
      it('Then package.json value is "github:user/my-lib"', () => {});
      it('Then vertz.lock contains the pinned SHA and codeload URL', () => {});
    });
  });

  // Add with GITHUB_TOKEN
  describe('Given GITHUB_TOKEN env var is set', () => {
    describe('When running add() with "github:user/my-lib"', () => {
      it('Then sends Authorization: Bearer header on GitHub API requests', () => {});
    });
  });

  // Abbreviated SHA resolution
  describe('Given the specifier "github:user/my-lib#a1b2c3d" (abbreviated SHA)', () => {
    describe('When resolving the ref via GitHub API', () => {
      it('Then the lockfile stores the full 40-char SHA', () => {});
    });
  });

  // Install from lockfile
  describe('Given a vertz.lock with a GitHub entry for my-lib@sha', () => {
    describe('When running install()', () => {
      it('Then downloads from the resolved codeload URL (no re-resolution)', () => {});
      it('Then the package is linked into node_modules/', () => {});
    });
  });

  // GitHub dep with transitive npm deps
  describe('Given a GitHub repo whose package.json has dependencies: { "zod": "^3.24.0" }', () => {
    describe('When running add() with "github:user/lib-with-deps"', () => {
      it('Then both the GitHub package and zod are installed in node_modules/', () => {});
      it('Then vertz.lock contains entries for both the GitHub package and zod', () => {});
    });
  });
});
```

**Changes (all paths relative to `native/vertz-runtime/src/pm/`):**

1. **`types.rs`** — New `GitHubSpecifier { owner, repo, ref_ }` struct. New `ParsedSpecifier` enum with `Npm { name, version_spec }` and `GitHub(GitHubSpecifier)` variants. Change `parse_package_specifier()` return type from `(&str, Option<&str>)` to `ParsedSpecifier`. All existing callers (`add()`, etc.) must match on the enum — this is a breaking internal refactor across the `add()` function.

2. **`github.rs`** (new) — `GitHubClient` with:
   - `resolve_ref(owner, repo, ref_) → Result<String>` — calls `GET /repos/{owner}/{repo}/commits/{ref}`, parses `response["sha"]` as string. 3 retries with exponential backoff. Reads `GITHUB_TOKEN` env var; if set, adds `Authorization: Bearer` header.
   - `tarball_url(owner, repo, sha) → String` — returns `https://codeload.github.com/{owner}/{repo}/tar.gz/{sha}`.
   - Error handling: HTTP 404 → "repository not found" or "ref not found"; HTTP 403 with `X-RateLimit-Remaining: 0` header → rate limit error with `GITHUB_TOKEN` guidance; HTTP 403 without rate limit → "access denied" error.

3. **`tarball.rs`** — Add `extract_github_tarball()` as a **separate function** (NOT modifying existing `strip_package_prefix()`). This function unconditionally strips the first path component from all entries, since GitHub tarballs use variable prefixes (`{repo}-{sha}/`, `{repo}-{tag}/`, `{repo}-{branch}/`). The existing npm `strip_package_prefix()` and `fetch_and_extract()` remain unchanged. The new function computes and returns the SHA-512 integrity of the tarball bytes for lockfile storage.

4. **`resolver.rs`** — Two changes:
   - **`resolve_recursive()`**: Add an early check at the top of the function body: if `effective_range.starts_with("github:")`, skip the `Range::parse()` / `resolve_version()` / registry path entirely. Instead, call `GitHubClient::resolve_ref()`, download the tarball via `extract_github_tarball()`, read the extracted `package.json` for transitive deps, and insert a `ResolvedPackage` into the graph with `version = full_sha`, `tarball_url = codeload_url`, `integrity = computed_sha512`. Then recursively resolve the transitive npm deps normally.
   - **`graph_to_lockfile()`**: The transitive dep matching loop uses `Range::parse()` + `Version::parse()` which fails for non-semver values. Add a fallback: for `github:` prefixed ranges, match by exact `range == dep_range` string equality instead of semver satisfaction. Without this fix, GitHub packages are silently dropped from the lockfile.

5. **`mod.rs`** (`add()`) — The main `add()` loop body needs an early fork based on `ParsedSpecifier`:
   ```
   match parse_package_specifier(package) {
     ParsedSpecifier::Npm { name, version_spec } => {
       // existing registry path (fetch_metadata, resolve_version, etc.)
     }
     ParsedSpecifier::GitHub(gh) => {
       // 1. GitHubClient::resolve_ref(gh.owner, gh.repo, gh.ref_) → sha
       // 2. extract_github_tarball(tarball_url, ...) → (extracted_path, integrity)
       // 3. read package.json from extracted_path → actual_name, deps
       // 4. insert into pkg.dependencies: actual_name → "github:{owner}/{repo}[#{ref}]"
       // 5. resolve transitive npm deps from the extracted package.json
     }
   }
   ```

6. **`mod.rs`** (`install()`) — Detect `github:` ranges in dep maps before passing to resolver. The resolver's `resolve_recursive()` handles the branching (see #4 above).

7. **`lockfile.rs`** — The serialization format needs no changes, but `graph_to_lockfile()` in `resolver.rs` needs the non-semver matching fix described in #4. The `parse_spec_key()` function already handles scoped names with `github:` ranges correctly.

8. **`output.rs`** — Add `github_resolve_started(specifier)` / `github_resolve_complete(name, sha_abbrev)` progress events. These run during `vertz add` so the user sees feedback while the GitHub API call is in-flight.

### Phase 2: Edge cases, display, and frozen validation

Polish the integration: proper display in `vertz list`/`vertz why`, frozen install validation, `--dev`/`--peer`/`--optional` flags, error messages.

**Acceptance criteria:**

```typescript
describe('Phase 2: Edge cases and display', () => {
  // Display
  describe('Given a project with a GitHub dependency', () => {
    describe('When running list()', () => {
      it('Then shows the GitHub specifier and abbreviated SHA', () => {});
      it('Then transitive deps of the GitHub package are listed', () => {});
    });
  });

  describe('Given a GitHub dependency in the dep chain', () => {
    describe('When running why("transitive-dep")', () => {
      it('Then shows the path through the GitHub package', () => {});
    });
  });

  // Frozen install
  describe('Given a vertz.lock missing a GitHub dep from package.json', () => {
    describe('When running install(frozen=true)', () => {
      it('Then returns an error about missing lockfile entry', () => {});
    });
  });

  // Dep-type flags
  describe('Given `vertz add github:user/lib --dev`', () => {
    describe('When add() completes', () => {
      it('Then package.json has the dep under devDependencies', () => {});
    });
  });

  // Error handling
  describe('Given a GitHub repo with no package.json', () => {
    describe('When running add()', () => {
      it('Then returns error: GitHub repo "user/repo" has no package.json', () => {});
    });
  });

  describe('Given a GitHub repo with package.json missing "name" field', () => {
    describe('When running add()', () => {
      it('Then returns error: package.json in "user/repo" is missing the "name" field', () => {});
    });
  });

  describe('Given a non-existent ref "github:user/lib#nonexistent"', () => {
    describe('When running add()', () => {
      it('Then returns error about ref not found (HTTP 404)', () => {});
    });
  });

  describe('Given GitHub API rate limit exceeded (403 + X-RateLimit-Remaining: 0)', () => {
    describe('When running add()', () => {
      it('Then returns error with rate limit message and GITHUB_TOKEN guidance', () => {});
    });
  });

  describe('Given GitHub API returns 403 without rate limit headers', () => {
    describe('When running add()', () => {
      it('Then returns error about access denied (distinct from rate limit)', () => {});
    });
  });

  // Scoped packages
  describe('Given a GitHub repo with scoped package name "@org/utils"', () => {
    describe('When running list()', () => {
      it('Then shows @org/utils@github:user/utils-repo (a1b2c3d)', () => {});
    });
  });
});
```

**Changes (all paths relative to `native/vertz-runtime/src/pm/`):**

1. **`mod.rs`** (`list()`) — Format GitHub deps as `name@github:owner/repo#ref (sha-abbrev)`. Handle scoped names.
2. **`mod.rs`** (`why()`) — Include GitHub dep formatting in path display.
3. **`mod.rs`** (`install()` frozen mode) — Extend `verify_frozen_deps()` to handle GitHub ranges. Match by `github:` prefix and exact string comparison (not semver).
4. **`mod.rs`** (`add()`) — Wire `--dev`, `--peer`, `--optional` flags for GitHub specifiers (reuse existing flag handling from the npm path).
5. **`github.rs`** — Structured error messages:
   - Missing package.json: `GitHub repo "{owner}/{repo}" has no package.json`
   - Missing name field: `package.json in "{owner}/{repo}" is missing the "name" field`
   - Ref not found (404): `ref "{ref}" not found in github:{owner}/{repo}`
   - Repo not found (404): `repository "github:{owner}/{repo}" not found`
   - Rate limit (403 + `X-RateLimit-Remaining: 0`): `GitHub API rate limit exceeded. Set GITHUB_TOKEN env var to increase from 60 to 5000 requests/hour.`
   - Access denied (403 without rate limit): `access denied to github:{owner}/{repo} — repository may be private (private repos not yet supported)`
