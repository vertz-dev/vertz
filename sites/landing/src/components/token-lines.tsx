import { css } from '@vertz/ui';
import type { TokenLine } from './highlighted-code';

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
              <span key={token[1]} style={token[0]}>
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
