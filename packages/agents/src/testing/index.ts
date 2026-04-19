// @vertz/agents/testing — test-only helpers for durable resume scenarios.
//
// These are NOT shipped in the main `@vertz/agents` entrypoint because they
// exist solely to simulate failure modes in tests. Import from
// '@vertz/agents/testing'.

export { crashAfterToolResults } from './crash-harness';
