import { css } from '@vertz/ui';
import { Link } from '@vertz/ui/router';
import { VertzLogo } from './vertz-logo';

const s = css({
  nav: ['fixed', 'z:50', 'flex', 'items:center', 'justify:between', 'px:4', 'py:4',
    { '@media (min-width: 640px)': [{ property: 'padding-left', value: '1.5rem' }, { property: 'padding-right', value: '1.5rem' }] },
  ],
  logoWrapper: ['flex', 'items:center', 'gap:2'],
  links: ['flex', 'items:center', 'gap:3',
    { '@media (min-width: 640px)': [{ property: 'gap', value: '1.5rem' }] },
  ],
  link: [
    'font:xs',
    'uppercase',
    'tracking:wider',
    'cursor:pointer',
    'transition:colors',
    'text:gray.500',
  ],
});

export function Nav() {
  return (
    <nav
      class={s.nav}
      style="top: 0; left: 0; right: 0; background: rgba(10,10,11,0.8); backdrop-filter: blur(12px); border-bottom: 2px solid rgba(255,255,255,0.04)"
    >
      <Link href="/" className={s.logoWrapper}>
        <VertzLogo />
      </Link>
      <div class={s.links}>
        <Link href="/manifesto" className={s.link}>
          Manifesto
        </Link>
        <a
          href="https://github.com/vertz-dev/vertz"
          target="_blank"
          rel="noopener"
          class={s.link}
          style="font-family: var(--font-mono)"
        >
          GitHub
        </a>
        {/* FLAG:DISCORD - Uncomment when Discord invite is ready
        <a
          href="https://discord.gg/INVITE_CODE"
          target="_blank"
          rel="noopener"
          class={s.link}
          style="font-family: var(--font-mono)"
        >
          Discord
        </a>
        */}
        <a href="https://docs.vertz.dev" class={s.link} style="font-family: var(--font-mono)">
          Docs
        </a>
      </div>
    </nav>
  );
}
