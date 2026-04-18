import { css, token } from '@vertz/ui';

const s = css({
  section: {
    paddingBlock: token.spacing[24],
    paddingInline: token.spacing[6],
    position: 'relative',
    overflow: 'hidden',
  },
  container: { maxWidth: '56rem', marginInline: 'auto', textAlign: 'center' },
  inner: { maxWidth: '42rem', marginInline: 'auto' },
  badge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: token.spacing[2],
    marginBottom: token.spacing[6],
  },
  badgeDot: {
    display: 'inline-flex',
    borderRadius: token.radius.full,
    height: token.spacing['2.5'],
    width: token.spacing['2.5'],
  },
  badgeText: {
    fontSize: token.font.size.xs,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    '&': { color: '#6B6560' },
  },
  heading: { fontSize: token.font.size['4xl'], marginBottom: token.spacing[6] },
  desc: {
    fontSize: token.font.size.lg,
    lineHeight: token.font.lineHeight.relaxed,
    marginBottom: token.spacing[10],
  },
  cta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: token.spacing[2],
    paddingBlock: token.spacing[3],
    paddingInline: token.spacing[8],
    fontSize: token.font.size.sm,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&': {
      background: '#5865F2',
      color: '#fff',
      borderRadius: '2px',
      border: 'none',
      textDecoration: 'none',
    },
    '&:hover': { background: '#4752C4' },
  },
});

const DISCORD_URL = 'https://discord.gg/C7JkeBhH5';

export function CommunityDiscord() {
  return (
    <section
      id="community"
      className={s.section}
      style={{
        background: '#0F0F0E',
        borderTop: '1px solid #2A2826',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '600px',
          height: '400px',
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse, rgba(88,101,242,0.15) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div className={s.container} style={{ position: 'relative', zIndex: '1' }}>
        <div className={s.inner}>
          <div className={s.badge}>
            <span className={s.badgeDot} style={{ background: '#5865F2' }} />
            <span className={s.badgeText} style={{ fontFamily: 'var(--font-mono)' }}>
              Community
            </span>
          </div>

          <h2 className={s.heading} style={{ fontFamily: 'var(--font-display)', color: '#E8E4DC' }}>
            Build this with us.
          </h2>

          <p className={s.desc} style={{ color: '#9C9690' }}>
            Join the Discord. Talk to the founders, preview breaking changes, and help shape the
            APIs before v1.
          </p>

          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener"
            className={s.cta}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              width="18"
              height="18"
            >
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
            </svg>
            Join Discord →
          </a>
        </div>
      </div>
    </section>
  );
}
