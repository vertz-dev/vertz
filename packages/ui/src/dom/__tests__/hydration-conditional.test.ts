import { afterEach, describe, expect, it } from 'bun:test';
import { endHydration, startHydration } from '../../hydrate/hydration-context';
import { signal } from '../../runtime/signal';
import { __conditional } from '../conditional';
import { __append, __element, __enterChildren, __exitChildren, __staticText } from '../element';

describe('__conditional — hydration', () => {
  afterEach(() => {
    endHydration();
  });

  it('claims anchor and end marker, no span wrapper injected', () => {
    const root = document.createElement('div');
    const anchor = document.createComment('conditional');
    const span = document.createElement('span');
    span.textContent = 'visible';
    const endMarker = document.createComment('/conditional');
    root.appendChild(anchor);
    root.appendChild(span);
    root.appendChild(endMarker);
    startHydration(root);

    const show = signal(true);
    __conditional(
      () => show.value,
      () => {
        const el = __element('span');
        __enterChildren(el);
        __append(el, __staticText('visible'));
        __exitChildren();
        return el;
      },
      () => null,
    );

    // Anchor and end marker still in DOM
    expect(root.contains(anchor)).toBe(true);
    expect(root.contains(endMarker)).toBe(true);

    // No display:contents span wrapper was created
    const spans = root.querySelectorAll('span');
    for (const s of spans) {
      expect(s.style.display).not.toBe('contents');
    }

    // Content preserved between markers
    expect(root.textContent).toContain('visible');
  });

  it('claims comment anchor during hydration without removing it from SSR DOM', () => {
    const root = document.createElement('div');
    const comment = document.createComment('conditional');
    const span = document.createElement('span');
    span.textContent = 'visible';
    root.appendChild(comment);
    root.appendChild(span);
    root.appendChild(document.createComment('/conditional'));
    startHydration(root);

    const show = signal(true);
    __conditional(
      () => show.value,
      () => {
        const el = __element('span');
        __enterChildren(el);
        __append(el, __staticText('visible'));
        __exitChildren();
        return el;
      },
      () => null,
    );

    // The comment anchor must still be in the DOM tree
    expect(root.contains(comment)).toBe(true);
  });

  it('claims active branch content without removing it from SSR DOM', () => {
    const root = document.createElement('div');
    root.appendChild(document.createComment('conditional'));
    const span = document.createElement('span');
    span.textContent = 'active';
    root.appendChild(span);
    root.appendChild(document.createComment('/conditional'));
    startHydration(root);

    const show = signal(true);
    __conditional(
      () => show.value,
      () => {
        const el = __element('span');
        __enterChildren(el);
        __append(el, __staticText('active'));
        __exitChildren();
        return el;
      },
      () => null,
    );

    // The SSR span must still be in the root — not moved to a fragment
    expect(root.contains(span)).toBe(true);
    expect(root.textContent).toContain('active');
  });

  it('adopts SSR span reference via __element during hydration', () => {
    const root = document.createElement('div');
    root.appendChild(document.createComment('conditional'));
    const ssrSpan = document.createElement('span');
    ssrSpan.textContent = 'content';
    root.appendChild(ssrSpan);
    root.appendChild(document.createComment('/conditional'));
    startHydration(root);

    const show = signal(true);
    let claimedEl: HTMLElement | null = null;
    __conditional(
      () => show.value,
      () => {
        claimedEl = __element('span');
        __enterChildren(claimedEl);
        __append(claimedEl, __staticText('content'));
        __exitChildren();
        return claimedEl;
      },
      () => null,
    );

    // __element should have adopted the existing SSR span
    expect(claimedEl).toBe(ssrSpan);
  });

  it('attaches reactive effect for future branch switches', () => {
    const root = document.createElement('div');
    root.appendChild(document.createComment('conditional'));
    const span = document.createElement('span');
    span.textContent = 'yes';
    root.appendChild(span);
    root.appendChild(document.createComment('/conditional'));
    startHydration(root);

    const show = signal(true);
    __conditional(
      () => show.value,
      () => {
        const el = __element('span');
        __enterChildren(el);
        __append(el, __staticText('yes'));
        __exitChildren();
        return el;
      },
      () => {
        const el = __element('span');
        __enterChildren(el);
        __append(el, __staticText('no'));
        __exitChildren();
        return el;
      },
    );

    // End hydration so future updates create new nodes
    endHydration();

    // Branch switch should work normally after hydration
    show.value = false;
    expect(root.textContent).toContain('no');
  });

  it('branch switch after hydration creates new nodes normally', () => {
    const root = document.createElement('div');
    root.appendChild(document.createComment('conditional'));
    const span = document.createElement('span');
    span.textContent = 'true-branch';
    root.appendChild(span);
    root.appendChild(document.createComment('/conditional'));
    startHydration(root);

    const show = signal(true);
    __conditional(
      () => show.value,
      () => {
        const el = __element('span');
        __enterChildren(el);
        __append(el, __staticText('true-branch'));
        __exitChildren();
        return el;
      },
      () => {
        const el = __element('p');
        __enterChildren(el);
        __append(el, __staticText('false-branch'));
        __exitChildren();
        return el;
      },
    );

    endHydration();

    // Switch to false branch
    show.value = false;
    expect(root.textContent).toContain('false-branch');

    // Switch back to true branch
    show.value = true;
    expect(root.textContent).toContain('true-branch');
  });

  it('nested conditional: inner content is cleaned up when outer re-evaluates after hydration', () => {
    // Reproduces checkbox bug: checked === 'mixed' ? <svg1/> : checked ? <svg2/> : null
    // SSR DOM simulates: checked=true → outer false, inner true → SVG present
    // SSR structure: <!--conditional--> <!--conditional--> <span> <!--/conditional--> <!--/conditional-->
    const root = document.createElement('div');
    // Outer conditional anchor
    root.appendChild(document.createComment('conditional'));
    // Inner conditional anchor
    root.appendChild(document.createComment('conditional'));
    // Inner true branch content (the SVG/span)
    const ssrSpan = document.createElement('span');
    ssrSpan.textContent = 'check-icon';
    root.appendChild(ssrSpan);
    // Inner end marker
    root.appendChild(document.createComment('/conditional'));
    // Outer end marker
    root.appendChild(document.createComment('/conditional'));

    startHydration(root);

    const checked = signal<boolean | 'mixed'>(true);
    __conditional(
      () => checked.value === 'mixed',
      () => {
        const el = __element('span');
        __enterChildren(el);
        __append(el, __staticText('dash-icon'));
        __exitChildren();
        return el;
      },
      () =>
        __conditional(
          () => !!checked.value,
          () => {
            const el = __element('span');
            __enterChildren(el);
            __append(el, __staticText('check-icon'));
            __exitChildren();
            return el;
          },
          () => null,
        ),
    );

    endHydration();

    // Initial: SSR content intact
    expect(root.textContent).toContain('check-icon');

    // Uncheck: checked=false → content should be cleared
    checked.value = false;
    expect(root.textContent).not.toContain('check-icon');

    // Re-check: checked=true → content restored, text appears exactly once
    checked.value = true;
    expect(root.textContent).toContain('check-icon');
    // Verify no duplicate text — 'check-icon' should appear exactly once
    const matches = root.textContent?.match(/check-icon/g);
    expect(matches?.length).toBe(1);
  });

  it('nested conditional: outer switches to true branch then back, no orphaned nodes', () => {
    // Tests the mixed state path: outer condition true → false with inner re-creation
    // SSR structure: <!--conditional--> <!--conditional--> <span> <!--/conditional--> <!--/conditional-->
    const root = document.createElement('div');
    root.appendChild(document.createComment('conditional'));
    root.appendChild(document.createComment('conditional'));
    const ssrSpan = document.createElement('span');
    ssrSpan.textContent = 'check-icon';
    root.appendChild(ssrSpan);
    // Inner end marker
    root.appendChild(document.createComment('/conditional'));
    // Outer end marker
    root.appendChild(document.createComment('/conditional'));

    startHydration(root);

    const checked = signal<boolean | 'mixed'>(true);
    __conditional(
      () => checked.value === 'mixed',
      () => {
        const el = __element('span');
        __enterChildren(el);
        __append(el, __staticText('dash-icon'));
        __exitChildren();
        return el;
      },
      () =>
        __conditional(
          () => !!checked.value,
          () => {
            const el = __element('span');
            __enterChildren(el);
            __append(el, __staticText('check-icon'));
            __exitChildren();
            return el;
          },
          () => null,
        ),
    );

    endHydration();

    // Switch to mixed — outer condition becomes true, inner conditional is disposed
    checked.value = 'mixed';
    expect(root.textContent).toContain('dash-icon');
    expect(root.textContent).not.toContain('check-icon');

    // Switch back to true — outer condition false, inner re-created
    checked.value = true;
    expect(root.textContent).toContain('check-icon');
    expect(root.textContent).not.toContain('dash-icon');
    const checkMatches = root.textContent?.match(/check-icon/g);
    expect(checkMatches?.length).toBe(1);
  });

  it('falls back to CSR when end marker is missing from SSR output', () => {
    // SSR has anchor but no <!--/conditional--> end marker (mismatch scenario).
    // hydrateConditional should detect the missing end marker and fall back to CSR.
    // Uses raw DOM in branch functions (not __element) because the CSR fallback
    // runs while hydration is still active — hydration-aware primitives would
    // try to claim from the exhausted cursor.
    const root = document.createElement('div');
    root.appendChild(document.createComment('conditional'));
    const span = document.createElement('span');
    span.textContent = 'ssr-content';
    root.appendChild(span);
    // No end marker appended — simulates SSR mismatch
    startHydration(root);

    const show = signal(true);
    const result = __conditional(
      () => show.value,
      () => {
        const el = document.createElement('span');
        el.textContent = 'true-branch';
        return el;
      },
      () => null,
    );

    endHydration();

    // CSR fallback returns a DocumentFragment; append to verify content
    root.appendChild(result);

    // Content should be present (via CSR fallback)
    expect(root.textContent).toContain('true-branch');

    // Branch switch should work
    show.value = false;
    expect(root.textContent).not.toContain('true-branch');

    show.value = true;
    expect(root.textContent).toContain('true-branch');
  });
});
