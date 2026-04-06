import { BotIcon, LayoutDashboardIcon } from "@vertz/icons";
import { css, Link } from "vertz/ui";

const styles = css({
  sidebar: [
    "w:64px",
    "flex",
    "flex-col",
    "min-h:screen",
    "bg:card",
    "border-r:1",
    "border:border",
  ],
  brandIcon: ["font:lg", "font:bold", "text:foreground", "mb:6", "px:2"],
  brandText: ["font:lg", "font:bold", "text:foreground", "mb:6", "px:2"],
  brand: ["font:lg", "font:bold", "text:foreground", "mb:6", "px:2"],
  separator: ["h:1", "bg:border", "mx:4"],
  nav: ["flex", "flex-col", "gap:2", "p:4"],
  navItem: [],
  footer: ["p:4", "font:xs", "text:muted-foreground"],
});

export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <div className={styles.brandIcon}>DO</div>
        <span className={styles.brandText}>Dev Orchestratosr</span>
      </div>
      <div className={styles.separator} />
      <nav className={styles.nav}>
        <Link href="/" className={styles.navItem}>
          <LayoutDashboardIcon />
          Dashboard
        </Link>
        <Link href="/agents" className={styles.navItem}>
          <BotIcon />
          Agents
        </Link>
      </nav>
      <div className={styles.footer}>v0.0.1</div>
    </aside>
  );
}
