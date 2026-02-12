import { describe, expect, it } from 'vitest';
import { signal } from '../../runtime/signal';
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
});
