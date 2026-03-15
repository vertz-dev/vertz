/**
 * Login page — uses framework OAuthButton component.
 *
 * Provider metadata (auth URL, name, icon) is auto-discovered
 * from useAuth().providers — no hardcoded URLs.
 */

import { css } from '@vertz/ui';
import { OAuthButton } from '@vertz/ui-auth';
import { cardStyles } from '../styles/components';

const styles = css({
  container: ['flex', 'items:center', 'justify:center', 'min-h:screen', 'bg:background'],
  title: ['text:2xl', 'font:bold', 'text:foreground', 'mb:2', 'text:center'],
  subtitle: ['text:sm', 'text:muted-foreground', 'mb:6', 'text:center'],
});

export function LoginPage() {
  return (
    <div class={styles.container}>
      <div class={cardStyles.root} style="padding: 2rem; width: 100%; max-width: 24rem">
        <h1 class={styles.title}>Linear Clone</h1>
        <p class={styles.subtitle}>Sign in to your workspace</p>
        <OAuthButton provider="github" />
      </div>
    </div>
  );
}
