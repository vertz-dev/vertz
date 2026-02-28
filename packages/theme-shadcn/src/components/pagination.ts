interface PaginationStyleClasses {
  readonly nav: string;
  readonly list: string;
  readonly item: string;
  readonly link: string;
  readonly linkActive: string;
  readonly ellipsis: string;
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  class?: string;
}

export function createPaginationComponent(
  styles: PaginationStyleClasses,
): (props: PaginationProps) => HTMLElement {
  return function Pagination(props: PaginationProps) {
    const { currentPage, totalPages, onPageChange, siblingCount = 1, class: className } = props;

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Pagination');
    if (styles.nav) nav.classList.add(styles.nav);
    if (className) nav.classList.add(className);

    const ul = document.createElement('ul');
    ul.classList.add(styles.list);

    // Prev button
    const prevLi = document.createElement('li');
    prevLi.classList.add(styles.item);
    const prevBtn = document.createElement('button');
    prevBtn.setAttribute('type', 'button');
    prevBtn.classList.add(styles.link);
    prevBtn.textContent = '\u2039';
    prevBtn.setAttribute('aria-label', 'Previous page');
    if (currentPage <= 1) {
      prevBtn.disabled = true;
    } else {
      prevBtn.addEventListener('click', () => onPageChange(currentPage - 1));
    }
    prevLi.appendChild(prevBtn);
    ul.appendChild(prevLi);

    // Calculate page range
    const range = generatePaginationRange(currentPage, totalPages, siblingCount);

    for (const page of range) {
      const li = document.createElement('li');
      li.classList.add(styles.item);

      if (page === '...') {
        const span = document.createElement('span');
        span.setAttribute('aria-hidden', 'true');
        span.classList.add(styles.ellipsis);
        span.textContent = '\u2026';
        li.appendChild(span);
      } else {
        const btn = document.createElement('button');
        btn.setAttribute('type', 'button');
        btn.textContent = String(page);
        if (page === currentPage) {
          btn.classList.add(styles.linkActive);
          btn.setAttribute('aria-current', 'page');
        } else {
          btn.classList.add(styles.link);
          btn.addEventListener('click', () => onPageChange(page as number));
        }
        li.appendChild(btn);
      }

      ul.appendChild(li);
    }

    // Next button
    const nextLi = document.createElement('li');
    nextLi.classList.add(styles.item);
    const nextBtn = document.createElement('button');
    nextBtn.setAttribute('type', 'button');
    nextBtn.classList.add(styles.link);
    nextBtn.textContent = '\u203A';
    nextBtn.setAttribute('aria-label', 'Next page');
    if (currentPage >= totalPages) {
      nextBtn.disabled = true;
    } else {
      nextBtn.addEventListener('click', () => onPageChange(currentPage + 1));
    }
    nextLi.appendChild(nextBtn);
    ul.appendChild(nextLi);

    nav.appendChild(ul);
    return nav;
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
