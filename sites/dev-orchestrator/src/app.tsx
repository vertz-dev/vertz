import { css, getInjectedCSS, globalCss, ThemeProvider } from "@vertz/ui";
import { RouterContext, RouterView } from "@vertz/ui/router";
import { CommandPalette } from "./components/command-palette";
import { Sidebar } from "./components/sidebar";
import { Topbar } from "./components/topbar";
import { appRouter } from "./router";
import { themeGlobals } from "./styles/theme";

const appGlobals = globalCss({
  "*": {
    boxSizing: "border-box",
    margin: "0",
    padding: "0",
  },
  body: {
    margin: "0",
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  a: {
    textDecoration: "none",
    color: "inherit",
  },
});

const s = css({
  shell: ['flex', 'min-h:screen', { '&': { background: 'var(--color-background)', color: 'var(--color-foreground)' } }],
  content: ['flex', 'flex-col', 'flex-1', { '&': { 'min-width': '0' } }],
  main: ['flex-1', 'p:6', 'overflow:auto'],
});

export { getInjectedCSS };
export const globalStyles = [themeGlobals.css, appGlobals.css];

export function App() {
  let cmdPaletteOpen = false;

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        cmdPaletteOpen = !cmdPaletteOpen;
      }
    });
  }

  return (
    <div data-testid="app-root">
      <ThemeProvider theme="light">
        <RouterContext.Provider value={appRouter}>
          <div>
            <div className={s.shell}>
              <Sidebar />
              <div className={s.content}>
                <Topbar />
                <main className={s.main}>
                  <RouterView router={appRouter} />
                </main>
              </div>
            </div>
            {cmdPaletteOpen && (
              <CommandPalette
                open={cmdPaletteOpen}
                onClose={() => { cmdPaletteOpen = false; }}
              />
            )}
          </div>
        </RouterContext.Provider>
      </ThemeProvider>
    </div>
  );
}
