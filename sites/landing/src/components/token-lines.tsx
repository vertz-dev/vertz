import { onMount } from '@vertz/ui';
import { Tooltip } from '@vertz/ui-primitives';
import type { CompactToken, Token, TokenLine } from './highlighted-code';

function hasHint(token: Token): token is [string, string, CompactToken[][]] {
  return token.length > 2;
}

const TOOLTIP_CONTENT_STYLE = [
  'background: #191a21',
  'border: 1px solid #44475a',
  'border-radius: 4px',
  'padding: 8px 12px',
  "font-family: 'JetBrains Mono', monospace",
  'font-size: 12px',
  'line-height: 1.5',
  'color: #f8f8f2',
  'white-space: pre',
  'box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5)',
  'max-width: 480px',
].join('; ');

function HintedToken({ token }: { token: [string, string, CompactToken[][]] }) {
  const hintId = token[1].trim();

  onMount(() => {
    const el = document.querySelector(`[data-hint-id="${hintId}"]`) as HTMLSpanElement | null;
    if (!el) return;

    const { trigger, content } = Tooltip.Root({
      delay: 200,
      positioning: { placement: 'top', offset: 8, portal: true, flip: true, shift: true },
    });

    trigger.style.cssText = `${token[0]}; text-decoration: underline dashed; text-decoration-color: #52525b; text-underline-offset: 3px; cursor: default`;
    trigger.textContent = token[1];

    content.style.cssText = TOOLTIP_CONTENT_STYLE;

    for (const hintLine of token[2]) {
      const lineSpan = document.createElement('span');
      for (const t of hintLine) {
        const tokenSpan = document.createElement('span');
        tokenSpan.style.cssText = t[0];
        tokenSpan.textContent = t[1];
        lineSpan.appendChild(tokenSpan);
      }
      lineSpan.appendChild(document.createTextNode('\n'));
      content.appendChild(lineSpan);
    }

    el.replaceWith(trigger);
  });

  return (
    <span
      data-hint-id={hintId}
      style={`${token[0]}; text-decoration: underline dashed; text-decoration-color: #52525b; text-underline-offset: 3px; cursor: default`}
    >
      {token[1]}
    </span>
  );
}

export function TokenLines({ lines }: { lines: TokenLine[] }) {
  return (
    <pre style="margin: 0">
      <code>
        {lines.map((line) => (
          <span key={line.map((t) => t[1]).join('')}>
            {line.map((token) =>
              hasHint(token)
                ? <HintedToken key={token[1]} token={token} />
                : <span key={token[1]} style={token[0]}>{token[1]}</span>,
            )}
            {'\n'}
          </span>
        ))}
      </code>
    </pre>
  );
}
