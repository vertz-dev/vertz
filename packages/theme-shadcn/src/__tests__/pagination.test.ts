import { describe, expect, it, vi } from 'bun:test';
import { createPaginationComponent } from '../components/pagination';
import { createPaginationStyles } from '../styles/pagination';

describe('pagination styles', () => {
  const pagination = createPaginationStyles();

  it('has all 6 blocks as non-empty strings', () => {
    expect(typeof pagination.nav).toBe('string');
    expect(typeof pagination.list).toBe('string');
    expect(typeof pagination.item).toBe('string');
    expect(typeof pagination.link).toBe('string');
    expect(typeof pagination.linkActive).toBe('string');
    expect(typeof pagination.ellipsis).toBe('string');
    expect(pagination.nav.length).toBeGreaterThanOrEqual(0);
    expect(pagination.list.length).toBeGreaterThan(0);
    expect(pagination.item.length).toBeGreaterThanOrEqual(0);
    expect(pagination.link.length).toBeGreaterThan(0);
    expect(pagination.linkActive.length).toBeGreaterThan(0);
    expect(pagination.ellipsis.length).toBeGreaterThan(0);
  });

  it('CSS contains focus-visible and hover states', () => {
    expect(pagination.css).toContain(':focus-visible');
    expect(pagination.css).toContain(':hover');
  });
});

describe('Pagination component', () => {
  const styles = createPaginationStyles();
  const Pagination = createPaginationComponent(styles);

  it('renders nav with aria-label="Pagination"', () => {
    const el = Pagination({ currentPage: 1, totalPages: 5, onPageChange: () => {} });
    expect(el.tagName).toBe('NAV');
    expect(el.getAttribute('aria-label')).toBe('Pagination');
  });

  it('active page has aria-current="page"', () => {
    const el = Pagination({ currentPage: 3, totalPages: 5, onPageChange: () => {} });
    const activeBtn = el.querySelector('[aria-current="page"]');
    expect(activeBtn).not.toBeNull();
    expect(activeBtn?.textContent).toBe('3');
  });

  it('prev button disabled on page 1', () => {
    const el = Pagination({ currentPage: 1, totalPages: 5, onPageChange: () => {} });
    const prevBtn = el.querySelector('[aria-label="Previous page"]') as HTMLButtonElement;
    expect(prevBtn).not.toBeNull();
    expect(prevBtn.disabled).toBe(true);
  });

  it('next button disabled on last page', () => {
    const el = Pagination({ currentPage: 5, totalPages: 5, onPageChange: () => {} });
    const nextBtn = el.querySelector('[aria-label="Next page"]') as HTMLButtonElement;
    expect(nextBtn).not.toBeNull();
    expect(nextBtn.disabled).toBe(true);
  });

  it('onPageChange called when clicking a page button', () => {
    const onPageChange = vi.fn();
    const el = Pagination({ currentPage: 1, totalPages: 5, onPageChange });
    const buttons = el.querySelectorAll('button');
    // Find page 2 button
    const page2 = Array.from(buttons).find((b) => b.textContent === '2');
    expect(page2).not.toBeNull();
    page2?.click();
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('ellipsis rendered when pages truncated', () => {
    const el = Pagination({ currentPage: 5, totalPages: 10, onPageChange: () => {} });
    const ellipses = el.querySelectorAll('[aria-hidden="true"]');
    expect(ellipses.length).toBeGreaterThan(0);
    expect(ellipses[0]?.textContent).toBe('\u2026');
  });

  it('all pages shown when totalPages is small', () => {
    const el = Pagination({ currentPage: 3, totalPages: 5, onPageChange: () => {} });
    const ellipses = el.querySelectorAll('[aria-hidden="true"]');
    expect(ellipses.length).toBe(0);
    // Should have prev + 5 pages + next = 7 buttons
    const buttons = el.querySelectorAll('button');
    expect(buttons.length).toBe(7);
    // Check page numbers are 1-5
    const pageNums = Array.from(buttons)
      .map((b) => b.textContent)
      .slice(1, -1);
    expect(pageNums).toEqual(['1', '2', '3', '4', '5']);
  });
});
