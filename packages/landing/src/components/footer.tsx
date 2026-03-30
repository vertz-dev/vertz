import { css } from '@vertz/ui';

const s = css({
  footer: ['py:12', 'px:6', 'border-t:1'],
  container: [
    'max-w:4xl',
    'mx:auto',
    'flex',
    'flex-col',
    'items:center',
    'gap:4',
    'flex-wrap',
    'font:xs',
    'uppercase',
    'tracking:wider',
    'text:gray.500',
    {
      '@media (min-width: 640px)': {
        'flex-direction': 'row',
        'justify-content': 'space-between',
      },
    },
  ],
  linkGroup: ['flex', 'items:center', 'gap:4', 'flex-wrap', 'justify:center'],
  link: ['transition:colors'],
  separator: ['text:gray.700'],
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
          <span>MIT License</span>
          <span className={s.separator}>|</span>
          <span>Powered by Bun</span>
        </div>
      </div>
    </footer>
  );
}
