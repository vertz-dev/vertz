import { Link } from '@vertz/ui/router';
import { getComponentsByCategory } from '../manifest';

interface SidebarProps {
  activeName?: string;
}

export function Sidebar({ activeName }: SidebarProps) {
  const grouped = getComponentsByCategory();

  return (
    <aside
      style={{
        position: 'sticky',
        top: '56px',
        width: '240px',
        height: 'calc(100vh - 56px)',
        overflowY: 'auto',
        borderRight: '1px solid var(--color-border)',
        padding: '16px 0',
        flexShrink: '0',
      }}
    >
      <Link
        href="/overview"
        className={activeName === '__overview' ? 'sidebar-link-active' : 'sidebar-link'}
      >
        Overview
      </Link>
      <div style={{ height: '8px' }} />
      {Array.from(grouped.entries()).map(([category, entries]) => (
        <div>
          <div
            style={{
              padding: '8px 24px 4px',
              fontSize: '12px',
              fontWeight: '600',
              color: 'var(--color-muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {category}
          </div>
          {entries.map((entry) => (
            <Link
              href={`/components/${entry.name}`}
              className={entry.name === activeName ? 'sidebar-link-active' : 'sidebar-link'}
            >
              {entry.title}
            </Link>
          ))}
        </div>
      ))}
    </aside>
  );
}
