import { describe, expect, it } from 'vitest';
import { saveStatusMessage, saveStatusColor } from './agent-detail-utils';

describe('saveStatusMessage', () => {
  it('returns empty string for idle', () => {
    expect(saveStatusMessage('idle')).toBe('');
  });

  it('returns "Saving..." for saving', () => {
    expect(saveStatusMessage('saving')).toBe('Saving...');
  });

  it('returns "Saved" for saved', () => {
    expect(saveStatusMessage('saved')).toBe('Saved');
  });

  it('returns "Failed to save" for error', () => {
    expect(saveStatusMessage('error')).toBe('Failed to save');
  });
});

describe('saveStatusColor', () => {
  it('returns transparent for idle', () => {
    expect(saveStatusColor('idle')).toBe('transparent');
  });

  it('returns green for saved', () => {
    expect(saveStatusColor('saved')).toContain('142');
  });

  it('returns red for error', () => {
    expect(saveStatusColor('error')).toContain('0, 84%');
  });

  it('returns muted for saving', () => {
    expect(saveStatusColor('saving')).toBe('var(--color-muted-foreground)');
  });
});
