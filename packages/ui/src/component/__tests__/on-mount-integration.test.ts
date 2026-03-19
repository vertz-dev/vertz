/**
 * Integration tests for deferred onMount — exercises the full runtime behavior
 * by simulating what the compiler generates (push/flush/discard mount frames
 * around JSX-like setup code).
 *
 * Each test uses the exact compiler-generated pattern:
 *   const __mfDepth = __pushMountFrame();
 *   try {
 *     ... body ...
 *     const __mfResult = <expr>;
 *     __flushMountFrame();
 *     return __mfResult;
 *   } catch (__mfErr) {
 *     __discardMountFrame(__mfDepth);
 *     throw __mfErr;
 *   }
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { popScope, pushScope, runCleanups } from '../../runtime/disposal';
import { registerSSRResolver } from '../../ssr/ssr-render-context';
import { __discardMountFrame, __flushMountFrame, __pushMountFrame, onMount } from '../lifecycle';

describe('Feature: Deferred onMount', () => {
  describe('Given a component with ref and onMount', () => {
    describe('When the component is rendered', () => {
      test('Then ref.current is available inside onMount callback', () => {
        let capturedValue: string | undefined;
        const fakeRef = { current: undefined as string | undefined };

        const __mfDepth = __pushMountFrame();
        try {
          onMount(() => {
            capturedValue = fakeRef.current;
          });
          fakeRef.current = 'element';
          __flushMountFrame();
        } catch (__mfErr) {
          __discardMountFrame(__mfDepth);
          throw __mfErr;
        }

        expect(capturedValue).toBe('element');
      });
    });
  });

  describe('Given a component with onMount cleanup', () => {
    describe('When the component is unmounted', () => {
      test('Then cleanup function runs', () => {
        let cleaned = false;

        const scope = pushScope();
        const __mfDepth = __pushMountFrame();
        try {
          onMount(() => {
            return () => {
              cleaned = true;
            };
          });
          __flushMountFrame();
        } catch (__mfErr) {
          __discardMountFrame(__mfDepth);
          throw __mfErr;
        }
        popScope();

        expect(cleaned).toBe(false);
        runCleanups(scope);
        expect(cleaned).toBe(true);
      });
    });
  });

  describe('Given nested components with onMount', () => {
    describe('When both are rendered', () => {
      test('Then child onMount runs before parent onMount', () => {
        const order: string[] = [];

        const parentDepth = __pushMountFrame();
        try {
          onMount(() => order.push('parent'));

          // Child component (called during parent's JSX IIFE)
          const childDepth = __pushMountFrame();
          try {
            onMount(() => order.push('child'));
            __flushMountFrame();
          } catch (__mfErr) {
            __discardMountFrame(childDepth);
            throw __mfErr;
          }

          __flushMountFrame();
        } catch (__mfErr) {
          __discardMountFrame(parentDepth);
          throw __mfErr;
        }

        expect(order).toEqual(['child', 'parent']);
      });
    });
  });

  describe('Given onMount called outside a component', () => {
    describe('When invoked directly', () => {
      test('Then runs immediately (backward compat)', () => {
        let ran = false;
        onMount(() => {
          ran = true;
        });
        expect(ran).toBe(true);
      });
    });
  });

  describe('Given SSR context', () => {
    afterEach(() => {
      registerSSRResolver(null);
    });

    describe('When a component with onMount is rendered', () => {
      test('Then onMount callback is not executed', () => {
        const fakeCtx = { url: '/' } as any;
        registerSSRResolver(() => fakeCtx);

        let ran = false;
        const __mfDepth = __pushMountFrame();
        try {
          onMount(() => {
            ran = true;
          });
          __flushMountFrame();
        } catch (__mfErr) {
          __discardMountFrame(__mfDepth);
          throw __mfErr;
        }

        expect(ran).toBe(false);
      });
    });
  });

  describe('Given components rendered inside .map()', () => {
    describe('When each component has onMount', () => {
      test('Then each component gets its own mount frame', () => {
        const mounted: string[] = [];
        const items = ['a', 'b', 'c'];

        const parentDepth = __pushMountFrame();
        try {
          for (const id of items) {
            const childDepth = __pushMountFrame();
            try {
              onMount(() => mounted.push(id));
              __flushMountFrame();
            } catch (__mfErr) {
              __discardMountFrame(childDepth);
              throw __mfErr;
            }
          }
          __flushMountFrame();
        } catch (__mfErr) {
          __discardMountFrame(parentDepth);
          throw __mfErr;
        }

        expect(mounted).toEqual(['a', 'b', 'c']);
      });
    });
  });

  describe('Given multiple onMount calls where one throws', () => {
    describe('When the component is rendered', () => {
      test('Then all callbacks execute and the first error is rethrown', () => {
        let firstRan = false;
        let thirdRan = false;

        // Use the real compiler pattern: flush throws → propagates to catch → discard
        const __mfDepth = __pushMountFrame();
        try {
          onMount(() => {
            firstRan = true;
          });
          onMount(() => {
            throw new Error('boom');
          });
          onMount(() => {
            thirdRan = true;
          });
          __flushMountFrame(); // throws 'boom'
          // Never reached — flush threw
        } catch (__mfErr) {
          __discardMountFrame(__mfDepth); // no-op — flush already popped
          // Don't rethrow — we're testing the error was propagated
          expect((__mfErr as Error).message).toBe('boom');
        }

        expect(firstRan).toBe(true);
        expect(thirdRan).toBe(true);
      });
    });
  });

  describe('Given a component body that throws before flush', () => {
    describe('When the error propagates', () => {
      test('Then the mount frame is cleaned up (no leak)', () => {
        expect(() => {
          const __mfDepth = __pushMountFrame();
          try {
            onMount(() => {
              /* should never run */
            });
            throw new Error('component body error');
          } catch (__mfErr) {
            __discardMountFrame(__mfDepth); // pops the frame
            throw __mfErr;
          }
        }).toThrow('component body error');

        // Stack should be clean — next component should work fine
        let ran = false;
        const __mfDepth = __pushMountFrame();
        try {
          onMount(() => {
            ran = true;
          });
          __flushMountFrame();
        } catch (__mfErr) {
          __discardMountFrame(__mfDepth);
          throw __mfErr;
        }
        expect(ran).toBe(true);
      });
    });
  });

  describe('Given nested child where deferred callback throws', () => {
    describe('When discard uses depth tracking', () => {
      test('Then parent frame is NOT corrupted', () => {
        const order: string[] = [];

        const parentDepth = __pushMountFrame();
        try {
          onMount(() => order.push('parent'));

          // Child component — its callback throws
          const childDepth = __pushMountFrame();
          try {
            onMount(() => {
              throw new Error('child error');
            });
            __flushMountFrame(); // pops child frame, throws
          } catch (__mfErr) {
            __discardMountFrame(childDepth); // no-op — already popped
            // Swallow child error for this test
          }

          // Parent frame should still be intact
          __flushMountFrame();
        } catch (__mfErr) {
          __discardMountFrame(parentDepth);
          throw __mfErr;
        }

        // Parent callback ran despite child error
        expect(order).toEqual(['parent']);
      });
    });
  });
});
