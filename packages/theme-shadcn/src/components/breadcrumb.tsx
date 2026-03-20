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
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

export function createBreadcrumbComponent(
  styles: BreadcrumbStyleClasses,
): (props: BreadcrumbProps) => HTMLElement {
  return function Breadcrumb(props: BreadcrumbProps) {
    const { items, separator = '/', className, class: classProp } = props;
    const effectiveClass = className ?? classProp;
    const navClass = [styles.nav, effectiveClass].filter(Boolean).join(' ');

    // Build list items outside JSX to work around compiler .map() limitation
    const listItems: HTMLElement[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as BreadcrumbItem;
      const isLast = i === items.length - 1;

      if (isLast) {
        listItems.push(
          (
            <li class={styles.item}>
              <span aria-current="page" class={styles.page}>
                {item.label}
              </span>
            </li>
          ) as HTMLElement,
        );
      } else {
        if (item.href) {
          listItems.push(
            (
              <li class={styles.item}>
                <a href={item.href} class={styles.link}>
                  {item.label}
                </a>
              </li>
            ) as HTMLElement,
          );
        } else {
          listItems.push(
            (
              <li class={styles.item}>
                <span class={styles.link}>{item.label}</span>
              </li>
            ) as HTMLElement,
          );
        }

        // Add separator
        listItems.push(
          (
            <li role="presentation" aria-hidden="true" class={styles.separator}>
              {separator}
            </li>
          ) as HTMLElement,
        );
      }
    }

    const nav = (
      <nav aria-label="Breadcrumb" class={navClass || undefined}>
        <ol class={styles.list} />
      </nav>
    ) as HTMLElement;

    const ol = nav.querySelector('ol') as HTMLOListElement;
    for (const li of listItems) {
      ol.appendChild(li);
    }

    return nav;
  };
}

export type BreadcrumbComponents = (props: BreadcrumbProps) => HTMLElement;
