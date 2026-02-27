import { beforeEach, describe, expect, it } from 'bun:test';
import { setHiddenAnimated } from '../aria';

describe('setHiddenAnimated', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
  });

  it('shows element immediately when hidden=false', () => {
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');

    setHiddenAnimated(el, false);

    expect(el.getAttribute('aria-hidden')).toBe('false');
    expect(el.style.display).toBe('');
  });

  it('sets aria-hidden immediately when hiding', () => {
    setHiddenAnimated(el, true);
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('defers display:none until animations complete when hiding', async () => {
    let resolveAnim!: () => void;
    const animFinished = new Promise<void>((resolve) => {
      resolveAnim = resolve;
    });

    el.getAnimations = () => [{ finished: animFinished } as unknown as Animation];

    setHiddenAnimated(el, true);

    // aria-hidden set immediately
    expect(el.getAttribute('aria-hidden')).toBe('true');
    // display not yet set to none (animation still running)
    expect(el.style.display).not.toBe('none');

    // Resolve animation
    resolveAnim();
    await animFinished;
    await new Promise((r) => setTimeout(r, 0));

    // Now display should be none
    expect(el.style.display).toBe('none');
  });

  it('hides immediately when no animations running', () => {
    el.getAnimations = () => [];
    setHiddenAnimated(el, true);
    expect(el.style.display).toBe('none');
  });
});
