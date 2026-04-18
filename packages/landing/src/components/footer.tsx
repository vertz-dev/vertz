import { css, token } from '@vertz/ui';
import { Link } from '@vertz/ui/router';

const s = css({
  footer: {
    paddingBlock: token.spacing[12],
    paddingInline: token.spacing[6],
    borderTopWidth: '1px',
  },
  container: {
    maxWidth: '56rem',
    marginInline: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: token.spacing[4],
    flexWrap: 'wrap',
    fontSize: token.font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: token.color.gray[500],
    '@media (min-width: 640px)': { flexDirection: 'row', justifyContent: 'space-between' },
  },
  linkGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: token.spacing[4],
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  link: {
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  separator: { color: token.color.gray[700] },
});

export function Footer() {
  return (
    <footer className={s.footer} style={{ borderColor: '#1e1e22' }}>
      <div className={s.container} style={{ fontFamily: 'var(--font-mono)' }}>
        <div className={s.linkGroup}>
          <a
            href="https://github.com/vertz-dev/vertz"
            target="_blank"
            rel="noopener"
            className={s.link}
          >
            GitHub
          </a>
          <span className={s.separator}>|</span>
          <a href="https://discord.gg/C7JkeBhH5" target="_blank" rel="noopener" className={s.link}>
            Discord
          </a>
          <span className={s.separator}>|</span>
          <a href="https://x.com/vinicius_dacal" target="_blank" rel="noopener" className={s.link}>
            @vinicius_dacal
          </a>
          <span className={s.separator}>|</span>
          <a href="https://x.com/matheeuspoleza" target="_blank" rel="noopener" className={s.link}>
            @matheeuspoleza
          </a>
        </div>
        <div className={s.linkGroup}>
          <Link href="/openapi" className={s.link}>
            OpenAPI SDK Generator
          </Link>
          <span className={s.separator}>|</span>
          <span>MIT License</span>
          <span className={s.separator}>|</span>
          <span>Powered by vtz</span>
        </div>
      </div>
    </footer>
  );
}
