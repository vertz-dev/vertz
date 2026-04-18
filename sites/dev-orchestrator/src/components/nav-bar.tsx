import { css, token } from '@vertz/ui';
import { Link } from '@vertz/ui/router';

const styles = css({
  nav: {
    display: 'flex',
    flexDirection: 'column',
    width: token.spacing[64],
    minHeight: '100vh',
    backgroundColor: token.color.card,
    borderRightWidth: '1px',
    borderColor: token.color.border,
    padding: token.spacing[4],
  },
  brand: {
    fontSize: token.font.size.xl,
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
    marginBottom: token.spacing[6],
    paddingInline: token.spacing[2],
  },
  links: { display: 'flex', flexDirection: 'column', gap: token.spacing[1] },
  link: {
    paddingInline: token.spacing[3],
    paddingBlock: token.spacing[2],
    borderRadius: token.radius.md,
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': { backgroundColor: token.color.accent, color: token.color.foreground },
  },
});

export function NavBar() {
  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>Dev Orchestrator</div>
      <div className={styles.links}>
        <Link href="/" className={styles.link} activeClass="bg:accent">
          Dashboard
        </Link>
        <Link href="/agents" className={styles.link} activeClass="bg:accent">
          Agents
        </Link>
      </div>
    </nav>
  );
}
