import { Header } from './header';
import { Sidebar } from './sidebar';

interface DocsLayoutProps {
  activeName?: string;
  children?: unknown;
}

export function DocsLayout({ activeName, children }: DocsLayoutProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header />
      <div
        style={{ display: 'flex', flex: '1', maxWidth: '1400px', margin: '0 auto', width: '100%' }}
      >
        <Sidebar activeName={activeName} />
        <main style={{ flex: '1', minWidth: '0', padding: '32px 48px', maxWidth: '800px' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
