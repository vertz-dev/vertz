# Phase 9: `vertz routes` Command

**Prerequisites:** [Phase 8 -- `vertz generate` Command](./phase-08-generate-command.md)

**Goal:** Implement the route table display command with the RouteTable component, supporting table, tree, and JSON output formats.

---

## What to Implement

1. **RouteTable component** -- `src/ui/components/RouteTable.tsx` for pretty-printed route listing
2. **Routes command** -- `src/commands/routes.ts` with format and module filter options
3. **Command registration** -- Wire `routes` command into `src/cli.ts` (replace stub)

---

## Files to Create/Modify

### New Files

```
packages/cli/src/
├── commands/
│   └── routes.ts
└── ui/
    └── components/
        └── RouteTable.tsx
```

### Test Files

```
packages/cli/src/
├── commands/
│   └── __tests__/
│       └── routes.test.ts
└── ui/
    └── __tests__/
        └── components/
            └── route-table.test.tsx
```

### Modified Files

- `src/cli.ts` -- Replace routes command stub with real implementation

---

## Expected Behaviors to Test

### RouteTable Component (`src/ui/__tests__/components/route-table.test.tsx`)

#### Table format

- [ ] Renders column headers: Method, Path, Operation ID, Middleware
- [ ] Renders each route as a row
- [ ] Colors HTTP methods according to theme (GET=green, POST=blue, DELETE=red, etc.)
- [ ] Groups routes by module when `groupByModule` is true
- [ ] Shows module name as group header
- [ ] Handles routes with no middleware (shows empty cell)
- [ ] Handles routes with multiple middleware (comma-separated)
- [ ] Handles empty routes array (shows "No routes found")

#### Tree format

- [ ] Renders routes as a tree structure
- [ ] Groups by module at the top level
- [ ] Shows method and path as leaf nodes
- [ ] Uses tree-drawing characters

#### General

- [ ] Renders total route count header
- [ ] Aligns columns correctly (padding/alignment)

### Routes Command (`src/commands/__tests__/routes.test.ts`)

Use a mock compiler.

#### Core behavior

- [ ] Loads config and creates compiler
- [ ] Calls `compiler.analyze()` to get IR
- [ ] Calls `buildRouteTable(ir)` to extract routes
- [ ] Renders RouteTable component with the routes

#### Format options

- [ ] Default format is `table`
- [ ] `--format table` renders the table component
- [ ] `--format json` outputs valid JSON to stdout
- [ ] `--format json` includes method, path, operationId, moduleName, middleware for each route
- [ ] `--format tree` renders the tree format

#### Module filter

- [ ] `--module <name>` filters routes to only the specified module
- [ ] Shows all modules when `--module` is not provided
- [ ] Shows "No routes found for module 'xyz'" when module has no routes

#### Error handling

- [ ] Handles compilation errors gracefully (shows diagnostics)
- [ ] Exits with code 1 on compilation errors

---

## Quality Gates

After each GREEN:

```bash
bunx biome check --write packages/cli/src/commands/ packages/cli/src/ui/
bun run typecheck
```

---

## Notes

- The `buildRouteTable()` function comes from `@vertz/compiler`. It extracts route information from the IR into a flat list.
- Column alignment in the table format should be calculated dynamically based on the longest values in each column.
- The tree format is a secondary priority. If time is limited, implement table and JSON first, then tree.
- This command does not use interactive prompts -- `--module` is an optional filter, not a required parameter.
- The `--format json` output is useful for piping to other tools (`vertz routes --format json | jq '.[] | select(.method == "GET")'`).
