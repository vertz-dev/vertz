import { Link } from '@vertz/ui/router';
import { getComponentsByCategory } from '../manifest';

export function Sidebar() {
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
      <Link href="/overview" className="sidebar-link" activeClass="sidebar-link-active">
        Overview
      </Link>
      <div style={{ height: '8px' }} />
      {Array.from(grouped.entries()).map((group) => (
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
            {group[0]}
          </div>
          {group[1].map((entry) => (
            <Link
              href={`/components/${entry.name}`}
              className="sidebar-link"
              activeClass="sidebar-link-active"
            >
              {entry.title}
            </Link>
          ))}
        </div>
      ))}
    </aside>
  );
}
