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
      expect(result.code).toContain('__discardMountFrame(__mfDepth)');
      expect(result.code).toContain('const __mfResult0');
      expect(result.code).toContain('return __mfResult0');
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
      const flushCount = (result.code.match(/__flushMountFrame\(\)/g) ?? []).length;
      expect(flushCount).toBeGreaterThanOrEqual(2);
    });

    it('Then uses unique variable names per return (__mfResult0, __mfResult1)', () => {
      const result = compile(
        `function MyComponent({ error }: { error?: boolean }) {
  if (error) { return <div>Error</div>; }
  return <div>OK</div>;
}`,
      );
      expect(result.code).toContain('__mfResult0');
      expect(result.code).toContain('__mfResult1');
    });
  });

  describe('Given a braceless if with early return', () => {
    it('Then wraps the replacement in braces to produce valid JS', () => {
      const result = compile(
        `function MyComponent({ error }: { error?: boolean }) {
  if (error) return <div>Error</div>;
  return <div>OK</div>;
}`,
      );
      // The braceless if return should be wrapped in { } to produce valid JS
      // (props get renamed to __props.error by the props transform)
      expect(result.code).toMatch(/if \(.+\) \{ const __mfResult0/);
      // The final return at block level should NOT have extra braces
      expect(result.code).toContain('const __mfResult1 =');
    });
  });

  describe('Given a bare return statement', () => {
    it('Then inserts __flushMountFrame before the bare return', () => {
      const result = compile(
        `function MyComponent({ show }: { show?: boolean }) {
  if (!show) return;
  return <div>Content</div>;
}`,
      );
      // Bare return should have flush before it
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

  describe('Given depth-based discard', () => {
    it('Then generates __mfDepth = __pushMountFrame() and __discardMountFrame(__mfDepth)', () => {
      const result = compile(
        `function MyComponent() {
  return <div>Hello</div>;
}`,
      );
      expect(result.code).toContain('const __mfDepth = __pushMountFrame()');
      expect(result.code).toContain('__discardMountFrame(__mfDepth)');
    });
  });
});
