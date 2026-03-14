import { css, getInjectedCSS, globalCss, ThemeProvider } from '@vertz/ui';
import { NotesListPage } from './pages/notes-list';
import { layoutStyles } from './styles/components';
import { themeGlobals, notesTheme } from './styles/theme';

const appGlobals = globalCss({
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
});

const headerStyles = css({
  title: ['font:lg', 'font:bold', 'text:foreground'],
  subtitle: ['text:xs', 'text:muted-foreground'],
});

export { getInjectedCSS };
export const theme = notesTheme;
export const styles = [themeGlobals.css, appGlobals.css];

function AppHeader() {
  return (
    <header class={layoutStyles.header}>
      <div>
        <div class={headerStyles.title}>Vertz Notes</div>
        <span class={headerStyles.subtitle}>schema → entity → SDK → UI</span>
      </div>
    </header>
  );
}

export function App() {
  return (
    <div data-testid="app-root">
      <ThemeProvider theme="light">
        <div class={layoutStyles.shell}>
          <AppHeader />
          <main class={layoutStyles.main}>
            <NotesListPage />
          </main>
        </div>
      </ThemeProvider>
    </div>
  );
}
