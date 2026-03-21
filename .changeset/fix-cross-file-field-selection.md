---
'@vertz/ui-server': patch
---

Fix auto field selection not tracking field accesses in child components. Previously, when query data was passed to child components via props, the child's field accesses were silently missed, causing the query to under-fetch (only fields accessed directly in the parent were included in `select`).

**What changed:**
- Cross-file field resolution now falls back to fetching all fields (opaque) when a child component's field accesses can't be determined, instead of silently under-fetching
- Barrel file re-exports (`export { Foo } from './bar'`) are now followed to find the actual component definition
- Renamed re-exports (`export { Internal as Public }`) are handled correctly
- The plugin pre-pass now scans `.ts` files (not just `.tsx`) to capture barrel file re-exports
- HMR updates now process `.ts` file changes for field selection manifest updates
