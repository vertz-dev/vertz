import { CommandPalette } from './command-palette';
import { Header } from './header';
import { Sidebar } from './sidebar';

// Module-level callback ref — always points to the latest mount's toggle function
let toggleSearchFn: (() => void) | null = null;
let cmdKInstalled = false;

interface DocsLayoutProps {
  activeName?: string;
  children?: unknown;
}

function focusCmdInput() {
  setTimeout(() => {
    const input = document.querySelector('[data-cmd-input]') as HTMLInputElement | null;
    if (input) {
      input.focus();
      const firstItem = document.querySelector('.cmd-item');
      if (firstItem) firstItem.setAttribute('data-selected', 'true');
    }
  }, 50);
}

export function DocsLayout({ activeName, children }: DocsLayoutProps) {
  let searchOpen = false;

  function openSearch() {
    focusCmdInput();
    searchOpen = true;
  }

  function closeSearch() {
    searchOpen = false;
  }

  // Update the module-level ref so the global listener always calls the current signal
  toggleSearchFn = () => {
    const isCurrentlyOpen = document.querySelector('[data-backdrop]') as HTMLElement | null;
    const isVisible = isCurrentlyOpen && isCurrentlyOpen.style.display !== 'none';
    if (isVisible) {
      searchOpen = false;
    } else {
      focusCmdInput();
      searchOpen = true;
    }
  };

  // Global keyboard shortcut: Cmd+K / Ctrl+K — register once, delegate to latest ref
  if (typeof window !== 'undefined' && !cmdKInstalled) {
    cmdKInstalled = true;
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleSearchFn?.();
      }
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header onSearchOpen={openSearch} />
      <div
        style={{ display: 'flex', flex: '1', maxWidth: '1400px', margin: '0 auto', width: '100%' }}
      >
        <Sidebar activeName={activeName} />
        <main style={{ flex: '1', minWidth: '0', padding: '32px 48px', maxWidth: '800px' }}>
          {children}
        </main>
      </div>
      <CommandPalette open={searchOpen} onClose={closeSearch} />
    </div>
  );
}
