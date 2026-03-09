import { css } from '@vertz/ui';

const s = css({
  footer: ['py:12', 'px:6'],
});

export function Footer() {
  return (
    <footer class={s.footer} style="border-top: 1px solid #1e1e22">
      <div style="max-width: 56rem; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 1rem; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; flex-wrap: wrap">
        <div style="display: flex; align-items: center; gap: 1rem">
          <a href="https://github.com/vertz-dev/vertz" target="_blank" rel="noopener" style="transition: color 0.15s">
            GitHub
          </a>
          {/* FLAG:DISCORD - Uncomment when Discord invite is ready
          <span style="color: #3f3f46">|</span>
          <a href="https://discord.gg/INVITE_CODE" target="_blank" rel="noopener" style="transition: color 0.15s">
            Discord
          </a>
          */}
          <span style="color: #3f3f46">|</span>
          <a href="https://x.com/vinicius_dacal" target="_blank" rel="noopener" style="transition: color 0.15s">
            @vinicius_dacal
          </a>
          <span style="color: #3f3f46">|</span>
          <a href="https://x.com/matheeuspoleza" target="_blank" rel="noopener" style="transition: color 0.15s">
            @matheeuspoleza
          </a>
        </div>
        <div style="display: flex; align-items: center; gap: 1rem">
          <span>MIT License</span>
          <span style="color: #3f3f46">|</span>
          <span>Powered by Bun</span>
        </div>
      </div>
    </footer>
  );
}
