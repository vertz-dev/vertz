import type { Token, TokenLine } from '@/lib/highlighted-code';

export function TokenLines({ lines }: { lines: TokenLine[] }) {
  return (
    <pre className="m-0">
      <code>
        {lines.map((line, lineIdx) => (
          <span key={lineIdx}>
            {line.map((token, tokenIdx) => (
              <span key={tokenIdx} style={parseStyle(token[0])}>
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

// Convert CSS string like "color:#FF79C6" to React style object
function parseStyle(cssString: string): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const part of cssString.split(';')) {
    const [key, value] = part.split(':');
    if (key && value) {
      const camelKey = key.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      style[camelKey] = value.trim();
    }
  }
  return style;
}
