import type { ChildValue } from '@vertz/ui';
import { cn } from '../composed/cn';

export interface PaginationClasses {
  nav?: string;
  list?: string;
  item?: string;
  link?: string;
  linkActive?: string;
  navButton?: string;
  ellipsis?: string;
}

export type PaginationClassKey = keyof PaginationClasses;

export interface ComposedPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  classes?: PaginationClasses;
  className?: string;
  class?: string;
  /** Custom content for the previous button. Defaults to "Previous". */
  prevContent?: ChildValue;
  /** Custom content for the next button. Defaults to "Next". */
  nextContent?: ChildValue;
  /** Custom content for the ellipsis. Defaults to "...". */
  ellipsisContent?: ChildValue;
}

function generatePaginationRange(
  current: number,
  total: number,
  siblings: number,
): (number | '...')[] {
  const range: (number | '...')[] = [];
  const left = Math.max(2, current - siblings);
  const right = Math.min(total - 1, current + siblings);

  range.push(1);

  if (left > 2) {
    range.push('...');
  }

  for (let idx = left; idx <= right; idx++) {
    if (idx !== 1 && idx !== total) {
      range.push(idx);
    }
  }

  if (right < total - 1) {
    range.push('...');
  }

  if (total > 1) {
    range.push(total);
  }

  return range;
}

interface PageButtonProps {
  page: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  classes?: PaginationClasses;
}

function PageButton({ page, currentPage, onPageChange, classes }: PageButtonProps) {
  if (page === currentPage) {
    return (
      <button type="button" class={cn(classes?.linkActive)} aria-current="page">
        {String(page)}
      </button>
    );
  }
  return (
    <button type="button" class={cn(classes?.link)} onClick={() => onPageChange(page)}>
      {String(page)}
    </button>
  );
}

function ComposedPaginationRoot({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  classes,
  className,
  class: classProp,
  prevContent = 'Previous',
  nextContent = 'Next',
  ellipsisContent = '...',
}: ComposedPaginationProps) {
  const range = generatePaginationRange(currentPage, totalPages, siblingCount);

  // Build page items imperatively to avoid .map() index issues with compiler
  const pageItems: ChildValue[] = [];
  for (const page of range) {
    if (page === '...') {
      pageItems.push(
        <li class={cn(classes?.item)}>
          <span aria-hidden="true" class={cn(classes?.ellipsis)}>
            {ellipsisContent}
          </span>
        </li>,
      );
    } else {
      pageItems.push(
        <li class={cn(classes?.item)}>
          <PageButton
            page={page}
            currentPage={currentPage}
            onPageChange={onPageChange}
            classes={classes}
          />
        </li>,
      );
    }
  }

  return (
    <nav aria-label="Pagination" class={cn(classes?.nav, className ?? classProp)}>
      <ul class={cn(classes?.list)}>
        <li class={cn(classes?.item)}>
          <button
            type="button"
            class={cn(classes?.navButton)}
            style={{ paddingLeft: '0.375rem', paddingRight: '0.625rem' }}
            aria-label="Previous page"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            {prevContent}
          </button>
        </li>
        {pageItems}
        <li class={cn(classes?.item)}>
          <button
            type="button"
            class={cn(classes?.navButton)}
            style={{ paddingLeft: '0.625rem', paddingRight: '0.375rem' }}
            aria-label="Next page"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            {nextContent}
          </button>
        </li>
      </ul>
    </nav>
  );
}

export const ComposedPagination = ComposedPaginationRoot as ((
  props: ComposedPaginationProps,
) => HTMLElement) & {
  __classKeys?: PaginationClassKey;
};
