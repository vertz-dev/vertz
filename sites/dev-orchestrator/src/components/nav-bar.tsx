import { css } from '@vertz/ui';
import { Link } from '@vertz/ui/router';

const styles = css({
  nav: [
    'flex',
    'flex-col',
    'w:64',
    'min-h:screen',
    'bg:card',
    'border-r:1',
    'border:border',
    'p:4',
  ],
  brand: ['font:xl', 'font:bold', 'text:foreground', 'mb:6', 'px:2'],
  links: ['flex', 'flex-col', 'gap:1'],
  link: [
    'px:3',
    'py:2',
    'rounded:md',
    'text:sm',
    'text:muted-foreground',
    'hover:bg:accent',
    'hover:text:foreground',
    'transition:colors',
  ],
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
