import { css } from '@vertz/ui';
import { useRouter } from '@vertz/ui/router';
import { VertzLogo } from './vertz-logo';

const s = css({
  nav: ['fixed', 'z:50', 'flex', 'items:center', 'justify:between', 'px:6', 'py:4'],
  logoWrapper: ['flex', 'items:center', 'gap:2'],
  links: ['flex', 'items:center', 'gap:6'],
  link: [
    'font:xs',
    'uppercase',
    'tracking:wider',
    'cursor:pointer',
    'transition:colors',
    'text:gray.500',
  ],
});

function handleInternalClick(e: MouseEvent, navigate: (opts: { to: string }) => void, to: string) {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate({ to });
}

export function Nav() {
  const { navigate } = useRouter();

  return (
    <nav
      class={s.nav}
      style="top: 0; left: 0; right: 0; background: rgba(10,10,11,0.8); backdrop-filter: blur(12px); border-bottom: 2px solid rgba(255,255,255,0.04)"
    >
      <a
        href="/"
        class={s.logoWrapper}
        onClick={(e: MouseEvent) => handleInternalClick(e, navigate, '/')}
      >
        <VertzLogo />
      </a>
      <div class={s.links}>
        <a
          href="/manifesto"
          class={s.link}
          onClick={(e: MouseEvent) => handleInternalClick(e, navigate, '/manifesto')}
        >
          Manifesto
        </a>
        <a
          href="https://github.com/vertz-dev/vertz"
          target="_blank"
          rel="noopener"
          class={s.link}
          style="font-family: var(--font-mono)"
        >
          GitHub
        </a>
        {/* FLAG:DISCORD - Uncomment when Discord invite is ready
        <a
          href="https://discord.gg/INVITE_CODE"
          target="_blank"
          rel="noopener"
          class={s.link}
          style="font-family: var(--font-mono)"
        >
          Discord
        </a>
        */}
        <a href="https://docs.vertz.dev" class={s.link} style="font-family: var(--font-mono)">
          Docs
        </a>
      </div>
    </nav>
  );
}
