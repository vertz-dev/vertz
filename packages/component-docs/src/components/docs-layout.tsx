import { onMount } from '@vertz/ui';
import { CommandPalette } from './command-palette';
import { Header } from './header';
import { Sidebar } from './sidebar';

interface DocsLayoutProps {
  children?: unknown;
}

export function DocsLayout({ children }: DocsLayoutProps) {
  let searchOpen = false;

  function openSearch() {
    searchOpen = true;
    setTimeout(() => {
      const input = document.querySelector('[data-cmd-input]') as HTMLInputElement | null;
      input?.focus();
    }, 50);
  }

  function closeSearch() {
    searchOpen = false;
  }

  function toggleSearch() {
    if (searchOpen) {
      closeSearch();
    } else {
      openSearch();
    }
  }

  // Global keyboard shortcut: Cmd+K / Ctrl+K — wired on mount so the
  // cleanup lands in a proper disposal scope (required at the App root).
  onMount(() => {
    function handleCmdK(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleSearch();
      }
    }
    window.addEventListener('keydown', handleCmdK);
    return () => window.removeEventListener('keydown', handleCmdK);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header onSearchOpen={openSearch} />
      <div
        style={{ display: 'flex', flex: '1', maxWidth: '1400px', margin: '0 auto', width: '100%' }}
      >
        <Sidebar />
        <main style={{ flex: '1', minWidth: '0', padding: '32px 48px', maxWidth: '800px' }}>
          {children}
        </main>
      </div>
      <CommandPalette open={searchOpen} onClose={closeSearch} />
    </div>
  );
}
