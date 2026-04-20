import { Link, useRouter } from '@vertz/ui/router';
import { getComponentsByCategory } from '../manifest';

export function Sidebar() {
  const grouped = getComponentsByCategory();
  const router = useRouter();

  // Derive active state from the reactive route match so the sidebar DOM
  // node stays mounted across navigations while the active link still updates.
  function isActive(name: string): boolean {
    const match = router.current;
    if (name === '__overview') return match?.route.pattern === '/overview';
    return match?.params.name === name;
  }

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
        className={isActive('__overview') ? 'sidebar-link-active' : 'sidebar-link'}
      >
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
              className={isActive(entry.name) ? 'sidebar-link-active' : 'sidebar-link'}
            >
              {entry.title}
            </Link>
          ))}
        </div>
      ))}
    </aside>
  );
}
