import type { SidebarTab } from '../config/types';
import { filePathToTitle, filePathToUrlPath } from '../routing/resolve';

export interface SidebarProps {
  tabs: SidebarTab[];
  activePath: string;
}

function SidebarLink({ page, activePath }: { page: string; activePath: string }) {
  const path = filePathToUrlPath(page);
  const title = filePathToTitle(page);
  const isActive = path === activePath;

  return (
    <a
      href={path}
      data-active={isActive ? 'true' : 'false'}
      style={{
        display: 'block',
        padding: '4px 12px',
        fontSize: '14px',
        textDecoration: 'none',
        borderRadius: '4px',
        color: isActive ? 'var(--docs-primary, #2563eb)' : 'var(--docs-text, #374151)',
        backgroundColor: isActive ? 'var(--docs-primary-bg, #eff6ff)' : 'transparent',
        fontWeight: isActive ? '500' : '400',
      }}
    >
      {title}
    </a>
  );
}

function SidebarGroup({
  group,
  pages,
  activePath,
}: {
  group: string;
  pages: string[];
  activePath: string;
}) {
  return (
    <div data-sidebar-group style={{ marginBottom: '16px' }}>
      <div
        style={{
          fontSize: '12px',
          fontWeight: '600',
          textTransform: 'uppercase',
          color: 'var(--docs-muted, #9ca3af)',
          padding: '4px 12px',
          marginBottom: '4px',
        }}
      >
        {group}
      </div>
      {pages.map((page) => (
        <SidebarLink page={page} activePath={activePath} />
      ))}
    </div>
  );
}

export function Sidebar({ tabs, activePath }: SidebarProps) {
  return (
    <nav aria-label="Sidebar navigation" style={{ padding: '16px 0' }}>
      {tabs.map((tab) => (
        <div data-sidebar-tab>
          {tab.groups.map((g) => (
            <SidebarGroup group={g.title} pages={g.pages} activePath={activePath} />
          ))}
        </div>
      ))}
    </nav>
  );
}
