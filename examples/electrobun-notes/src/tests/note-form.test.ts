import { beforeEach, describe, expect, test } from 'bun:test';
import { renderTest, waitFor } from '@vertz/ui/test';
import { resetMockData } from '../api/mock-data';
import { NoteForm } from '../components/note-form';

describe('NoteForm', () => {
  beforeEach(() => {
    resetMockData();
  });

  test('renders form with testid', () => {
    const { findByTestId, unmount } = renderTest(NoteForm({ onSuccess: () => {} }));
    const form = findByTestId('create-note-form');
    expect(form).toBeDefined();
    expect(form.tagName).toBe('FORM');
    unmount();
  });

  test('renders title input with placeholder', () => {
    const { findByTestId, unmount } = renderTest(NoteForm({ onSuccess: () => {} }));
    const input = findByTestId('note-title-input');
    expect(input).toBeDefined();
    expect(input.getAttribute('placeholder')).toBe('Note title');
    unmount();
  });

  test('renders submit button', () => {
    const { findByTestId, unmount } = renderTest(NoteForm({ onSuccess: () => {} }));
    const btn = findByTestId('submit-note');
    expect(btn).toBeDefined();
    expect(btn.textContent).toContain('Add Note');
    unmount();
  });

  test('has progressive enhancement attributes', () => {
    const { findByTestId, unmount } = renderTest(NoteForm({ onSuccess: () => {} }));
    const form = findByTestId('create-note-form');
    expect(form.getAttribute('action')).toBe('/notes');
    expect(form.getAttribute('method')).toBe('POST');
    unmount();
  });

  test('calls onSuccess after valid submission', async () => {
    let created = false;
    const { findByTestId, type, unmount } = renderTest(
      NoteForm({
        onSuccess: () => {
          created = true;
        },
      }),
    );

    const input = findByTestId('note-title-input');
    await type(input, 'My new note');

    const form = findByTestId('create-note-form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() => {
      expect(created).toBe(true);
    });

    unmount();
  });
});
