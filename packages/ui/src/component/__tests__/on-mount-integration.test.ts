/**
 * Integration tests for deferred onMount — exercises the full runtime behavior
 * by simulating what the compiler generates (push/flush/discard mount frames
 * around JSX-like setup code).
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { popScope, pushScope, runCleanups } from '../../runtime/disposal';
import { registerSSRResolver } from '../../ssr/ssr-render-context';
import { __discardMountFrame, __flushMountFrame, __pushMountFrame, onMount } from '../lifecycle';

describe('Feature: Deferred onMount', () => {
  describe('Given a component with ref and onMount', () => {
    describe('When the component is rendered', () => {
      test('Then ref.current is available inside onMount callback', () => {
        // Simulate: component creates a ref, registers onMount, then JSX sets it
        let capturedValue: string | undefined;
        const fakeRef = { current: undefined as string | undefined };

        // Simulated compiled component:
        __pushMountFrame();
        try {
          onMount(() => {
            capturedValue = fakeRef.current;
          });

          // JSX IIFE — sets the ref
          fakeRef.current = 'element';

          __flushMountFrame();
        } catch (e) {
          __discardMountFrame();
          throw e;
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
        __pushMountFrame();
        try {
          onMount(() => {
            return () => {
              cleaned = true;
            };
          });

          __flushMountFrame();
        } catch (e) {
          __discardMountFrame();
          throw e;
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

        // Parent component start
        __pushMountFrame();
        try {
          onMount(() => {
            order.push('parent');
          });

          // Child component (called during parent's JSX IIFE)
          __pushMountFrame();
          try {
            onMount(() => {
              order.push('child');
            });
            // Child JSX
            __flushMountFrame(); // flushes child
          } catch (e) {
            __discardMountFrame();
            throw e;
          }

          // Parent JSX continues...
          __flushMountFrame(); // flushes parent
        } catch (e) {
          __discardMountFrame();
          throw e;
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
        __pushMountFrame();
        try {
          onMount(() => {
            ran = true;
          });
          __flushMountFrame();
        } catch (e) {
          __discardMountFrame();
          throw e;
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

        // Simulate parent component's JSX IIFE calling child components in a loop
        __pushMountFrame(); // parent
        try {
          for (const id of items) {
            // Each child component
            __pushMountFrame();
            try {
              onMount(() => {
                mounted.push(id);
              });
              __flushMountFrame();
            } catch (e) {
              __discardMountFrame();
              throw e;
            }
          }
          __flushMountFrame(); // parent
        } catch (e) {
          __discardMountFrame();
          throw e;
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

        __pushMountFrame();
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

          expect(() => __flushMountFrame()).toThrow('boom');
        } catch (e) {
          __discardMountFrame();
          if (!(e instanceof Error && e.message === 'boom')) throw e;
        }

        expect(firstRan).toBe(true);
        expect(thirdRan).toBe(true);
      });
    });
  });

  describe('Given a component body that throws before flush', () => {
    describe('When the error propagates', () => {
      test('Then the mount frame is cleaned up (no leak)', () => {
        // Component throws before reaching __flushMountFrame
        expect(() => {
          __pushMountFrame();
          try {
            onMount(() => {
              /* should never run */
            });
            throw new Error('component body error');
          } catch (e) {
            __discardMountFrame();
            throw e;
          }
        }).toThrow('component body error');

        // Stack should be clean — next component should work fine
        let ran = false;
        __pushMountFrame();
        try {
          onMount(() => {
            ran = true;
          });
          __flushMountFrame();
        } catch (e) {
          __discardMountFrame();
          throw e;
        }
        expect(ran).toBe(true);
      });
    });
  });
});
