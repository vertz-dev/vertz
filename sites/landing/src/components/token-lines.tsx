import { css } from '@vertz/ui';
import type { Token, TokenLine } from './highlighted-code';

function hasHint(token: Token): token is [string, string, unknown] {
  return token.length > 2;
}

const s = css({
  pre: ['m:0'],
});

export function TokenLines({ lines }: { lines: TokenLine[] }) {
  return (
    <pre className={s.pre}>
      <code>
        {lines.map((line) => (
          <span key={line.map((t) => t[1]).join('')}>
            {line.map((token) => (
              <span
                key={token[1]}
                style={
                  hasHint(token)
                    ? `${token[0]}; text-decoration: underline dashed; text-decoration-color: #52525b; text-underline-offset: 3px`
                    : token[0]
                }
              >
                {token[1]}
              </span>
            ))}
            {'\n'}
          </span>
        ))}
      </code>
    </pre>
  );
}
