import type { ComponentRegistry } from './component-registry';
/**
 * Client entry point for atomic per-component hydration.
 *
 * Scans the DOM for elements with `data-v-id` markers placed by the SSR pass,
 * deserializes their props, and applies the appropriate hydration strategy.
 *
 * Components without `data-v-id` markers are static and ship zero JS.
 *
 * Elements that have already been hydrated (marked with `data-v-hydrated`)
 * are skipped to prevent double hydration when `hydrate()` is called
 * multiple times on the same page.
 */
export declare function hydrate(registry: ComponentRegistry): void;
//# sourceMappingURL=hydrate.d.ts.map
