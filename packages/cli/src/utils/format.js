export function formatDuration(ms) {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const seconds = ms / 1000;
  return `${seconds.toFixed(2)}s`;
}
export function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
export function formatPath(absolutePath, cwd) {
  const base = cwd ?? process.cwd();
  if (absolutePath.startsWith(base)) {
    const relative = absolutePath.slice(base.length);
    if (relative.startsWith('/')) {
      return relative.slice(1);
    }
    return relative;
  }
  return absolutePath;
}
//# sourceMappingURL=format.js.map
