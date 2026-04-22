import { css } from '@vertz/ui';

/**
 * Code-block breakout — applied to `pre` elements inside the prose container.
 *
 * Default (mobile + tablet): `pre` fills the 640px body and scrolls horizontally
 * when the source line overflows.
 *
 * Desktop (>=1024px): `pre` breaks out of the 640px body column via negative
 * horizontal margins, hitting ~800px wide. This matches the plan's
 * "Code breakout max-width 800px" invariant (see `plans/2947-blog.md`).
 */
export const codeBreakout = css({
  container: {
    '& pre': {
      maxWidth: '100%',
      '@media (min-width: 1024px)': {
        marginLeft: '-80px',
        marginRight: '-80px',
        maxWidth: '800px',
      },
    },
  },
});
