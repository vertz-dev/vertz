import { describe, expect, it } from '@vertz/test';
import { onCleanup } from '../../runtime/disposal';
import { domEffect, signal } from '../../runtime/signal';
import { __conditional } from '../conditional';

describe('__conditional', () => {
  it('produces anchor comment + content + end marker comment (no span wrapper)', () => {
    const show = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => {
        const span = document.createElement('span');
        span.textContent = 'visible';
        return span;
      },
      () => null,
    );
    container.appendChild(fragment);

    // Collect all comment nodes
    const comments: Comment[] = [];
    for (const node of container.childNodes) {
      if (node.nodeType === 8) comments.push(node as Comment);
    }
    // Should have anchor + end marker
    expect(comments.length).toBe(2);
    expect(comments[0].data).toBe('conditional');
    expect(comments[1].data).toBe('/conditional');

    // No span with display:contents
    const spans = container.querySelectorAll('span');
    for (const span of spans) {
      expect(span.style.display).not.toBe('contents');
    }
  });

  it('branch switch keeps content between markers', () => {
    const show = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => {
        const span = document.createElement('span');
        span.textContent = 'yes';
        return span;
      },
      () => {
        const span = document.createElement('span');
        span.textContent = 'no';
        return span;
      },
    );
    container.appendChild(fragment);

    // Verify structure: anchor, content, end marker
    expect(container.childNodes.length).toBe(3);
    expect((container.childNodes[0] as Comment).data).toBe('conditional');
    expect(container.childNodes[1].textContent).toBe('yes');
    expect((container.childNodes[2] as Comment).data).toBe('/conditional');

    // Switch branch
    show.value = false;

    // Structure preserved: anchor, NEW content, end marker
    expect(container.childNodes.length).toBe(3);
    expect((container.childNodes[0] as Comment).data).toBe('conditional');
    expect(container.childNodes[1].textContent).toBe('no');
    expect((container.childNodes[2] as Comment).data).toBe('/conditional');
  });

  // Regression guard: the compiler wraps `children ?? value` in __conditional,
  // but `children` is itself a reactive getter — `() => __staticText("Apple")`.
  // So trueFn() returns that inner thunk, not a Node. The conditional must
  // unwrap thunks before inserting — otherwise the function's source code
  // gets stringified and ships as visible text (see component-docs Select bug).
  it('unwraps function branch results (thunked children returning a Node)', () => {
    const show = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () =>
        (() => {
          const span = document.createElement('span');
          span.textContent = 'Apple';
          return span;
        }) as unknown as Node,
      () => null,
    );
    container.appendChild(fragment);
    expect(container.textContent).toBe('Apple');
    expect(container.innerHTML).not.toContain('=>');
    expect(container.innerHTML).not.toContain('function');
  });

  it('unwraps function branch results that return primitives', () => {
    const show = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => (() => 'Banana') as unknown as Node,
      () => null,
    );
    container.appendChild(fragment);
    expect(container.textContent).toBe('Banana');
    expect(container.innerHTML).not.toContain('=>');
  });

  it('null branch leaves only anchor and end marker (adjacent)', () => {
    const show = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => null as unknown as Node,
      () => {
        const span = document.createElement('span');
        span.textContent = 'fallback';
        return span;
      },
    );
    container.appendChild(fragment);

    // Null branch: only anchor + end marker
    expect(container.childNodes.length).toBe(2);
    expect((container.childNodes[0] as Comment).data).toBe('conditional');
    expect((container.childNodes[1] as Comment).data).toBe('/conditional');

    // Switch to non-null branch
    show.value = false;
    expect(container.childNodes.length).toBe(3);
    expect(container.textContent).toBe('fallback');
  });

  it('renders the true branch when condition is true', () => {
    const show = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => {
        const span = document.createElement('span');
        span.textContent = 'visible';
        return span;
      },
      () => {
        const span = document.createElement('span');
        span.textContent = 'hidden';
        return span;
      },
    );
    container.appendChild(fragment);
    // After effect runs: anchor comment + true branch node
    expect(container.textContent).toBe('visible');
  });

  it('switches to false branch when condition changes', () => {
    const show = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => {
        const span = document.createElement('span');
        span.textContent = 'yes';
        return span;
      },
      () => {
        const span = document.createElement('span');
        span.textContent = 'no';
        return span;
      },
    );
    container.appendChild(fragment);
    expect(container.textContent).toBe('yes');
    show.value = false;
    expect(container.textContent).toBe('no');
  });

  it('onCleanup handlers fire when condition changes from true to false', () => {
    const show = signal(true);
    let cleanedUp = false;
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => {
        onCleanup(() => {
          cleanedUp = true;
        });
        const span = document.createElement('span');
        span.textContent = 'yes';
        return span;
      },
      () => {
        const span = document.createElement('span');
        span.textContent = 'no';
        return span;
      },
    );
    container.appendChild(fragment);
    expect(cleanedUp).toBe(false);
    show.value = false;
    expect(cleanedUp).toBe(true);
  });

  it('onCleanup handlers fire when condition changes from false to true', () => {
    const show = signal(false);
    let cleanedUp = false;
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => {
        const span = document.createElement('span');
        span.textContent = 'yes';
        return span;
      },
      () => {
        onCleanup(() => {
          cleanedUp = true;
        });
        const span = document.createElement('span');
        span.textContent = 'no';
        return span;
      },
    );
    container.appendChild(fragment);
    expect(cleanedUp).toBe(false);
    show.value = true;
    expect(cleanedUp).toBe(true);
  });

  it('effects inside branch are disposed when branch swaps out', () => {
    const show = signal(true);
    const counter = signal(0);
    let effectRunCount = 0;
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => {
        const span = document.createElement('span');
        span.textContent = 'yes';
        domEffect(() => {
          counter.value;
          effectRunCount++;
        });
        return span;
      },
      () => {
        const span = document.createElement('span');
        span.textContent = 'no';
        return span;
      },
    );
    container.appendChild(fragment);
    // Effect ran once during initial render
    expect(effectRunCount).toBe(1);

    // Swap to false branch
    show.value = false;

    // Reset and trigger counter — the old effect should NOT run
    effectRunCount = 0;
    counter.value = 1;
    expect(effectRunCount).toBe(0);
  });

  it('nested __conditional inside branch is fully disposed on outer swap', () => {
    const outerShow = signal(true);
    const innerShow = signal(true);
    const counter = signal(0);
    let innerEffectRuns = 0;
    const container = document.createElement('div');

    const fragment = __conditional(
      () => outerShow.value,
      () => {
        // The true branch contains a nested __conditional with an effect
        const nested = __conditional(
          () => innerShow.value,
          () => {
            const span = document.createElement('span');
            span.textContent = 'inner-yes';
            domEffect(() => {
              counter.value;
              innerEffectRuns++;
            });
            return span;
          },
          () => {
            const span = document.createElement('span');
            span.textContent = 'inner-no';
            return span;
          },
        );
        return nested;
      },
      () => {
        const span = document.createElement('span');
        span.textContent = 'outer-no';
        return span;
      },
    );
    container.appendChild(fragment);
    expect(innerEffectRuns).toBe(1);

    // Swap outer to false — inner conditional and its effects should be disposed
    outerShow.value = false;

    innerEffectRuns = 0;
    counter.value = 1;
    expect(innerEffectRuns).toBe(0);
  });

  it('dispose() runs cleanups for the currently active branch', () => {
    const show = signal(true);
    const counter = signal(0);
    let effectRunCount = 0;
    let cleanedUp = false;
    const container = document.createElement('div');

    const fragment = __conditional(
      () => show.value,
      () => {
        const span = document.createElement('span');
        span.textContent = 'yes';
        onCleanup(() => {
          cleanedUp = true;
        });
        domEffect(() => {
          counter.value;
          effectRunCount++;
        });
        return span;
      },
      () => {
        const span = document.createElement('span');
        span.textContent = 'no';
        return span;
      },
    );
    container.appendChild(fragment);
    expect(effectRunCount).toBe(1);
    expect(cleanedUp).toBe(false);

    // Dispose the conditional directly
    fragment.dispose();

    expect(cleanedUp).toBe(true);

    // Effect should no longer run
    effectRunCount = 0;
    counter.value = 1;
    expect(effectRunCount).toBe(0);
  });

  it('handles null from true branch without crashing, uses comment placeholder', () => {
    const show = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => null as unknown as Node, // null branch
      () => {
        const span = document.createElement('span');
        span.textContent = 'hidden';
        return span;
      },
    );
    container.appendChild(fragment);

    // Should have anchor comment + null placeholder comment
    expect(container.childNodes.length).toBeGreaterThanOrEqual(2);

    // Verify no crash and we can switch branches
    show.value = false;
    expect(container.textContent).toBe('hidden');
  });

  it('handles null from false branch without crashing, uses comment placeholder', () => {
    const show = signal(false);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => {
        const span = document.createElement('span');
        span.textContent = 'visible';
        return span;
      },
      () => null as unknown as Node, // null branch
    );
    container.appendChild(fragment);

    // Should have anchor comment + null placeholder comment
    expect(container.childNodes.length).toBeGreaterThanOrEqual(2);

    // Verify no crash and we can switch branches
    show.value = true;
    expect(container.textContent).toBe('visible');
  });

  it('handles string branch results by converting to text nodes', () => {
    const loading = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => loading.value,
      () => 'Loading...' as unknown as Node,
      () => 'Done' as unknown as Node,
    );
    container.appendChild(fragment);
    expect(container.textContent).toContain('Loading...');

    loading.value = false;
    expect(container.textContent).toContain('Done');
  });

  it('handles number branch results by converting to text nodes', () => {
    const show = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => 42 as unknown as Node,
      () => 0 as unknown as Node,
    );
    container.appendChild(fragment);
    expect(container.textContent).toContain('42');

    show.value = false;
    // 0 is falsy but should still render as text
    expect(container.textContent).toContain('0');
  });

  it('handles boolean branch results as empty (not rendered as text)', () => {
    const show = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => false as unknown as Node,
      () => true as unknown as Node,
    );
    container.appendChild(fragment);
    // false should render as empty, not as "false" text
    expect(container.textContent).not.toContain('false');
    expect(container.textContent).not.toContain('true');

    show.value = false;
    expect(container.textContent).not.toContain('true');
    expect(container.textContent).not.toContain('false');
  });

  it('nested conditional: DOM content is cleaned up when outer branch switches', () => {
    const status = signal('done');
    const container = document.createElement('div');

    // Simulates: {status === 'in-progress' ? 'In Progress' : status === 'done' ? 'Done' : 'To Do'}
    const fragment = __conditional(
      () => status.value === 'in-progress',
      () => 'In Progress' as unknown as Node,
      () =>
        __conditional(
          () => status.value === 'done',
          () => 'Done' as unknown as Node,
          () => 'To Do' as unknown as Node,
        ),
    );
    container.appendChild(fragment);
    expect(container.textContent).toBe('Done');

    // Switch to in-progress — old "Done" must be removed
    status.value = 'in-progress';
    expect(container.textContent).toBe('In Progress');

    // Switch back to done — old "In Progress" must be removed
    status.value = 'done';
    expect(container.textContent).toBe('Done');
  });

  it('nested conditional: inner branch toggles while outer condition stays false', () => {
    // Reproduces the checkbox bug: checked === 'mixed' ? <svg1/> : checked ? <svg2/> : null
    // The outer condition (=== 'mixed') is always false, only inner condition toggles.
    const checked = signal<boolean | 'mixed'>(true);
    const container = document.createElement('div');

    const fragment = __conditional(
      () => checked.value === 'mixed',
      () => {
        const svg = document.createElement('span');
        svg.textContent = 'dash-icon';
        return svg;
      },
      () =>
        __conditional(
          () => !!checked.value,
          () => {
            const svg = document.createElement('span');
            svg.textContent = 'check-icon';
            return svg;
          },
          () => null,
        ),
    );
    container.appendChild(fragment);

    // Initial: checked=true → outer false, inner true → check-icon visible
    expect(container.textContent).toBe('check-icon');

    // Uncheck: checked=false → outer false, inner false → null (empty)
    checked.value = false;
    expect(container.textContent).toBe('');

    // Re-check: checked=true → outer false, inner true → check-icon (ONE icon, not two)
    checked.value = true;
    const icons = container.querySelectorAll('span:not([style])');
    // Must be exactly 1 icon element, not 2
    let iconCount = 0;
    for (const node of container.querySelectorAll('*')) {
      if (node.textContent === 'check-icon' && node.childNodes.length === 1) {
        iconCount++;
      }
    }
    expect(iconCount).toBe(1);
    expect(container.textContent).toBe('check-icon');
  });

  it('nested conditional: multiple toggle cycles produce exactly one child', () => {
    // Stress test: toggle the inner condition many times while outer stays stable
    const checked = signal<boolean | 'mixed'>(true);
    const container = document.createElement('div');

    const fragment = __conditional(
      () => checked.value === 'mixed',
      () => {
        const el = document.createElement('b');
        el.textContent = 'mixed';
        return el;
      },
      () =>
        __conditional(
          () => !!checked.value,
          () => {
            const el = document.createElement('i');
            el.textContent = 'on';
            return el;
          },
          () => null,
        ),
    );
    container.appendChild(fragment);
    expect(container.textContent).toBe('on');

    // Toggle many times
    for (let i = 0; i < 5; i++) {
      checked.value = false;
      expect(container.textContent).toBe('');
      checked.value = true;
      expect(container.textContent).toBe('on');
    }

    // After all toggles, exactly 1 <i> element should exist
    expect(container.querySelectorAll('i').length).toBe(1);
  });

  it('nested conditional: outer switches to true then back, cleanup is correct', () => {
    const checked = signal<boolean | 'mixed'>(true);
    const container = document.createElement('div');

    const fragment = __conditional(
      () => checked.value === 'mixed',
      () => {
        const el = document.createElement('b');
        el.textContent = 'dash';
        return el;
      },
      () =>
        __conditional(
          () => !!checked.value,
          () => {
            const el = document.createElement('i');
            el.textContent = 'check';
            return el;
          },
          () => null,
        ),
    );
    container.appendChild(fragment);
    expect(container.textContent).toBe('check');

    // Switch to mixed — outer true branch
    checked.value = 'mixed';
    expect(container.textContent).toBe('dash');

    // Switch back to checked — outer false, inner true
    checked.value = true;
    expect(container.textContent).toBe('check');
    expect(container.querySelectorAll('b').length).toBe(0);
    expect(container.querySelectorAll('i').length).toBe(1);
  });

  it('handles both branches returning null without crashing', () => {
    const show = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => null as unknown as Node,
      () => null as unknown as Node,
    );
    container.appendChild(fragment);

    // Should not crash with both branches null
    expect(container.childNodes.length).toBeGreaterThanOrEqual(2);
    expect(container.textContent).toBe('');

    // Switching should also work
    show.value = false;
    expect(container.textContent).toBe('');

    show.value = true;
    expect(container.textContent).toBe('');
  });
});
