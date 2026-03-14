import { css, Island } from '@vertz/ui';
import CopyButton from './copy-button';

const s = css({
  section: [
    'flex',
    'flex-col',
    'items:center',
    'justify:center',
    'px:6',
    'min-h:screen',
    'text:center',
  ],
  badge: ['flex', 'items:center', 'gap:2', 'mb:8'],
  badgeDotWrap: ['relative', 'flex', 'h:2.5', 'w:2.5'],
  badgeDotPing: ['absolute', 'inline-flex', 'h:full', 'w:full', 'rounded:full', 'opacity:40'],
  badgeDot: ['relative', 'inline-flex', 'rounded:full', 'h:2.5', 'w:2.5'],
  badgeText: ['font:xs', 'tracking:widest', 'uppercase', 'text:gray.500'],
  h1: ['max-w:4xl'],
  h1Line: ['block'],
  h1LineFaded: ['block', 'text:gray.400'],
  description: ['mt:8', 'font:xl', 'max-w:2xl', 'leading:relaxed', 'text:gray.400'],
  descriptionHighlight: ['weight:medium', 'text:gray.200'],
  ctas: [
    'mt:12',
    'flex',
    'flex-col',
    'items:stretch',
    'gap:4',
    {
      '@media (min-width: 640px)': {
        'flex-direction': 'row',
        'align-items': 'center',
      },
    },
  ],
  githubLink: [
    'flex',
    'items:center',
    'justify:center',
    'gap:2',
    'py:3',
    'px:6',
    'font:sm',
    'uppercase',
    'tracking:wider',
    'transition:colors',
    'text:gray.400',
    {
      '@media (min-width: 640px)': { display: 'inline-flex' },
    },
  ],
});

export function Hero() {
  return (
    <section class={s.section}>
      <div class={s.badge}>
        <span class={s.badgeDotWrap}>
          <span class={s.badgeDotPing} style="background: #60a5fa" />
          <span class={s.badgeDot} style="background: #3b82f6" />
        </span>
        <span class={s.badgeText} style="font-family: var(--font-mono)">
          Public Beta
        </span>
      </div>

      <h1
        class={s.h1}
        style="font-family: var(--font-display); font-size: clamp(3rem, 8vw, 6rem); letter-spacing: -0.025em; line-height: 1.1"
      >
        <span class={s.h1Line}>One command.</span>
        <span class={s.h1LineFaded}>Full stack. Running.</span>
      </h1>

      <p class={s.description}>
        One command. Database, API, and UI — running locally.{' '}
        <span class={s.descriptionHighlight}>
          Define your schema once. Everything else is derived. Zero config.
        </span>
      </p>

      <div class={s.ctas}>
        <Island component={CopyButton} />
        <a
          href="https://github.com/vertz-dev/vertz"
          target="_blank"
          rel="noopener"
          class={s.githubLink}
          style="font-family: var(--font-mono)"
        >
          View on GitHub →
        </a>
      </div>
    </section>
  );
}
