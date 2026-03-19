import { describe, expect, it } from 'bun:test';
import { compile } from '../../compiler';

/**
 * Tests for the MountFrameTransformer.
 * Uses the full compile() pipeline since the mount frame transform
 * depends on JSX transform running first.
 */
describe('MountFrameTransformer', () => {
  describe('Given a component with a single return statement', () => {
    it('Then wraps body with __pushMountFrame / try-catch / __flushMountFrame', () => {
      const result = compile(
        `function MyComponent() {
  return <div>Hello</div>;
}`,
      );
      expect(result.code).toContain('__pushMountFrame()');
      expect(result.code).toContain('__flushMountFrame()');
      expect(result.code).toContain('__discardMountFrame()');
      // The return should be wrapped: const __result = ...; __flushMountFrame(); return __result;
      expect(result.code).toContain('const __mfResult');
      expect(result.code).toContain('return __mfResult');
    });
  });

  describe('Given a component with multiple return statements (early returns)', () => {
    it('Then inserts __flushMountFrame before each return', () => {
      const result = compile(
        `function MyComponent({ error }: { error?: boolean }) {
  if (error) return <div>Error</div>;
  return <div>OK</div>;
}`,
      );
      // Both returns should have flush before them
      const flushCount = (result.code.match(/__flushMountFrame\(\)/g) ?? []).length;
      expect(flushCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Given an arrow component with expression body', () => {
    it('Then converts to block body with mount frame wrapping', () => {
      const result = compile(`const MyComponent = () => <div>Hello</div>;`);
      expect(result.code).toContain('__pushMountFrame()');
      expect(result.code).toContain('__flushMountFrame()');
    });
  });

  describe('Given a component that does NOT use onMount', () => {
    it('Then still injects mount frame (unconditional)', () => {
      const result = compile(
        `function MyComponent() {
  return <div>Hello</div>;
}`,
      );
      expect(result.code).toContain('__pushMountFrame()');
      expect(result.code).toContain('__flushMountFrame()');
    });
  });

  describe('Given auto-imports', () => {
    it('Then __pushMountFrame, __flushMountFrame, and __discardMountFrame are imported from @vertz/ui/internals', () => {
      const result = compile(
        `function MyComponent() {
  return <div>Hello</div>;
}`,
      );
      expect(result.code).toContain("from '@vertz/ui/internals'");
      expect(result.code).toContain('__pushMountFrame');
      expect(result.code).toContain('__flushMountFrame');
      expect(result.code).toContain('__discardMountFrame');
    });
  });
});
