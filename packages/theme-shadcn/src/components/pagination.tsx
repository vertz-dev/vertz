interface PaginationStyleClasses {
  readonly nav: string;
  readonly list: string;
  readonly item: string;
  readonly link: string;
  readonly linkActive: string;
  readonly navButton: string;
  readonly ellipsis: string;
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export function createPaginationComponent(
  styles: PaginationStyleClasses,
): (props: PaginationProps) => HTMLElement {
  return function Pagination(props: PaginationProps) {
    const {
      currentPage,
      totalPages,
      onPageChange,
      siblingCount = 1,
      className,
      class: classProp,
    } = props;
    const effectiveClass = className ?? classProp;
    const navClass = [styles.nav, effectiveClass].filter(Boolean).join(' ');

    const range = generatePaginationRange(currentPage, totalPages, siblingCount);

    // Build page items outside JSX to work around compiler .map() limitation
    const pageItems: HTMLElement[] = [];
    for (const page of range) {
      if (page === '...') {
        pageItems.push(
          (
            <li class={styles.item}>
              <span aria-hidden="true" class={styles.ellipsis}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="19" cy="12" r="1" />
                  <circle cx="5" cy="12" r="1" />
                </svg>
              </span>
            </li>
          ) as HTMLElement,
        );
      } else {
        const btn = (
          <button
            type="button"
            class={page === currentPage ? styles.linkActive : styles.link}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {String(page)}
          </button>
        ) as HTMLButtonElement;
        if (page !== currentPage) {
          btn.addEventListener('click', () => onPageChange(page as number));
        }
        const li = (<li class={styles.item} />) as HTMLElement;
        li.appendChild(btn);
        pageItems.push(li);
      }
    }

    const el = (
      <nav aria-label="Pagination" class={navClass || undefined}>
        <ul class={styles.list}>
          <li class={styles.item}>
            <button
              type="button"
              class={styles.navButton}
              aria-label="Previous page"
              disabled={currentPage <= 1 || undefined}
              style={{ paddingLeft: '0.375rem', paddingRight: '0.625rem' }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              <span>Previous</span>
            </button>
          </li>
        </ul>
      </nav>
    ) as HTMLElement;

    const ul = el.querySelector('ul') as HTMLUListElement;

    // Insert page items before the closing next-button li
    for (const item of pageItems) {
      ul.appendChild(item);
    }

    // Next button
    const nextLi = (<li class={styles.item} />) as HTMLElement;
    const nextBtn = (
      <button
        type="button"
        class={styles.navButton}
        aria-label="Next page"
        disabled={currentPage >= totalPages || undefined}
        style={{ paddingLeft: '0.625rem', paddingRight: '0.375rem' }}
      >
        <span>Next</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    ) as HTMLButtonElement;
    if (currentPage < totalPages) {
      nextBtn.addEventListener('click', () => onPageChange(currentPage + 1));
    }
    nextLi.appendChild(nextBtn);
    ul.appendChild(nextLi);

    // Add previous button click handler
    if (currentPage > 1) {
      const prevBtn = el.querySelector('button[aria-label="Previous page"]') as HTMLButtonElement;
      prevBtn.addEventListener('click', () => onPageChange(currentPage - 1));
    }

    return el;
  };
}

function generatePaginationRange(
  current: number,
  total: number,
  siblings: number,
): (number | '...')[] {
  const range: (number | '...')[] = [];
  const left = Math.max(2, current - siblings);
  const right = Math.min(total - 1, current + siblings);

  // Always include page 1
  range.push(1);

  // Left ellipsis
  if (left > 2) {
    range.push('...');
  }

  // Middle pages
  for (let i = left; i <= right; i++) {
    if (i !== 1 && i !== total) {
      range.push(i);
    }
  }

  // Right ellipsis
  if (right < total - 1) {
    range.push('...');
  }

  // Always include last page (if > 1)
  if (total > 1) {
    range.push(total);
  }

  return range;
}

export type PaginationComponents = (props: PaginationProps) => HTMLElement;
