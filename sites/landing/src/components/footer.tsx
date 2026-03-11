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
      '@media (min-width: 640px)': [
        { property: 'flex-direction', value: 'row' },
        { property: 'justify-content', value: 'space-between' },
      ],
    },
  ],
  linkGroup: ['flex', 'items:center', 'gap:4', 'flex-wrap', 'justify:center'],
  link: ['transition:colors'],
  separator: ['text:gray.700'],
});

export function Footer() {
  return (
    <footer class={s.footer} style="border-color: #1e1e22">
      <div class={s.container} style="font-family: var(--font-mono)">
        <div class={s.linkGroup}>
          <a
            href="https://github.com/vertz-dev/vertz"
            target="_blank"
            rel="noopener"
            class={s.link}
          >
            GitHub
          </a>
          {/* FLAG:DISCORD - Uncomment when Discord invite is ready
          <span class={s.separator}>|</span>
          <a href="https://discord.gg/INVITE_CODE" target="_blank" rel="noopener" class={s.link}>
            Discord
          </a>
          */}
          <span class={s.separator}>|</span>
          <a href="https://x.com/vinicius_dacal" target="_blank" rel="noopener" class={s.link}>
            @vinicius_dacal
          </a>
          <span class={s.separator}>|</span>
          <a href="https://x.com/matheeuspoleza" target="_blank" rel="noopener" class={s.link}>
            @matheeuspoleza
          </a>
        </div>
        <div class={s.linkGroup}>
          <span>MIT License</span>
          <span class={s.separator}>|</span>
          <span>Powered by Bun</span>
        </div>
      </div>
    </footer>
  );
}
