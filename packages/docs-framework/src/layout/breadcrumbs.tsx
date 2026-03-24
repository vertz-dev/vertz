import type { Breadcrumb } from '../routing/resolve';

export interface BreadcrumbsProps {
  items: Breadcrumb[];
}

function BreadcrumbLink({ path, label }: { path: string; label: string }) {
  return <a href={path}>{label}</a>;
}

function BreadcrumbSeparator() {
  return (
    <span data-separator aria-hidden="true" style={{ margin: '0 8px', opacity: 0.5 }}>
      /
    </span>
  );
}

/** Build a flat array of breadcrumb entries with separators between them. */
function buildBreadcrumbItems(
  items: Breadcrumb[],
): Array<{ type: 'link' | 'sep'; label: string; path: string }> {
  const result: Array<{ type: 'link' | 'sep'; label: string; path: string }> = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    if (i > 0) {
      result.push({ type: 'sep', label: '/', path: '' });
    }
    result.push({ type: 'link', label: item.label, path: item.path });
  }
  return result;
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  const flatItems = buildBreadcrumbItems(items);

  return (
    <nav aria-label="Breadcrumbs">
      {flatItems.map((entry) => (
        <span>
          {entry.type === 'sep' ? (
            <BreadcrumbSeparator />
          ) : (
            <BreadcrumbLink path={entry.path} label={entry.label} />
          )}
        </span>
      ))}
    </nav>
  );
}
