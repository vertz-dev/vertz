import { getInjectedCSS, globalCss, ThemeProvider } from "@vertz/ui";
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
          <div
            style={{
              display: "flex",
              minHeight: "100vh",
              background: "var(--color-background)",
              color: "var(--color-foreground)",
            }}
          >
            <Sidebar />
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: "1",
                minWidth: "0",
              }}
            >
              <Topbar />
              <main style={{ flex: "1", padding: "24px", overflow: "auto" }}>
                <RouterView router={appRouter} />
              </main>
            </div>
          </div>
          <CommandPalette
            open={cmdPaletteOpen}
            onClose={() => { cmdPaletteOpen = false; }}
          />
        </RouterContext.Provider>
      </ThemeProvider>
    </div>
  );
}
