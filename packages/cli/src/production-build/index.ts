/**
 * Build Module - Production Build Orchestrator
 *
 * Handles the complete production build pipeline:
 * 1. Codegen - runs the full pipeline (DB types, route types, OpenAPI)
 * 2. Typecheck - runs TypeScript compiler for type checking
 * 3. Bundle - bundles the server for production (Bun/esbuild)
 * 4. Manifest - generates build manifest for vertz publish
 */

export { BuildOrchestrator, createBuildOrchestrator } from './orchestrator';
export type { BuildConfig, BuildManifest, BuildResult, BuildStageStatus } from './types';
