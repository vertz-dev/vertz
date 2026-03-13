import { afterEach, describe, expect, it } from 'bun:test';
import { endHydration, startHydration } from '../../hydrate/hydration-context';
import { signal } from '../../runtime/signal';
import { __conditional } from '../conditional';
import { __append, __element, __enterChildren, __exitChildren, __staticText } from '../element';

describe('__conditional — hydration', () => {
  afterEach(() => {
    endHydration();
  });

  it('claims comment anchor during hydration without removing it from SSR DOM', () => {
    const root = document.createElement('div');
    const comment = document.createComment('conditional');
    const span = document.createElement('span');
    span.textContent = 'visible';
    root.appendChild(comment);
    root.appendChild(span);
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

    // The comment anchor must still be in the SSR root — not ripped out
    expect(root.contains(comment)).toBe(true);
  });

  it('claims active branch content without removing it from SSR DOM', () => {
    const root = document.createElement('div');
    root.appendChild(document.createComment('conditional'));
    const span = document.createElement('span');
    span.textContent = 'active';
    root.appendChild(span);
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

  it('handles SSR/client condition mismatch (SSR=false, client=true)', () => {
    // SSR rendered the false branch: <!--conditional--><!--empty-->
    const root = document.createElement('div');
    root.appendChild(document.createComment('conditional'));
    root.appendChild(document.createComment('empty'));
    startHydration(root);

    const show = signal(true);
    __conditional(
      () => show.value,
      () => {
        const el = __element('span');
        __enterChildren(el);
        __append(el, __staticText('demo-content'));
        __exitChildren();
        return el;
      },
      () => null,
    );

    // The true branch content must be inserted into the DOM
    // despite SSR having rendered the false branch
    expect(root.textContent).toContain('demo-content');
  });

  it('handles SSR/client condition mismatch (SSR=true, client=false)', () => {
    // SSR rendered the true branch: <!--conditional--><span>content</span>
    const root = document.createElement('div');
    root.appendChild(document.createComment('conditional'));
    const span = document.createElement('span');
    span.textContent = 'ssr-content';
    root.appendChild(span);
    startHydration(root);

    const show = signal(false);
    __conditional(
      () => show.value,
      () => {
        const el = __element('span');
        __enterChildren(el);
        __append(el, __staticText('ssr-content'));
        __exitChildren();
        return el;
      },
      () => null,
    );

    // The SSR content should be replaced with the empty comment
    expect(root.textContent).not.toContain('ssr-content');
  });

  it('branch switch works after SSR/client mismatch recovery', () => {
    // SSR rendered the false branch: <!--conditional--><!--empty-->
    const root = document.createElement('div');
    root.appendChild(document.createComment('conditional'));
    root.appendChild(document.createComment('empty'));
    startHydration(root);

    const show = signal(true);
    __conditional(
      () => show.value,
      () => {
        const el = __element('span');
        __enterChildren(el);
        __append(el, __staticText('true-content'));
        __exitChildren();
        return el;
      },
      () => {
        const el = __element('p');
        __enterChildren(el);
        __append(el, __staticText('false-content'));
        __exitChildren();
        return el;
      },
    );

    endHydration();

    // Mismatch was recovered — true branch is visible
    expect(root.textContent).toContain('true-content');

    // Subsequent branch switches should work normally
    show.value = false;
    expect(root.textContent).toContain('false-content');
    expect(root.textContent).not.toContain('true-content');

    show.value = true;
    expect(root.textContent).toContain('true-content');
  });

  it('branch switch after hydration creates new nodes normally', () => {
    const root = document.createElement('div');
    root.appendChild(document.createComment('conditional'));
    const span = document.createElement('span');
    span.textContent = 'true-branch';
    root.appendChild(span);
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
});
