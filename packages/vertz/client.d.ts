/**
 * Vertz client-side runtime type augmentations.
 *
 * The canonical augmentation lives in `@vertz/ui/client` so that apps which
 * install `@vertz/ui` directly (without the meta-package) can opt into the
 * same `ImportMeta.hot` types. This file re-exports it so `vertz/client`
 * stays a valid tsconfig entry — both subpaths resolve to the same shape
 * and cannot drift.
 *
 * Include in your tsconfig.json:
 *   "types": ["vertz/client"]
 *
 * Or add a triple-slash reference:
 *   /// <reference types="vertz/client" />
 */

/// <reference types="@vertz/ui/client" />

export {};
