import { describe, expect, it, mock } from '@vertz/test';
import type { PaginationClasses } from '../pagination/pagination-composed';
import { ComposedPagination } from '../pagination/pagination-composed';

const classes: PaginationClasses = {
  nav: 'pg-nav',
  list: 'pg-list',
  item: 'pg-item',
  link: 'pg-link',
  linkActive: 'pg-active',
  navButton: 'pg-navbtn',
  ellipsis: 'pg-ellipsis',
};

function RenderBasic() {
  return (
    <ComposedPagination currentPage={1} totalPages={5} onPageChange={() => {}} classes={classes} />
  );
}
function RenderMiddle() {
  return (
    <ComposedPagination currentPage={3} totalPages={5} onPageChange={() => {}} classes={classes} />
  );
}
function RenderLastPage() {
  return (
    <ComposedPagination currentPage={5} totalPages={5} onPageChange={() => {}} classes={classes} />
  );
}
function RenderMany() {
  return (
    <ComposedPagination currentPage={5} totalPages={10} onPageChange={() => {}} classes={classes} />
  );
}
function RenderWithClass() {
  return (
    <ComposedPagination
      currentPage={1}
      totalPages={5}
      onPageChange={() => {}}
      classes={classes}
      className="custom"
    />
  );
}

let clickHandler: (page: number) => void = () => {};
function RenderClickable() {
  return (
    <ComposedPagination
      currentPage={1}
      totalPages={5}
      onPageChange={(page: number) => clickHandler(page)}
      classes={classes}
    />
  );
}

describe('ComposedPagination', () => {
  it('renders nav with aria-label="Pagination"', () => {
    const el = RenderBasic();
    const nav = el.querySelector('nav') ?? el;
    expect(nav.tagName).toBe('NAV');
    expect(nav.getAttribute('aria-label')).toBe('Pagination');
  });

  it('applies nav class', () => {
    const el = RenderBasic();
    const nav = el.querySelector('nav') ?? el;
    expect(nav.className).toContain('pg-nav');
  });

  it('active page has aria-current="page"', () => {
    const el = RenderMiddle();
    const activeBtn = el.querySelector('[aria-current="page"]');
    expect(activeBtn).not.toBeNull();
    expect(activeBtn?.textContent).toBe('3');
    expect(activeBtn?.className).toContain('pg-active');
  });

  it('prev button disabled on page 1', () => {
    const el = RenderBasic();
    const prevBtn = el.querySelector('[aria-label="Previous page"]') as HTMLButtonElement;
    expect(prevBtn).not.toBeNull();
    expect(prevBtn.disabled).toBe(true);
  });

  it('next button disabled on last page', () => {
    const el = RenderLastPage();
    const nextBtn = el.querySelector('[aria-label="Next page"]') as HTMLButtonElement;
    expect(nextBtn).not.toBeNull();
    expect(nextBtn.disabled).toBe(true);
  });

  it('onPageChange called when clicking a page button', () => {
    const onPageChange = mock();
    clickHandler = onPageChange;
    const el = RenderClickable() as HTMLElement;
    const buttons = el.querySelectorAll('button');
    const page2 = Array.from(buttons).find((b) => b.textContent === '2');
    expect(page2).not.toBeNull();
    page2?.click();
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('ellipsis rendered when pages truncated', () => {
    const el = RenderMany();
    const ellipses = el.querySelectorAll('span[aria-hidden="true"]');
    expect(ellipses.length).toBeGreaterThan(0);
    expect(ellipses[0]?.textContent).toBe('...');
    expect(ellipses[0]?.className).toContain('pg-ellipsis');
  });

  it('all pages shown when totalPages is small', () => {
    const el = RenderMiddle();
    const ellipses = el.querySelectorAll('span[aria-hidden="true"]');
    expect(ellipses.length).toBe(0);
    // prev + 5 pages + next = 7 buttons
    const buttons = el.querySelectorAll('button');
    expect(buttons.length).toBe(7);
    const pageNums = Array.from(buttons)
      .map((b) => b.textContent)
      .slice(1, -1);
    expect(pageNums).toEqual(['1', '2', '3', '4', '5']);
  });

  it('appends user className to nav', () => {
    const el = RenderWithClass();
    const nav = el.querySelector('nav') ?? el;
    expect(nav.className).toContain('pg-nav');
    expect(nav.className).toContain('custom');
  });
});
