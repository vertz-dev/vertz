/**
 * Filter operator types — re-exported from inference.ts for convenience.
 *
 * The canonical definitions live in inference.ts to keep the type graph simple.
 * This module exists as a dedicated entry point for consumers who only need
 * filter-related types.
 */
export type { FilterType, OrderByType } from './inference';
