import type { ChildValue } from '@vertz/ui';

export interface BreadcrumbClasses {
  nav?: string;
  list?: string;
  item?: string;
  link?: string;
  page?: string;
  separator?: string;
}

export type BreadcrumbClassKey = keyof BreadcrumbClasses;

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface ComposedBreadcrumbProps {
  items: BreadcrumbItem[];
  separator?: string;
  classes?: BreadcrumbClasses;
  className?: string;
  class?: string;
}

interface BreadcrumbLinkProps {
  item: BreadcrumbItem;
  classes?: BreadcrumbClasses;
}

function BreadcrumbLink({ item, classes }: BreadcrumbLinkProps) {
  if (item.href) {
    return (
      <a href={item.href} class={classes?.link || undefined}>
        {item.label}
      </a>
    );
  }
  return <span class={classes?.link || undefined}>{item.label}</span>;
}

interface BreadcrumbPageProps {
  item: BreadcrumbItem;
  classes?: BreadcrumbClasses;
}

function BreadcrumbPage({ item, classes }: BreadcrumbPageProps) {
  return (
    <span aria-current="page" class={classes?.page || undefined}>
      {item.label}
    </span>
  );
}

function ComposedBreadcrumbRoot({
  items,
  separator = '/',
  classes,
  className,
  class: classProp,
}: ComposedBreadcrumbProps) {
  const effectiveCls = className ?? classProp;
  const navClass = [classes?.nav, effectiveCls].filter(Boolean).join(' ');

  // Pre-process items to build the list elements without using map index
  const listChildren: ChildValue[] = [];
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (!item) continue;
    const isLast = idx === items.length - 1;

    if (isLast) {
      listChildren.push(
        <li class={classes?.item || undefined}>
          <BreadcrumbPage item={item} classes={classes} />
        </li>,
      );
    } else {
      listChildren.push(
        <li class={classes?.item || undefined}>
          <BreadcrumbLink item={item} classes={classes} />
        </li>,
      );
      listChildren.push(
        <li role="presentation" aria-hidden="true" class={classes?.separator || undefined}>
          {separator}
        </li>,
      );
    }
  }

  return (
    <nav aria-label="Breadcrumb" class={navClass || undefined}>
      <ol
        class={classes?.list || undefined}
        style={{ listStyle: 'none', margin: '0', padding: '0' }}
      >
        {listChildren}
      </ol>
    </nav>
  );
}

export const ComposedBreadcrumb = ComposedBreadcrumbRoot as ((
  props: ComposedBreadcrumbProps,
) => HTMLElement) & {
  __classKeys?: BreadcrumbClassKey;
};
