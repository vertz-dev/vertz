import { css } from '@vertz/ui';

const s = css({
  footer: ['py:12', 'px:6'],
  container: [
    'max-w:4xl',
    'mx:auto',
    'flex',
    'items:center',
    'justify:between',
    'gap:4',
    'flex-wrap',
    'font:xs',
    'uppercase',
    'tracking:wider',
  ],
  linkGroup: ['flex', 'items:center', 'gap:4'],
  link: ['transition:colors'],
});

export function Footer() {
  return (
    <footer class={s.footer} style="border-top: 1px solid #1e1e22">
      <div class={s.container} style="font-family: 'JetBrains Mono', monospace; color: #71717a">
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
          <span style="color: #3f3f46">|</span>
          <a href="https://discord.gg/INVITE_CODE" target="_blank" rel="noopener" class={s.link}>
            Discord
          </a>
          */}
          <span style="color: #3f3f46">|</span>
          <a href="https://x.com/vinicius_dacal" target="_blank" rel="noopener" class={s.link}>
            @vinicius_dacal
          </a>
          <span style="color: #3f3f46">|</span>
          <a href="https://x.com/matheeuspoleza" target="_blank" rel="noopener" class={s.link}>
            @matheeuspoleza
          </a>
        </div>
        <div class={s.linkGroup}>
          <span>MIT License</span>
          <span style="color: #3f3f46">|</span>
          <span>Powered by Bun</span>
        </div>
      </div>
    </footer>
  );
}
