import { css } from '@vertz/ui';
import { Link } from '@vertz/ui/router';
import { VertzLogo } from './vertz-logo';

const s = css({
  nav: [
    'fixed',
    'z:50',
    'flex',
    'items:center',
    'justify:between',
    'px:4',
    'py:4',
    { '@media (min-width: 640px)': { 'padding-left': '1.5rem', 'padding-right': '1.5rem' } },
  ],
  logoWrapper: ['flex', 'items:center', 'gap:2'],
  links: ['flex', 'items:center', 'gap:3', { '@media (min-width: 640px)': { gap: '1.5rem' } }],
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
      className={s.nav}
      style={{
        top: '0',
        left: '0',
        right: '0',
        background: 'rgba(17,17,16,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #2A2826',
      }}
    >
      <Link href="/" className={s.logoWrapper}>
        <VertzLogo />
      </Link>
      <div className={s.links}>
        <Link href="/manifesto" className={s.link}>
          Manifesto
        </Link>
        <a
          href="https://github.com/vertz-dev/vertz"
          target="_blank"
          rel="noopener"
          className={s.link}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          GitHub
        </a>
        {/* FLAG:DISCORD - Uncomment when Discord invite is ready
        <a
          href="https://discord.gg/INVITE_CODE"
          target="_blank"
          rel="noopener"
          className={s.link}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Discord
        </a>
        */}
        <a
          href="https://docs.vertz.dev"
          className={s.link}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Docs
        </a>
      </div>
    </nav>
  );
}
