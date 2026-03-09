import { css } from '@vertz/ui';
import { VertzLogo } from './vertz-logo';

const s = css({
  nav: [
    'fixed',
    'z:50',
    'flex',
    'items:center',
    'justify:between',
    'px:6',
    'py:4',
  ],
  links: ['flex', 'items:center', 'gap:6'],
  link: ['font:xs', 'uppercase', 'cursor:pointer'],
});

export function Nav() {
  return (
    <nav
      class={s.nav}
      style="top: 0; left: 0; right: 0; background: rgba(10,10,11,0.8); backdrop-filter: blur(12px); border-bottom: 2px solid rgba(255,255,255,0.04)"
    >
      <div style="display: flex; align-items: center; gap: 0.5rem">
        <VertzLogo />
      </div>
      <div class={s.links}>
        <a
          href="https://github.com/vertz-dev/vertz"
          target="_blank"
          rel="noopener"
          class={s.link}
          style="font-family: 'JetBrains Mono', monospace; letter-spacing: 0.05em; color: #71717a; transition: color 0.15s"
        >
          GitHub
        </a>
        {/* FLAG:DISCORD - Uncomment when Discord invite is ready
        <a
          href="https://discord.gg/INVITE_CODE"
          target="_blank"
          rel="noopener"
          class={s.link}
          style="font-family: 'JetBrains Mono', monospace; letter-spacing: 0.05em; color: #71717a; transition: color 0.15s"
        >
          Discord
        </a>
        */}
        <a
          href="#"
          class={s.link}
          style="font-family: 'JetBrains Mono', monospace; letter-spacing: 0.05em; color: #71717a; transition: color 0.15s"
        >
          Docs
        </a>
      </div>
    </nav>
  );
}
