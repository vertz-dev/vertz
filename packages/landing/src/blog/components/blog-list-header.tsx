import { css, token } from '@vertz/ui';

const s = css({
  header: {
    maxWidth: '720px',
    marginInline: 'auto',
    marginBottom: token.spacing[12],
    textAlign: 'left',
  },
  title: {
    fontFamily: "'DM Serif Display', 'DM Serif Display Fallback', serif",
    fontSize: '3rem',
    lineHeight: '1.1',
    color: token.color.gray[100],
    margin: '0 0 1rem 0',
    textWrap: 'balance',
  },
  subtitle: {
    fontSize: '17px',
    color: token.color.gray[400],
    lineHeight: '1.6',
    textWrap: 'pretty',
    margin: 0,
  },
});

export function BlogListHeader() {
  return (
    <header className={s.header}>
      <h1 className={s.title}>Blog</h1>
      <p className={s.subtitle}>Notes from building an agent-native framework.</p>
    </header>
  );
}
