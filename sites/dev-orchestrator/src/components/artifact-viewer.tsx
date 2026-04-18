import { css, token } from '@vertz/ui';
import type { ArtifactViewerProps } from './artifact-viewer-utils';
import { isMarkdown } from './artifact-viewer-utils';

export type { ArtifactViewerProps } from './artifact-viewer-utils';

const s = css({
  card: {
    borderWidth: '1px',
    borderColor: token.color.border,
    borderRadius: token.radius.lg,
    overflow: 'hidden',
  },
  header: [
    'py:2',
    'px:3',
    'bg:secondary',
    'text:xs',
    'font:medium',
    'text:muted-foreground',
    { '&': { 'font-family': 'monospace' } },
  ],
  body: ['py:3', 'px:4', 'text:sm', 'text:foreground', { '&': { 'line-height': '1.6' } }],
  pre: [
    'py:3',
    'px:4',
    'text:xs',
    'text:foreground',
    'bg:secondary',
    'm:0',
    {
      '&': {
        'line-height': '1.5',
        'font-family': 'monospace',
        'white-space': 'pre-wrap',
        'word-break': 'break-word',
      },
    },
  ],
});

export default function ArtifactViewer({ path, content, type }: ArtifactViewerProps) {
  const markdown = isMarkdown(path) || type === 'markdown';

  return (
    <div className={s.card}>
      <div className={s.header}>{path}</div>
      {markdown ? <div className={s.body}>{content}</div> : <pre className={s.pre}>{content}</pre>}
    </div>
  );
}
