interface BreadcrumbStyleClasses {
  readonly nav: string;
  readonly list: string;
  readonly item: string;
  readonly link: string;
  readonly page: string;
  readonly separator: string;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  separator?: string;
  class?: string;
}

export function createBreadcrumbComponent(
  styles: BreadcrumbStyleClasses,
): (props: BreadcrumbProps) => HTMLElement {
  return function Breadcrumb(props: BreadcrumbProps) {
    const { items, separator = '/', class: className } = props;

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Breadcrumb');
    if (styles.nav) nav.className = styles.nav;
    if (className) {
      nav.className = [nav.className, className].filter(Boolean).join(' ');
    }

    const ol = document.createElement('ol');
    ol.className = styles.list;

    for (let i = 0; i < items.length; i++) {
      const item = items[i] as BreadcrumbItem;
      const li = document.createElement('li');
      li.className = styles.item;

      const isLast = i === items.length - 1;

      if (isLast) {
        const span = document.createElement('span');
        span.setAttribute('aria-current', 'page');
        span.className = styles.page;
        span.textContent = item.label;
        li.appendChild(span);
      } else {
        if (item.href) {
          const a = document.createElement('a');
          a.href = item.href;
          a.className = styles.link;
          a.textContent = item.label;
          li.appendChild(a);
        } else {
          const span = document.createElement('span');
          span.className = styles.link;
          span.textContent = item.label;
          li.appendChild(span);
        }
      }

      ol.appendChild(li);

      if (!isLast) {
        const sepLi = document.createElement('li');
        sepLi.setAttribute('role', 'presentation');
        sepLi.setAttribute('aria-hidden', 'true');
        sepLi.className = styles.separator;
        sepLi.textContent = separator;
        ol.appendChild(sepLi);
      }
    }

    nav.appendChild(ol);
    return nav;
  };
}

export type BreadcrumbComponents = (props: BreadcrumbProps) => HTMLElement;
