import type { ArtifactViewerProps } from './artifact-viewer-utils';
import { escapeHtml, isMarkdown } from './artifact-viewer-utils';

export type { ArtifactViewerProps } from './artifact-viewer-utils';

const styles = {
  card: {
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  header: {
    padding: '8px 12px',
    background: 'var(--color-secondary)',
    fontSize: '12px',
    fontWeight: '500' as const,
    color: 'var(--color-muted-foreground)',
    fontFamily: 'monospace',
  },
  body: {
    padding: '12px 16px',
    fontSize: '13px',
    lineHeight: '1.6',
    color: 'var(--color-foreground)',
  },
  pre: {
    padding: '12px 16px',
    fontSize: '12px',
    lineHeight: '1.5',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    margin: '0',
    color: 'var(--color-foreground)',
    background: 'var(--color-secondary)',
  },
};

export default function ArtifactViewer({ path, content, type }: ArtifactViewerProps) {
  const markdown = isMarkdown(path) || type === 'markdown';

  return (
    <div style={styles.card}>
      <div style={styles.header}>{path}</div>
      {markdown ? (
        <div style={styles.body}>{content}</div>
      ) : (
        <pre style={styles.pre}>{escapeHtml(content)}</pre>
      )}
    </div>
  );
}
