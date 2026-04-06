/**
 * Dev Orchestrator — main entry point for direct execution.
 *
 * For `vtz dev`, the server entry is at src/api/server.ts.
 * This file re-exports everything and adds the orchestrator wiring
 * for production use (with agents, sandbox, GitHub).
 */
export { default } from './api/server';
export { createOrchestrator, createApp } from './orchestrator';
export type { OrchestratorOptions, Orchestrator } from './orchestrator';
