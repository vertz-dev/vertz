/**
 * Format a save status message for display.
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function saveStatusMessage(status: SaveStatus): string {
  switch (status) {
    case 'saving': return 'Saving...';
    case 'saved': return 'Saved';
    case 'error': return 'Failed to save';
    default: return '';
  }
}

export function saveStatusColor(status: SaveStatus): string {
  switch (status) {
    case 'saving': return 'var(--color-muted-foreground)';
    case 'saved': return 'hsl(142, 76%, 36%)';
    case 'error': return 'hsl(0, 84%, 60%)';
    default: return 'transparent';
  }
}
