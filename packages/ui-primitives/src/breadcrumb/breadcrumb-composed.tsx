/**
 * Composed Breadcrumb — compound component with context-based class distribution.
 * Sub-components: Item.
 *
 * Uses Link from @vertz/ui for SPA navigation when `href` prop is provided.
 */

import type { ChildValue } from '@vertz/ui';
import { createContext, Link, useContext } from '@vertz/ui';
import { cn } from '../composed/cn';

// ---------------------------------------------------------------------------
// Class distribution
// ---------------------------------------------------------------------------

export interface BreadcrumbClasses {
  nav?: string;
  list?: string;
  item?: string;
  link?: string;
  page?: string;
  separator?: string;
}

export type BreadcrumbClassKey = keyof BreadcrumbClasses;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface BreadcrumbContextValue {
  classes?: BreadcrumbClasses;
  separator: string;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | undefined>(
  undefined,
  '@vertz/ui-primitives::BreadcrumbContext',
);

// ---------------------------------------------------------------------------
// Sub-component props
// ---------------------------------------------------------------------------

export interface BreadcrumbItemProps {
  children?: string | Node | (() => string | Node);
  /** Target path — renders as Link (SPA navigation). Omit for non-linked items. */
  href?: string;
  /** Marks this item as the current page (aria-current="page", no link). */
  current?: boolean;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BreadcrumbItem({
  children,
  href,
  current,
  className,
  class: classProp,
}: BreadcrumbItemProps) {
  const ctx = useContext(BreadcrumbContext);
  const separatorText = ctx?.separator ?? '/';

  if (href && current) {
    console.warn(
      'Breadcrumb.Item: both "href" and "current" are set. "current" takes precedence — the link will not render.',
    );
  }

  const content = current ? (
    <span aria-current="page" class={cn(ctx?.classes?.page, className ?? classProp)}>
      {children}
    </span>
  ) : href ? (
    <Link
      href={href}
      className={cn(ctx?.classes?.link, className ?? classProp)}
      children={children ?? ''}
    />
  ) : (
    <span class={cn(ctx?.classes?.link, className ?? classProp)}>{children}</span>
  );

  return (
    <li class={cn(ctx?.classes?.item)}>
      <span role="presentation" aria-hidden="true" class={cn(ctx?.classes?.separator)}>
        {separatorText}
      </span>
      {content}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export interface ComposedBreadcrumbProps {
  children?: ChildValue;
  /** Separator character between items. Default: "/" */
  separator?: string;
  classes?: BreadcrumbClasses;
  className?: string;
  /** @deprecated Use `className` instead. */
  class?: string;
}

function ComposedBreadcrumbRoot({
  children,
  separator = '/',
  classes,
  className,
  class: classProp,
}: ComposedBreadcrumbProps) {
  return (
    <BreadcrumbContext.Provider value={{ classes, separator }}>
      <nav aria-label="Breadcrumb" class={cn(classes?.nav, className ?? classProp)}>
        <ol class={cn(classes?.list)} style={{ listStyle: 'none', margin: '0', padding: '0' }}>
          {children}
        </ol>
      </nav>
    </BreadcrumbContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Export as callable with sub-component properties
// ---------------------------------------------------------------------------

export const ComposedBreadcrumb = Object.assign(ComposedBreadcrumbRoot, {
  Item: BreadcrumbItem,
}) as ((props: ComposedBreadcrumbProps) => HTMLElement) & {
  __classKeys?: BreadcrumbClassKey;
  Item: (props: BreadcrumbItemProps) => HTMLElement;
};
