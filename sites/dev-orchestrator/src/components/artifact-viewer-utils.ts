export interface ArtifactViewerProps {
  readonly path: string;
  readonly content: string;
  readonly type: string;
}

export function fileExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot + 1);
}

export function isMarkdown(path: string): boolean {
  const ext = fileExtension(path);
  return ext === 'md' || ext === 'mdx';
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
