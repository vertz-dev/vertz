import type { DocsConfig } from '../config/types';
import { Footer } from './footer';
import { Header } from './header';
import { Sidebar } from './sidebar';

export interface DocsLayoutProps {
  config: DocsConfig;
  activePath: string;
  content: string | Node;
}

export function DocsLayout({ config, activePath, content }: DocsLayoutProps) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header name={config.name} navbar={config.navbar} />
      <div style={{ display: 'flex', flex: '1' }}>
        <aside
          data-sidebar
          style={{
            width: '256px',
            borderRight: '1px solid var(--docs-border, #e5e7eb)',
            overflowY: 'auto',
            position: 'sticky',
            top: '56px',
            height: 'calc(100vh - 56px)',
          }}
        >
          <Sidebar tabs={config.sidebar} activePath={activePath} />
        </aside>
        <main
          style={{
            flex: '1',
            maxWidth: '768px',
            padding: '32px 48px',
          }}
        >
          {content}
        </main>
      </div>
      <Footer links={config.footer?.links} socials={config.footer?.socials} />
    </div>
  );
}
