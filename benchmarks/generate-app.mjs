#!/usr/bin/env node
/**
 * Generate benchmark apps for vinext and Vertz comparison.
 *
 * Both apps are generated from the same seeded PRNG (mulberry32, seed 42)
 * so they have identical deterministic content (product prices, analytics
 * data, blog posts, user tables). This ensures fair code volume comparison.
 *
 * vinext app: React/RSC with Next.js file-based routing (31 pages, no API routes)
 * Vertz app: Signals-based with code-based routing (31 pages)
 */
import { mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ─── Seeded PRNG ──────────────────────────────────────────────────────────────
// mulberry32 — identical to vinext's generator for deterministic reproducibility.
function mulberry32(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE = dirname(new URL(import.meta.url).pathname);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function write(base, rel, content) {
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content.trimStart() + '\n');
}

function countFilesInDir(dir, ext) {
  let count = 0;
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) count += countFilesInDir(full, ext);
    else if (entry.endsWith(ext)) count++;
  }
  return count;
}

function totalBytes(dir) {
  let bytes = 0;
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) bytes += totalBytes(full);
    else bytes += s.size;
  }
  return bytes;
}

// ─── Pre-compute deterministic data ───────────────────────────────────────────
// Use a fresh PRNG for each app to ensure identical data sequences.

function computeData() {
  const random = mulberry32(42);
  const productPrices = Array.from({ length: 20 }, () =>
    (Math.round(random() * 10000) / 100).toFixed(2)
  );
  const analyticsRows = Array.from({ length: 10 }, () => ({
    views: Math.floor(random() * 10000),
    bounce: Math.floor(random() * 100),
  }));
  return { productPrices, analyticsRows };
}

// ─── Static pages (shared between both apps) ─────────────────────────────────

const staticPages = [
  'features', 'pricing', 'team', 'careers', 'contact',
  'faq', 'terms', 'privacy', 'changelog', 'roadmap',
  'support', 'community', 'partners', 'press', 'security',
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VINEXT APP (React/RSC, file-based routing)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateVinextApp() {
  const APP = join(BASE, 'vinext', 'app');
  rmSync(APP, { recursive: true, force: true });

  const { productPrices, analyticsRows } = computeData();
  const w = (rel, content) => write(APP, rel, content);

  // Root layout
  w('layout.tsx', `
export const dynamic = "force-dynamic";

export const metadata = {
  title: { default: "Benchmark App", template: "%s | Benchmark" },
  description: "A realistic benchmark app for comparing frameworks",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav style={{ padding: "1rem", borderBottom: "1px solid #eee", display: "flex", gap: "1rem" }}>
          <a href="/">Home</a>
          <a href="/products">Products</a>
          <a href="/blog">Blog</a>
          <a href="/dashboard">Dashboard</a>
          <a href="/about">About</a>
          <a href="/docs">Docs</a>
          <a href="/settings">Settings</a>
        </nav>
        <main style={{ padding: "1rem" }}>{children}</main>
      </body>
    </html>
  );
}
  `);

  // Home
  w('page.tsx', `
export default function Home() {
  const now = new Date().toISOString();
  return (
    <div>
      <h1>Benchmark App</h1>
      <p>Server-rendered at {now}</p>
      <p>This is a realistic benchmark app with 31 routes, nested layouts, dynamic routes, and client components.</p>
    </div>
  );
}
  `);

  // Client components
  w('_components/counter.tsx', `
"use client";
import { useState } from "react";

export function Counter({ label = "Count" }: { label?: string }) {
  const [count, setCount] = useState(0);
  return (
    <div style={{ padding: "0.5rem", border: "1px solid #ddd", borderRadius: "4px", display: "inline-block" }}>
      <span>{label}: {count}</span>
      <button onClick={() => setCount(c => c + 1)} style={{ marginLeft: "0.5rem" }}>+</button>
    </div>
  );
}
  `);

  w('_components/timer.tsx', `
"use client";
import { useState, useEffect } from "react";

export function Timer() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return <span>Uptime: {elapsed}s</span>;
}
  `);

  w('_components/search.tsx', `
"use client";
import { useState } from "react";

export function Search({ placeholder = "Search..." }: { placeholder?: string }) {
  const [query, setQuery] = useState("");
  return (
    <div style={{ marginBottom: "1rem" }}>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder}
        style={{ padding: "0.5rem", border: "1px solid #ddd", borderRadius: "4px", width: "300px" }}
      />
      {query && <p style={{ fontSize: "0.8rem", color: "#666" }}>Searching for: {query}</p>}
    </div>
  );
}
  `);

  // About
  w('about/page.tsx', `
export const metadata = { title: "About" };
export default function AboutPage() {
  return (
    <div>
      <h1>About</h1>
      <p>This is a benchmark application for comparing framework performance.</p>
      <p>It includes 31 routes with nested layouts, dynamic routes, server components, client components, and metadata.</p>
    </div>
  );
}
  `);

  // Products section
  w('products/layout.tsx', `
export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div style={{ padding: "0.5rem", background: "#f0f0f0", marginBottom: "1rem" }}>
        <strong>Products</strong> — <a href="/products">All</a>
      </div>
      {children}
    </div>
  );
}
  `);

  w('products/page.tsx', `
import Link from "next/link";
export const metadata = { title: "Products" };

const products = [
${productPrices.map((price, i) => `  { id: ${i + 1}, name: "Product ${i + 1}", price: ${price} },`).join('\n')}
];

export default function ProductsPage() {
  return (
    <div>
      <h1>Products</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
        {products.map(p => (
          <Link key={p.id} href={\`/products/\${p.id}\`} style={{ padding: "1rem", border: "1px solid #ddd", textDecoration: "none", color: "inherit" }}>
            <h3>{p.name}</h3>
            <p>\${p.price}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
  `);

  w('products/[id]/page.tsx', `
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: \`Product \${id}\` };
}
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <h1>Product {id}</h1>
      <p>This is the detail page for product {id}. Rendered at {new Date().toISOString()}</p>
    </div>
  );
}
  `);

  // Blog section
  w('blog/layout.tsx', `
import { Search } from "../_components/search";
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div style={{ padding: "0.5rem", background: "#f5f5ff", marginBottom: "1rem" }}>
        <strong>Blog</strong> — <a href="/blog">All Posts</a>
      </div>
      <Search placeholder="Search posts..." />
      {children}
    </div>
  );
}
  `);

  w('blog/page.tsx', `
import Link from "next/link";
export const metadata = { title: "Blog" };
const posts = Array.from({ length: 25 }, (_, i) => ({
  slug: \`post-\${i + 1}\`,
  title: \`Blog Post \${i + 1}: \${["React Patterns", "Server Components", "Caching", "Deployment", "Performance"][i % 5]}\`,
  date: new Date(2025, 0, i + 1).toLocaleDateString(),
}));
export default function BlogPage() {
  return (
    <div>
      <h1>Blog</h1>
      {posts.map(post => (
        <article key={post.slug} style={{ marginBottom: "1rem", paddingBottom: "1rem", borderBottom: "1px solid #eee" }}>
          <Link href={\`/blog/\${post.slug}\`}><h2>{post.title}</h2></Link>
          <time>{post.date}</time>
        </article>
      ))}
    </div>
  );
}
  `);

  w('blog/[slug]/page.tsx', `
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: slug.replace(/-/g, " ") };
}
export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const paragraphs = Array.from({ length: 5 }, (_, i) =>
    \`Paragraph \${i + 1} of "\${slug}". Lorem ipsum dolor sit amet, consectetur adipiscing elit.\`
  );
  return (
    <div>
      <h1>{slug.replace(/-/g, " ")}</h1>
      <time>{new Date().toLocaleDateString()}</time>
      {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
    </div>
  );
}
  `);

  // Dashboard section
  w('dashboard/layout.tsx', `
import { Timer } from "../_components/timer";
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "200px 1fr" }}>
      <aside style={{ padding: "1rem", borderRight: "1px solid #eee" }}>
        <h3>Dashboard</h3>
        <nav style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <a href="/dashboard">Overview</a>
          <a href="/dashboard/analytics">Analytics</a>
          <a href="/dashboard/users">Users</a>
          <a href="/dashboard/settings">Settings</a>
        </nav>
        <div style={{ marginTop: "1rem", fontSize: "0.8rem", color: "#666" }}><Timer /></div>
      </aside>
      <div style={{ padding: "1rem" }}>{children}</div>
    </div>
  );
}
  `);

  w('dashboard/page.tsx', `
import { Counter } from "../_components/counter";
export const metadata = { title: "Dashboard" };
export default function DashboardPage() {
  const stats = [
    { label: "Total Users", value: "12,345" },
    { label: "Revenue", value: "$98,765" },
    { label: "Orders", value: "3,456" },
    { label: "Conversion", value: "3.2%" },
  ];
  return (
    <div>
      <h1>Dashboard Overview</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {stats.map(s => (
          <div key={s.label} style={{ padding: "1rem", border: "1px solid #ddd", borderRadius: "8px" }}>
            <div style={{ fontSize: "0.8rem", color: "#666" }}>{s.label}</div>
            <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{s.value}</div>
          </div>
        ))}
      </div>
      <Counter label="Page Views" />
    </div>
  );
}
  `);

  w('dashboard/analytics/page.tsx', `
export const metadata = { title: "Analytics" };

const rows = [
${analyticsRows.map((r, i) => `  { page: "/page-${i + 1}", views: ${r.views}, bounce: ${r.bounce} },`).join('\n')}
];

export default function AnalyticsPage() {
  return (
    <div>
      <h1>Analytics</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th>Page</th><th>Views</th><th>Bounce Rate</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.page} style={{ borderBottom: "1px solid #eee" }}>
            <td style={{ padding: "0.5rem" }}>{r.page}</td>
            <td style={{ padding: "0.5rem" }}>{r.views.toLocaleString()}</td>
            <td style={{ padding: "0.5rem" }}>{r.bounce}%</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
  `);

  w('dashboard/users/page.tsx', `
export const metadata = { title: "Users" };
export default function UsersPage() {
  const users = Array.from({ length: 15 }, (_, i) => ({
    id: i + 1, name: \`User \${i + 1}\`, email: \`user\${i + 1}@example.com\`, role: i % 3 === 0 ? "Admin" : "User",
  }));
  return (
    <div>
      <h1>Users</h1>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th></tr></thead>
        <tbody>{users.map(u => (
          <tr key={u.id} style={{ borderBottom: "1px solid #eee" }}>
            <td style={{ padding: "0.5rem" }}>{u.id}</td><td style={{ padding: "0.5rem" }}>{u.name}</td>
            <td style={{ padding: "0.5rem" }}>{u.email}</td><td style={{ padding: "0.5rem" }}>{u.role}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
  `);

  w('dashboard/settings/page.tsx', `
import { Counter } from "../../_components/counter";
export const metadata = { title: "Dashboard Settings" };
export default function DashboardSettingsPage() {
  return (<div><h1>Dashboard Settings</h1><p>Configure dashboard preferences.</p><Counter label="Saves" /></div>);
}
  `);

  // Docs
  w('docs/page.tsx', `
import Link from "next/link";
export const metadata = { title: "Documentation" };
const sections = ["getting-started", "installation", "configuration", "api-reference", "deployment", "troubleshooting", "migration", "plugins"];
export default function DocsIndex() {
  return (<div><h1>Documentation</h1><ul>{sections.map(s => <li key={s}><Link href={\`/docs/\${s}\`}>{s.replace(/-/g, " ")}</Link></li>)}</ul></div>);
}
  `);

  w('docs/[...slug]/page.tsx', `
export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return { title: \`Docs: \${slug.join(" / ")}\` };
}
export default async function DocPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return (<div><h1>Docs: {slug.join(" / ")}</h1>{Array.from({ length: 3 }, (_, i) => <p key={i}>Section {i + 1} content.</p>)}</div>);
}
  `);

  // Settings section
  w('settings/layout.tsx', `
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", gap: "1rem", padding: "0.5rem", background: "#fafafa", marginBottom: "1rem" }}>
        <a href="/settings">General</a>
        <a href="/settings/profile">Profile</a>
        <a href="/settings/notifications">Notifications</a>
        <a href="/settings/billing">Billing</a>
      </div>
      {children}
    </div>
  );
}
  `);

  for (const page of ['', 'profile', 'notifications', 'billing']) {
    const name = page || 'General';
    const dir = page ? `settings/${page}` : 'settings';
    w(`${dir}/page.tsx`, `
export const metadata = { title: "Settings - ${name}" };
export default function Settings${name.charAt(0).toUpperCase() + name.slice(1)}Page() {
  return (<div><h1>Settings: ${name}</h1><p>Configure ${name.toLowerCase()} settings.</p></div>);
}
    `);
  }

  // Static pages
  for (const page of staticPages) {
    const title = page.charAt(0).toUpperCase() + page.slice(1);
    w(`${page}/page.tsx`, `
export const metadata = { title: "${title}" };
export default function ${title}Page() {
  return (
    <div>
      <h1>${title}</h1>
      <p>This is the ${page} page with information about ${page}.</p>
      ${page === 'faq' ? `
      <div>
        {Array.from({ length: 10 }, (_, i) => (
          <details key={i} style={{ marginBottom: "0.5rem" }}>
            <summary>Question {i + 1}?</summary>
            <p>Answer to question {i + 1}.</p>
          </details>
        ))}
      </div>` : `
      <p>More content for the ${page} section would go here.</p>`}
    </div>
  );
}
    `);
  }

  const pages = countFilesInDir(APP, 'page.tsx');
  console.log(`vinext: ${pages} pages generated`);
  return { pages, bytes: totalBytes(APP) };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VERTZ APP (Signals-based, code routing, css() styling)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateVertzApp() {
  const SRC = join(BASE, 'vertz', 'src');
  rmSync(SRC, { recursive: true, force: true });

  const { productPrices, analyticsRows } = computeData();
  const w = (rel, content) => write(SRC, rel, content);

  // ── Theme ─────────────────────────────────────────────────────────────────

  w('styles/theme.ts', `
import { configureTheme } from '@vertz/theme-shadcn';

const { theme, globals, styles } = configureTheme({
  palette: 'zinc',
  radius: 'md',
});

export const benchmarkTheme = theme;
export const themeGlobals = globals;
export const themeStyles = styles;
  `);

  w('styles/components.ts', `
import { css } from '@vertz/ui';

export const layoutStyles = css({
  shell: ['flex', 'flex-col', 'min-h:screen', 'bg:background'],
  main: ['flex-1', 'p:6'],
});

export const navStyles = css({
  nav: ['flex', 'gap:4', 'p:4', 'border-b:1', 'border:border'],
  link: ['text:sm', 'text:muted-foreground', 'hover:text:foreground', 'transition:colors'],
});

export const pageStyles = css({
  container: ['p:6'],
  title: ['font:2xl', 'font:bold', 'text:foreground', 'mb:4'],
  subtitle: ['font:lg', 'font:semibold', 'text:foreground', 'mb:2'],
  paragraph: ['text:sm', 'text:muted-foreground', 'mb:4'],
  grid: ['grid', 'grid-cols:4', 'gap:4', 'mb:6'],
  card: ['p:4', 'rounded:lg', 'border:1', 'border:border', 'bg:card'],
  cardLabel: ['text:xs', 'text:muted-foreground'],
  cardValue: ['font:xl', 'font:bold', 'text:foreground'],
});

export const tableStyles = css({
  table: ['w:full'],
  th: ['p:2', 'text:left', 'font:semibold', 'text:foreground', 'border-b:2', 'border:border'],
  td: ['p:2', 'text:sm', 'text:muted-foreground', 'border-b:1', 'border:border'],
});

export const sectionStyles = css({
  header: ['p:2', 'bg:muted', 'rounded:md', 'mb:4'],
  headerTitle: ['font:semibold', 'text:foreground'],
  headerLink: ['text:sm', 'text:muted-foreground', 'hover:text:foreground'],
  tabNav: ['flex', 'gap:4', 'p:2', 'bg:muted', 'rounded:md', 'mb:4'],
});

export const formStyles = css({
  input: [
    'px:3', 'py:2', 'rounded:md', 'border:1', 'border:border',
    'bg:background', 'text:foreground', 'text:sm', 'w:80',
  ],
  searchHint: ['text:xs', 'text:muted-foreground', 'mt:1'],
});

export const counterStyles = css({
  wrapper: ['inline-flex', 'items:center', 'gap:2', 'p:2', 'rounded:md', 'border:1', 'border:border'],
  button: ['px:2', 'py:1', 'rounded:sm', 'bg:primary', 'text:primary-foreground', 'text:sm'],
});

export const faqStyles = css({
  details: ['mb:2', 'p:2', 'rounded:md', 'border:1', 'border:border'],
  summary: ['cursor:pointer', 'font:medium', 'text:foreground'],
  answer: ['text:sm', 'text:muted-foreground', 'mt:1'],
});
  `);

  // ── Reactive components ───────────────────────────────────────────────────

  w('components/counter.tsx', `
import { counterStyles } from '../styles/components';

export interface CounterProps {
  label?: string;
}

export function Counter({ label = 'Count' }: CounterProps) {
  let count = 0;
  return (
    <div class={counterStyles.wrapper}>
      <span>{label}: {count}</span>
      <button class={counterStyles.button} onClick={() => { count++; }}>+</button>
    </div>
  );
}
  `);

  w('components/timer.tsx', `
export function Timer() {
  let elapsed = 0;
  setInterval(() => { elapsed++; }, 1000);
  return <span>Uptime: {elapsed}s</span>;
}
  `);

  w('components/search.tsx', `
import { formStyles } from '../styles/components';

export interface SearchProps {
  placeholder?: string;
}

export function Search({ placeholder = 'Search...' }: SearchProps) {
  let query = '';
  return (
    <div>
      <input
        type="text"
        value={query}
        onInput={(e: Event) => { query = (e.target as HTMLInputElement).value; }}
        placeholder={placeholder}
        class={formStyles.input}
      />
      {query && <p class={formStyles.searchHint}>Searching for: {query}</p>}
    </div>
  );
}
  `);

  // ── Layouts ───────────────────────────────────────────────────────────────

  w('layouts/products-layout.tsx', `
import { sectionStyles } from '../styles/components';

export function ProductsLayout({ children }: { children: any }) {
  return (
    <div>
      <div class={sectionStyles.header}>
        <span class={sectionStyles.headerTitle}>Products</span>
        {' — '}
        <a href="/products" class={sectionStyles.headerLink}>All</a>
      </div>
      {children}
    </div>
  );
}
  `);

  w('layouts/blog-layout.tsx', `
import { Search } from '../components/search';
import { sectionStyles } from '../styles/components';

export function BlogLayout({ children }: { children: any }) {
  return (
    <div>
      <div class={sectionStyles.header}>
        <span class={sectionStyles.headerTitle}>Blog</span>
        {' — '}
        <a href="/blog" class={sectionStyles.headerLink}>All Posts</a>
      </div>
      <Search placeholder="Search posts..." />
      {children}
    </div>
  );
}
  `);

  w('layouts/dashboard-layout.tsx', `
import { Timer } from '../components/timer';
import { css } from '@vertz/ui';

const styles = css({
  wrapper: ['flex'],
  sidebar: ['p:4', 'border-r:1', 'border:border'],
  sidebarTitle: ['font:lg', 'font:semibold', 'mb:4'],
  nav: ['flex', 'flex-col', 'gap:2'],
  navLink: ['text:sm', 'text:muted-foreground', 'hover:text:foreground'],
  timerWrap: ['mt:4', 'text:xs', 'text:muted-foreground'],
  content: ['flex-1', 'p:4'],
});

export function DashboardLayout({ children }: { children: any }) {
  return (
    <div class={styles.wrapper}>
      <aside class={styles.sidebar} style="width: 200px; flex-shrink: 0">
        <h3 class={styles.sidebarTitle}>Dashboard</h3>
        <nav class={styles.nav}>
          <a href="/dashboard" class={styles.navLink}>Overview</a>
          <a href="/dashboard/analytics" class={styles.navLink}>Analytics</a>
          <a href="/dashboard/users" class={styles.navLink}>Users</a>
          <a href="/dashboard/settings" class={styles.navLink}>Settings</a>
        </nav>
        <div class={styles.timerWrap}><Timer /></div>
      </aside>
      <div class={styles.content}>{children}</div>
    </div>
  );
}
  `);

  w('layouts/settings-layout.tsx', `
import { css } from '@vertz/ui';

const styles = css({
  wrapper: ['flex'],
  sidebar: ['p:4', 'border-r:1', 'border:border'],
  sidebarTitle: ['font:lg', 'font:semibold', 'mb:4'],
  nav: ['flex', 'flex-col', 'gap:2'],
  navLink: ['text:sm', 'text:muted-foreground', 'hover:text:foreground'],
  content: ['flex-1', 'p:4'],
});

export function SettingsLayout({ children }: { children: any }) {
  return (
    <div class={styles.wrapper}>
      <aside class={styles.sidebar} style="width: 200px; flex-shrink: 0">
        <h3 class={styles.sidebarTitle}>Settings</h3>
        <nav class={styles.nav}>
          <a href="/settings" class={styles.navLink}>General</a>
          <a href="/settings/profile" class={styles.navLink}>Profile</a>
          <a href="/settings/notifications" class={styles.navLink}>Notifications</a>
          <a href="/settings/billing" class={styles.navLink}>Billing</a>
        </nav>
      </aside>
      <div class={styles.content}>{children}</div>
    </div>
  );
}
  `);

  // ── Pages ─────────────────────────────────────────────────────────────────

  // Home
  w('pages/home.tsx', `
import { pageStyles } from '../styles/components';

export function HomePage() {
  return (
    <div class={pageStyles.container}>
      <h1 class={pageStyles.title}>Benchmark App</h1>
      <p class={pageStyles.paragraph}>This is a realistic benchmark app with 31 routes, nested layouts, dynamic routes, and reactive components.</p>
    </div>
  );
}
  `);

  // About
  w('pages/about.tsx', `
import { pageStyles } from '../styles/components';

export function AboutPage() {
  return (
    <div class={pageStyles.container}>
      <h1 class={pageStyles.title}>About</h1>
      <p class={pageStyles.paragraph}>This is a benchmark application for comparing framework performance.</p>
      <p class={pageStyles.paragraph}>It includes 31 routes with nested layouts, dynamic routes, and reactive components.</p>
    </div>
  );
}
  `);

  // Products
  w('pages/products-index.tsx', `
import { pageStyles } from '../styles/components';
import { ProductsLayout } from '../layouts/products-layout';

const products = [
${productPrices.map((price, i) => `  { id: ${i + 1}, name: 'Product ${i + 1}', price: ${price} },`).join('\n')}
];

export function ProductsIndexPage() {
  return (
    <ProductsLayout>
      <div class={pageStyles.container}>
        <h1 class={pageStyles.title}>Products</h1>
        <div class={pageStyles.grid}>
          {products.map(p => (
            <a key={p.id} href={\`/products/\${p.id}\`} class={pageStyles.card}>
              <h3 class={pageStyles.subtitle}>{p.name}</h3>
              <p class={pageStyles.paragraph}>\${p.price}</p>
            </a>
          ))}
        </div>
      </div>
    </ProductsLayout>
  );
}
  `);

  w('pages/product-detail.tsx', `
import { pageStyles } from '../styles/components';
import { ProductsLayout } from '../layouts/products-layout';
import { useParams } from '@vertz/ui';

export function ProductDetailPage() {
  const { id } = useParams<'/products/:id'>();
  return (
    <ProductsLayout>
      <div class={pageStyles.container}>
        <h1 class={pageStyles.title}>Product {id}</h1>
        <p class={pageStyles.paragraph}>This is the detail page for product {id}.</p>
      </div>
    </ProductsLayout>
  );
}
  `);

  // Blog
  w('pages/blog-index.tsx', `
import { pageStyles } from '../styles/components';
import { BlogLayout } from '../layouts/blog-layout';
import { css } from '@vertz/ui';

const blogStyles = css({
  article: ['mb:4', 'pb:4', 'border-b:1', 'border:border'],
});

const posts = Array.from({ length: 25 }, (_, i) => ({
  slug: \`post-\${i + 1}\`,
  title: \`Blog Post \${i + 1}: \${['React Patterns', 'Server Components', 'Caching', 'Deployment', 'Performance'][i % 5]}\`,
  date: new Date(2025, 0, i + 1).toLocaleDateString(),
}));

export function BlogIndexPage() {
  return (
    <BlogLayout>
      <div class={pageStyles.container}>
        <h1 class={pageStyles.title}>Blog</h1>
        {posts.map(post => (
          <article key={post.slug} class={blogStyles.article}>
            <a href={\`/blog/\${post.slug}\`}><h2 class={pageStyles.subtitle}>{post.title}</h2></a>
            <time class={pageStyles.paragraph}>{post.date}</time>
          </article>
        ))}
      </div>
    </BlogLayout>
  );
}
  `);

  w('pages/blog-post.tsx', `
import { pageStyles } from '../styles/components';
import { BlogLayout } from '../layouts/blog-layout';
import { useParams } from '@vertz/ui';

export function BlogPostPage() {
  const { slug } = useParams<'/blog/:slug'>();
  const paragraphs = Array.from({ length: 5 }, (_, i) =>
    \`Paragraph \${i + 1} of "\${slug}". Lorem ipsum dolor sit amet, consectetur adipiscing elit.\`
  );
  return (
    <BlogLayout>
      <div class={pageStyles.container}>
        <h1 class={pageStyles.title}>{slug.replace(/-/g, ' ')}</h1>
        {paragraphs.map((p, i) => <p key={i} class={pageStyles.paragraph}>{p}</p>)}
      </div>
    </BlogLayout>
  );
}
  `);

  // Dashboard
  w('pages/dashboard-overview.tsx', `
import { pageStyles } from '../styles/components';
import { DashboardLayout } from '../layouts/dashboard-layout';
import { Counter } from '../components/counter';

export function DashboardOverviewPage() {
  const stats = [
    { label: 'Total Users', value: '12,345' },
    { label: 'Revenue', value: '$98,765' },
    { label: 'Orders', value: '3,456' },
    { label: 'Conversion', value: '3.2%' },
  ];
  return (
    <DashboardLayout>
      <div class={pageStyles.container}>
        <h1 class={pageStyles.title}>Dashboard Overview</h1>
        <div class={pageStyles.grid}>
          {stats.map(s => (
            <div key={s.label} class={pageStyles.card}>
              <div class={pageStyles.cardLabel}>{s.label}</div>
              <div class={pageStyles.cardValue}>{s.value}</div>
            </div>
          ))}
        </div>
        <Counter label="Page Views" />
      </div>
    </DashboardLayout>
  );
}
  `);

  w('pages/dashboard-analytics.tsx', `
import { pageStyles, tableStyles } from '../styles/components';
import { DashboardLayout } from '../layouts/dashboard-layout';

const rows = [
${analyticsRows.map((r, i) => `  { page: '/page-${i + 1}', views: ${r.views}, bounce: ${r.bounce} },`).join('\n')}
];

export function DashboardAnalyticsPage() {
  return (
    <DashboardLayout>
      <div class={pageStyles.container}>
        <h1 class={pageStyles.title}>Analytics</h1>
        <table class={tableStyles.table} style="border-collapse: collapse">
          <thead><tr><th class={tableStyles.th}>Page</th><th class={tableStyles.th}>Views</th><th class={tableStyles.th}>Bounce Rate</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.page}>
              <td class={tableStyles.td}>{r.page}</td>
              <td class={tableStyles.td}>{r.views.toLocaleString()}</td>
              <td class={tableStyles.td}>{r.bounce}%</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
  `);

  w('pages/dashboard-users.tsx', `
import { pageStyles, tableStyles } from '../styles/components';
import { DashboardLayout } from '../layouts/dashboard-layout';

export function DashboardUsersPage() {
  const users = Array.from({ length: 15 }, (_, i) => ({
    id: i + 1, name: \`User \${i + 1}\`, email: \`user\${i + 1}@example.com\`, role: i % 3 === 0 ? 'Admin' : 'User',
  }));
  return (
    <DashboardLayout>
      <div class={pageStyles.container}>
        <h1 class={pageStyles.title}>Users</h1>
        <table class={tableStyles.table} style="border-collapse: collapse">
          <thead><tr><th class={tableStyles.th}>ID</th><th class={tableStyles.th}>Name</th><th class={tableStyles.th}>Email</th><th class={tableStyles.th}>Role</th></tr></thead>
          <tbody>{users.map(u => (
            <tr key={u.id}>
              <td class={tableStyles.td}>{u.id}</td><td class={tableStyles.td}>{u.name}</td>
              <td class={tableStyles.td}>{u.email}</td><td class={tableStyles.td}>{u.role}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
  `);

  w('pages/dashboard-settings.tsx', `
import { pageStyles } from '../styles/components';
import { DashboardLayout } from '../layouts/dashboard-layout';
import { Counter } from '../components/counter';

export function DashboardSettingsPage() {
  return (
    <DashboardLayout>
      <div class={pageStyles.container}>
        <h1 class={pageStyles.title}>Dashboard Settings</h1>
        <p class={pageStyles.paragraph}>Configure dashboard preferences.</p>
        <Counter label="Saves" />
      </div>
    </DashboardLayout>
  );
}
  `);

  // Docs
  w('pages/docs-index.tsx', `
import { pageStyles } from '../styles/components';

const sections = ['getting-started', 'installation', 'configuration', 'api-reference', 'deployment', 'troubleshooting', 'migration', 'plugins'];

export function DocsIndexPage() {
  return (
    <div class={pageStyles.container}>
      <h1 class={pageStyles.title}>Documentation</h1>
      <ul>
        {sections.map(s => (
          <li key={s}><a href={\`/docs/\${s}\`}>{s.replace(/-/g, ' ')}</a></li>
        ))}
      </ul>
    </div>
  );
}
  `);

  w('pages/docs-page.tsx', `
import { pageStyles } from '../styles/components';
import { useParams } from '@vertz/ui';

export function DocsPage() {
  const { slug } = useParams<'/docs/:slug'>();
  return (
    <div class={pageStyles.container}>
      <h1 class={pageStyles.title}>Docs: {slug.replace(/-/g, ' ')}</h1>
      {Array.from({ length: 3 }, (_, i) => <p key={i} class={pageStyles.paragraph}>Section {i + 1} content.</p>)}
    </div>
  );
}
  `);

  // Settings
  for (const page of ['', 'profile', 'notifications', 'billing']) {
    const name = page || 'general';
    const displayName = name.charAt(0).toUpperCase() + name.slice(1);
    const fileName = `settings-${name}`;

    w(`pages/${fileName}.tsx`, `
import { pageStyles } from '../styles/components';
import { SettingsLayout } from '../layouts/settings-layout';

export function Settings${displayName}Page() {
  return (
    <SettingsLayout>
      <div class={pageStyles.container}>
        <h1 class={pageStyles.title}>Settings: ${displayName}</h1>
        <p class={pageStyles.paragraph}>Configure ${name} settings.</p>
      </div>
    </SettingsLayout>
  );
}
    `);
  }

  // Static pages
  for (const page of staticPages) {
    const title = page.charAt(0).toUpperCase() + page.slice(1);

    if (page === 'faq') {
      w(`pages/${page}.tsx`, `
import { pageStyles, faqStyles } from '../styles/components';

export function ${title}Page() {
  return (
    <div class={pageStyles.container}>
      <h1 class={pageStyles.title}>${title}</h1>
      <p class={pageStyles.paragraph}>This is the ${page} page with information about ${page}.</p>
      <div>
        {Array.from({ length: 10 }, (_, i) => (
          <details key={i} class={faqStyles.details}>
            <summary class={faqStyles.summary}>Question {i + 1}?</summary>
            <p class={faqStyles.answer}>Answer to question {i + 1}.</p>
          </details>
        ))}
      </div>
    </div>
  );
}
      `);
    } else {
      w(`pages/${page}.tsx`, `
import { pageStyles } from '../styles/components';

export function ${title}Page() {
  return (
    <div class={pageStyles.container}>
      <h1 class={pageStyles.title}>${title}</h1>
      <p class={pageStyles.paragraph}>This is the ${page} page with information about ${page}.</p>
      <p class={pageStyles.paragraph}>More content for the ${page} section would go here.</p>
    </div>
  );
}
      `);
    }
  }

  // ── Router ────────────────────────────────────────────────────────────────

  w('router.ts', `
import type { InferRouteMap } from '@vertz/ui';
import { computed, createLink, createRouter, defineRoutes, useRouter } from '@vertz/ui';

import { HomePage } from './pages/home';
import { AboutPage } from './pages/about';
import { ProductsIndexPage } from './pages/products-index';
import { ProductDetailPage } from './pages/product-detail';
import { BlogIndexPage } from './pages/blog-index';
import { BlogPostPage } from './pages/blog-post';
import { DashboardOverviewPage } from './pages/dashboard-overview';
import { DashboardAnalyticsPage } from './pages/dashboard-analytics';
import { DashboardUsersPage } from './pages/dashboard-users';
import { DashboardSettingsPage } from './pages/dashboard-settings';
import { DocsIndexPage } from './pages/docs-index';
import { DocsPage } from './pages/docs-page';
import { SettingsGeneralPage } from './pages/settings-general';
import { SettingsProfilePage } from './pages/settings-profile';
import { SettingsNotificationsPage } from './pages/settings-notifications';
import { SettingsBillingPage } from './pages/settings-billing';
import { FeaturesPage } from './pages/features';
import { PricingPage } from './pages/pricing';
import { TeamPage } from './pages/team';
import { CareersPage } from './pages/careers';
import { ContactPage } from './pages/contact';
import { FaqPage } from './pages/faq';
import { TermsPage } from './pages/terms';
import { PrivacyPage } from './pages/privacy';
import { ChangelogPage } from './pages/changelog';
import { RoadmapPage } from './pages/roadmap';
import { SupportPage } from './pages/support';
import { CommunityPage } from './pages/community';
import { PartnersPage } from './pages/partners';
import { PressPage } from './pages/press';
import { SecurityPage } from './pages/security';

export const routes = defineRoutes({
  '/': { component: () => HomePage() },
  '/about': { component: () => AboutPage() },
  '/products': { component: () => ProductsIndexPage() },
  '/products/:id': { component: () => ProductDetailPage() },
  '/blog': { component: () => BlogIndexPage() },
  '/blog/:slug': { component: () => BlogPostPage() },
  '/dashboard': { component: () => DashboardOverviewPage() },
  '/dashboard/analytics': { component: () => DashboardAnalyticsPage() },
  '/dashboard/users': { component: () => DashboardUsersPage() },
  '/dashboard/settings': { component: () => DashboardSettingsPage() },
  '/docs': { component: () => DocsIndexPage() },
  '/docs/:slug': { component: () => DocsPage() },
  '/settings': { component: () => SettingsGeneralPage() },
  '/settings/profile': { component: () => SettingsProfilePage() },
  '/settings/notifications': { component: () => SettingsNotificationsPage() },
  '/settings/billing': { component: () => SettingsBillingPage() },
  '/features': { component: () => FeaturesPage() },
  '/pricing': { component: () => PricingPage() },
  '/team': { component: () => TeamPage() },
  '/careers': { component: () => CareersPage() },
  '/contact': { component: () => ContactPage() },
  '/faq': { component: () => FaqPage() },
  '/terms': { component: () => TermsPage() },
  '/privacy': { component: () => PrivacyPage() },
  '/changelog': { component: () => ChangelogPage() },
  '/roadmap': { component: () => RoadmapPage() },
  '/support': { component: () => SupportPage() },
  '/community': { component: () => CommunityPage() },
  '/partners': { component: () => PartnersPage() },
  '/press': { component: () => PressPage() },
  '/security': { component: () => SecurityPage() },
});

const initialPath =
  typeof window !== 'undefined' && window.location
    ? window.location.pathname
    : (globalThis as any).__SSR_URL__ || '/';

export const appRouter = createRouter(routes, initialPath, { serverNav: true });

export function useAppRouter() {
  return useRouter<InferRouteMap<typeof routes>>();
}

const currentPath = computed(() => {
  const match = appRouter.current.value;
  return match ? window.location.pathname : initialPath;
});

export const Link = createLink(currentPath, (url: string) => {
  appRouter.navigate(url as Parameters<typeof appRouter.navigate>[0]);
});
  `);

  // ── App shell ─────────────────────────────────────────────────────────────

  w('app.tsx', `
import { css, getInjectedCSS, globalCss, RouterContext, RouterView, ThemeProvider } from '@vertz/ui';
import { appRouter, Link } from './router';
import { benchmarkTheme, themeGlobals } from './styles/theme';
import { layoutStyles, navStyles } from './styles/components';

const appGlobals = globalCss({
  a: { textDecoration: 'none', color: 'inherit' },
});

export { getInjectedCSS };
export const theme = benchmarkTheme;
export const styles = [themeGlobals.css, appGlobals.css];

function Nav() {
  return (
    <nav class={navStyles.nav} aria-label="Main navigation">
      <Link href="/" class={navStyles.link}>Home</Link>
      <Link href="/products" class={navStyles.link}>Products</Link>
      <Link href="/blog" class={navStyles.link}>Blog</Link>
      <Link href="/dashboard" class={navStyles.link}>Dashboard</Link>
      <Link href="/about" class={navStyles.link}>About</Link>
      <Link href="/docs" class={navStyles.link}>Docs</Link>
      <Link href="/settings" class={navStyles.link}>Settings</Link>
    </nav>
  );
}

export function App() {
  return (
    <RouterContext.Provider value={appRouter}>
      <ThemeProvider theme="light">
        <div class={layoutStyles.shell}>
          <Nav />
          <main class={layoutStyles.main}>
            <RouterView
              router={appRouter}
              fallback={() => <div>Page not found</div>}
            />
          </main>
        </div>
      </ThemeProvider>
    </RouterContext.Provider>
  );
}
  `);

  // ── Entry point ───────────────────────────────────────────────────────────

  w('entry-client.ts', `
import { mount } from '@vertz/ui';
import { App, styles } from './app';
import { benchmarkTheme } from './styles/theme';

mount(App, '#app', {
  theme: benchmarkTheme,
  styles,
});
  `);

  // Count pages (each file in pages/ is one page)
  const pagesDir = join(SRC, 'pages');
  const pages = countFilesInDir(pagesDir, '.tsx');
  console.log(`Vertz: ${pages} pages generated`);
  return { pages, bytes: totalBytes(SRC) };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

console.log('Generating benchmark apps...\n');

const vinextResult = generateVinextApp();
const vertzResult = generateVertzApp();

console.log(`\n--- Source Code Volume ---`);
console.log(`vinext: ${vinextResult.pages} pages, ${(vinextResult.bytes / 1024).toFixed(1)} KB source`);
console.log(`Vertz:  ${vertzResult.pages} pages, ${(vertzResult.bytes / 1024).toFixed(1)} KB source`);

const ratio = ((vertzResult.bytes / vinextResult.bytes) * 100).toFixed(1);
console.log(`Vertz/vinext ratio: ${ratio}%`);
