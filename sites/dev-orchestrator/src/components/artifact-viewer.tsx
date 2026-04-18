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
  header: {
    paddingBlock: token.spacing[2],
    paddingInline: token.spacing[3],
    backgroundColor: token.color.secondary,
    fontSize: token.font.size.xs,
    fontWeight: token.font.weight.medium,
    color: token.color['muted-foreground'],
    '&': { fontFamily: 'monospace' },
  },
  body: {
    paddingBlock: token.spacing[3],
    paddingInline: token.spacing[4],
    fontSize: token.font.size.sm,
    color: token.color.foreground,
    '&': { lineHeight: '1.6' },
  },
  pre: {
    paddingBlock: token.spacing[3],
    paddingInline: token.spacing[4],
    fontSize: token.font.size.xs,
    color: token.color.foreground,
    backgroundColor: token.color.secondary,
    margin: token.spacing[0],
    '&': {
      lineHeight: '1.5',
      fontFamily: 'monospace',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },
  },
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
