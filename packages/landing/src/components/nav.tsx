import { css, token } from '@vertz/ui';
import { Link } from '@vertz/ui/router';
import { VertzLogo } from './vertz-logo';

const s = css({
  nav: {
    position: 'fixed',
    zIndex: '50',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingInline: token.spacing[4],
    paddingBlock: token.spacing[4],
    '@media (min-width: 640px)': { paddingLeft: '1.5rem', paddingRight: '1.5rem' },
  },
  logoWrapper: { display: 'flex', alignItems: 'center', gap: token.spacing[2] },
  links: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[3],
    '@media (min-width: 640px)': { gap: '1.5rem' },
  },
  link: {
    fontSize: token.font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    cursor: 'pointer',
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    color: token.color.gray[500],
  },
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
        <a
          href="https://discord.gg/C7JkeBhH5"
          target="_blank"
          rel="noopener"
          className={s.link}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          Discord
        </a>
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
