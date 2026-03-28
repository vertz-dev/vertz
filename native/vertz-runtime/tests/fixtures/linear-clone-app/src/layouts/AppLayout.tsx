interface AppLayoutProps {
  activePath: string;
  children?: any;
}

export function AppLayout({ activePath, children }: AppLayoutProps) {
  let isSidebarOpen = true;

  return (
    <div class="layout" data-sidebar={isSidebarOpen ? 'open' : 'closed'}>
      <aside class="sidebar">
        <div class="sidebar-header">
          <h2>Linear Clone</h2>
          <button onClick={() => { isSidebarOpen = !isSidebarOpen; }}>
            Toggle
          </button>
        </div>
        <nav class="sidebar-nav">
          <a href="/" class={activePath === '/' ? 'active' : ''}>Inbox</a>
          <a href="/issues" class={activePath === '/issues' ? 'active' : ''}>Issues</a>
          <a href="/projects" class={activePath === '/projects' ? 'active' : ''}>Projects</a>
          <a href="/views" class={activePath === '/views' ? 'active' : ''}>Views</a>
        </nav>
      </aside>
      <main class="content">
        {children}
      </main>
    </div>
  );
}
