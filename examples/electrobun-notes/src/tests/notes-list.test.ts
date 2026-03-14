import { beforeEach, describe, expect, test } from 'bun:test';
import { renderTest, waitFor } from '@vertz/ui/test';
import { resetMockData } from '../api/mock-data';
import { NotesListPage } from '../pages/notes-list';

describe('NotesListPage', () => {
  beforeEach(() => {
    resetMockData();
  });

  // Error test runs first — before any successful queries cache data.
  // The query cache is module-level and resetDefaultQueryCache is internal.
  test('shows error state when fetch fails', async () => {
    // Override fetch AFTER resetMockData installs the success mock
    (globalThis as Record<string, unknown>).fetch = async () => {
      throw new Error('Network failure');
    };
    const { findByTestId, unmount } = renderTest(NotesListPage());
    await waitFor(() => {
      const error = findByTestId('error');
      expect(error).toBeDefined();
    });
    unmount();
  });

  test('renders page container with testid', () => {
    const { findByTestId, unmount } = renderTest(NotesListPage());
    const page = findByTestId('notes-list-page');
    expect(page).toBeDefined();
    unmount();
  });

  test('renders create note form', () => {
    const { findByTestId, unmount } = renderTest(NotesListPage());
    const form = findByTestId('create-note-form');
    expect(form).toBeDefined();
    unmount();
  });

  test('shows loading state or resolves to data', () => {
    const { queryByTestId, unmount } = renderTest(NotesListPage());
    const loading = queryByTestId('loading');
    const notesList = queryByTestId('notes-list');
    // With synchronous mock fetch, either loading is visible or data already rendered
    expect(loading !== null || notesList !== null).toBe(true);
    if (loading) {
      expect(loading.textContent).toContain('Loading notes');
    }
    unmount();
  });

  test('renders notes list after data loads', async () => {
    const { findByTestId, unmount } = renderTest(NotesListPage());
    await waitFor(() => {
      const list = findByTestId('notes-list');
      expect(list).toBeDefined();
    });
    unmount();
  });

  test('displays note titles after fetch', async () => {
    const { findByTestId, unmount } = renderTest(NotesListPage());
    await waitFor(() => {
      const item1 = findByTestId('note-item-1');
      expect(item1).toBeDefined();
      expect(item1.textContent).toContain('First note');
      const item2 = findByTestId('note-item-2');
      expect(item2).toBeDefined();
      expect(item2.textContent).toContain('Second note');
    });
    unmount();
  });
});
