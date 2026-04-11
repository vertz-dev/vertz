# Phase 5: Cleanup

## Context

This is Phase 5 (final) of replacing bunup (#2498). All packages are now migrated to `@vertz/build`. This phase removes all remaining bunup references, updates build infrastructure, and verifies the full monorepo.

Design doc: `plans/2498-replace-bunup.md`

## Tasks

### Task 1: Remove bunup from all package.json files

**Files:**
- All `packages/*/package.json` files that still list `bunup` as a dependency
- `bun.lock` (regenerated)

**What to implement:**

1. Remove `bunup` from `devDependencies` in every `package.json`
2. Remove `@bunup/dts` if listed anywhere
3. Run `vtz install` to regenerate the lock file
4. Verify no `bunup` references remain in any `package.json`

**Acceptance criteria:**
- [ ] No `package.json` in the repo references `bunup` or `@bunup/*`
- [ ] `vtz install` succeeds with clean lock file
- [ ] `vtz run build` still succeeds

---

### Task 2: Update turbo.json and build infrastructure

**Files:**
- `turbo.json` (modified)
- `CLAUDE.md` (modified — if build instructions reference bunup)

**What to implement:**

1. Update `turbo.json` build task inputs: change `"bunup.config.ts"` to `"build.config.ts"`
2. Check `CLAUDE.md` and other docs for `bunup` references — update or remove
3. Check CI workflows (`.github/workflows/`) for `bunup` references

**Acceptance criteria:**
- [ ] `turbo.json` references `build.config.ts` (not `bunup.config.ts`)
- [ ] No docs or CI configs reference `bunup`
- [ ] Turbo caching works correctly with new input file name

---

### Task 3: Evaluate and clean up runtime shims

**Files:**
- `native/vtz/src/runtime/module_loader.rs` (potentially modified)

**What to implement:**

1. Build all packages with `@vertz/build`
2. Search all `dist/` output for `__require` and `createRequire` patterns
3. If esbuild's ESM output does NOT generate these patterns:
   - The `createRequire` shim at `module_loader.rs:1465-1478` is dead code — remove it
   - Create a follow-up issue if removal requires more testing
4. If esbuild still generates these patterns, document why and keep the shim

Also check: `native-compiler.ts` `compileFallback` — if it still uses `Bun.Transpiler`, create a follow-up issue to replace it (out of scope for this ticket).

**Acceptance criteria:**
- [ ] `createRequire` shim status is documented (kept or removed with justification)
- [ ] If removed: Rust tests pass, runtime still works
- [ ] If kept: comment explains why it's still needed
- [ ] Follow-up issue created for any remaining Bun-specific code

---

### Task 4: Final monorepo validation

**Files:**
- (no new files — validation only)

**What to implement:**

Full end-to-end validation:
1. Clean build: `rm -rf packages/*/dist && vtz run build`
2. `vtz run typecheck` — full monorepo type check
3. `vtz test` — full test suite
4. `vtz run lint` — lint check
5. Verify no `bunup` references remain anywhere in the repo (source files, configs, docs)

```bash
# Verify no bunup references
grep -r "bunup" packages/ --include="*.ts" --include="*.json" --include="*.md" -l
# Should return empty
```

**Acceptance criteria:**
- [ ] Clean build succeeds for all packages
- [ ] `vtz run typecheck` passes
- [ ] `vtz test` passes
- [ ] `vtz run lint` passes
- [ ] No `bunup` references remain in source, configs, or docs
- [ ] No `bunup.config.ts` files exist anywhere

---

### Task 5: Changeset and commit

**Files:**
- `.changeset/<generated>.md` (new)

**What to implement:**

Create a changeset for this change. Since this is an internal build tool change with no public API impact, it's a patch for all affected packages. The changeset should note:
- Build tool changed from bunup to @vertz/build (esbuild + tsc)
- No public API changes
- Build output format unchanged (ESM + DTS)

**Acceptance criteria:**
- [ ] Changeset file created with patch severity
- [ ] All affected packages listed
- [ ] Description accurately reflects the change
