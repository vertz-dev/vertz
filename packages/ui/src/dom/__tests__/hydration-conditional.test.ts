import { afterEach, describe, expect, it } from 'vitest';
import { endHydration, startHydration } from '../../hydrate/hydration-context';
import { signal } from '../../runtime/signal';
import { __conditional } from '../conditional';

describe('__conditional — hydration', () => {
  afterEach(() => {
    endHydration();
  });

  it('claims comment anchor during hydration', () => {
    const root = document.createElement('div');
    const comment = document.createComment('conditional');
    const span = document.createElement('span');
    span.textContent = 'visible';
    root.appendChild(comment);
    root.appendChild(span);
    startHydration(root);

    const show = signal(true);
    const fragment = __conditional(
      () => show.value,
      () => {
        const el = document.createElement('span');
        el.textContent = 'visible';
        return el;
      },
      () => null,
    );

    // Fragment should contain the claimed comment anchor
    expect(fragment.childNodes.length).toBeGreaterThanOrEqual(1);
  });

  it('claims active branch content during hydration', () => {
    const root = document.createElement('div');
    root.appendChild(document.createComment('conditional'));
    const span = document.createElement('span');
    span.textContent = 'active';
    root.appendChild(span);
    startHydration(root);

    const show = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => {
        // During hydration, this doesn't create a new node but reads from SSR
        const el = document.createElement('span');
        el.textContent = 'active';
        return el;
      },
      () => null,
    );
    container.appendChild(fragment);

    expect(container.textContent).toContain('active');
  });

  it('attaches reactive effect for future branch switches', () => {
    const root = document.createElement('div');
    root.appendChild(document.createComment('conditional'));
    const span = document.createElement('span');
    span.textContent = 'yes';
    root.appendChild(span);
    startHydration(root);

    const show = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => {
        const el = document.createElement('span');
        el.textContent = 'yes';
        return el;
      },
      () => {
        const el = document.createElement('span');
        el.textContent = 'no';
        return el;
      },
    );
    container.appendChild(fragment);

    // End hydration so future updates create new nodes
    endHydration();

    // Branch switch should work normally after hydration
    show.value = false;
    expect(container.textContent).toContain('no');
  });

  it('branch switch after hydration creates new nodes normally', () => {
    const root = document.createElement('div');
    root.appendChild(document.createComment('conditional'));
    const span = document.createElement('span');
    span.textContent = 'true-branch';
    root.appendChild(span);
    startHydration(root);

    const show = signal(true);
    const container = document.createElement('div');
    const fragment = __conditional(
      () => show.value,
      () => {
        const el = document.createElement('span');
        el.textContent = 'true-branch';
        return el;
      },
      () => {
        const el = document.createElement('p');
        el.textContent = 'false-branch';
        return el;
      },
    );
    container.appendChild(fragment);

    endHydration();

    // Switch to false branch
    show.value = false;
    expect(container.textContent).toContain('false-branch');

    // Switch back to true branch
    show.value = true;
    expect(container.textContent).toContain('true-branch');
  });
});
