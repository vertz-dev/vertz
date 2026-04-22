import { css, onMount, ref, token } from '@vertz/ui';

/**
 * Pure reading-progress computation — takes the post body's rect relative
 * to the viewport and returns a 0..1 progress value. Extracted from the
 * component so it can be unit-tested without a DOM.
 */
export interface ReadingProgressInput {
  /** `bodyEl.getBoundingClientRect().top` — negative once scrolled past. */
  bodyTop: number;
  bodyHeight: number;
  viewportHeight: number;
}

export function computeProgress({
  bodyTop,
  bodyHeight,
  viewportHeight,
}: ReadingProgressInput): number {
  if (!Number.isFinite(bodyTop) || !Number.isFinite(bodyHeight) || !Number.isFinite(viewportHeight))
    return 0;
  // Nothing to scroll — user sees everything.
  if (bodyHeight <= viewportHeight) return 1;
  // Not yet scrolled into the body.
  if (bodyTop >= 0) return 0;

  const readable = bodyHeight - viewportHeight;
  const scrolled = -bodyTop;
  const progress = scrolled / readable;
  return Math.max(0, Math.min(1, progress));
}

const s = css({
  bar: {
    position: 'fixed',
    top: 0,
    left: 0,
    height: '2px',
    backgroundColor: token.color.orange[400],
    zIndex: '60',
    transition: 'width 80ms linear',
    pointerEvents: 'none',
  },
});

export interface ReadingProgressProps {
  /** Element whose scroll progress the bar should track. */
  target: HTMLElement;
}

export function ReadingProgress({ target }: ReadingProgressProps) {
  const barRef = ref<HTMLDivElement>();

  onMount(() => {
    if (typeof window === 'undefined') return;
    if (typeof target?.getBoundingClientRect !== 'function') return;

    let rafPending = false;

    function update() {
      rafPending = false;
      const bar = barRef.current;
      if (!bar) return;
      const rect = target.getBoundingClientRect();
      const progress = computeProgress({
        bodyTop: rect.top,
        bodyHeight: rect.height,
        viewportHeight: window.innerHeight,
      });
      bar.style.width = `${(progress * 100).toFixed(2)}%`;
    }

    function onScroll() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(update);
    }

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  });

  return <div ref={barRef} className={s.bar} role="progressbar" aria-label="Reading progress" />;
}
