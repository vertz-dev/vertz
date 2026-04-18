/**
 * Login page — uses framework OAuthButton component.
 *
 * Provider metadata (auth URL, name, icon) is auto-discovered
 * from useAuth().providers — no hardcoded URLs.
 */

import { css, token } from '@vertz/ui';
import { OAuthButton } from '@vertz/ui-auth';
import { cardStyles } from '../styles/components';

const styles = css({
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: token.color.background,
  },
  title: {
    fontSize: token.font.size['2xl'],
    fontWeight: token.font.weight.bold,
    color: token.color.foreground,
    marginBottom: token.spacing[2],
    textAlign: 'center',
  },
  subtitle: {
    fontSize: token.font.size.sm,
    color: token.color['muted-foreground'],
    marginBottom: token.spacing[6],
    textAlign: 'center',
  },
});

export function LoginPage() {
  return (
    <div className={styles.container}>
      <div
        className={cardStyles.root}
        style={{ padding: '2rem', width: '100%', maxWidth: '24rem' }}
      >
        <h1 className={styles.title}>Linear Clone</h1>
        <p className={styles.subtitle}>Sign in to your workspace</p>
        <OAuthButton provider="github" />
      </div>
    </div>
  );
}
