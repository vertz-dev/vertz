import { css } from '@vertz/ui';

const s = css({
  copyButton: [
    'flex',
    'items:center',
    'justify:between',
    'gap:4',
    'py:3',
    'px:6',
    'font:sm',
    'cursor:pointer',
    'border:2',
    'bg:gray.950',
    'text:gray.300',
  ],
  copyPrefix: ['font:xs', 'text:gray.500'],
  dollarSign: ['text:gray.500'],
});

export default function CopyButton() {
  let copied = false;

  function handleClick() {
    navigator.clipboard.writeText('bun create vertz my-app');
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      class={s.copyButton}
      style="font-family: var(--font-mono); border-color: #1e1e22; box-shadow: 4px 4px 0 rgba(255,255,255,0.06); transition: all 0.15s"
    >
      <span class={s.dollarSign}>$</span> bun create vertz my-app
      <span class={s.copyPrefix}>{copied ? 'Copied!' : '(click to copy)'}</span>
    </button>
  );
}
