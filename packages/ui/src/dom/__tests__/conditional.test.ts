import { describe, expect, it } from 'bun:test';
import { onCleanup } from '../../runtime/disposal';
import { domEffect, signal } from '../../runtime/signal';
import { __conditional } from '../conditional';

describe('__conditional', () => {
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
