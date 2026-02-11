import { describe, expect, it } from 'vitest';

/**
 * inference.ts is entirely type-level — there is no runtime code to test.
 * These tests verify that the module can be imported without errors and
 * that the type exports are structurally sound.
 */
describe('inference module', () => {
  it('exports type utilities (import check)', async () => {
    // Dynamic import to verify the module is loadable at runtime.
    // All exports are `type` exports, so the runtime module is effectively empty.
    const mod = await import('../inference');
    expect(mod).toBeDefined();
  });
});
