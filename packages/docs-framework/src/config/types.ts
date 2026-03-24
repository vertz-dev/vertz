/** Logo configuration — supports separate light/dark variants or a single path. */
export interface LogoConfig {
  light: string;
  dark: string;
}

/** A link with label, href, and optional icon. */
export interface NavLink {
  label: string;
  href: string;
  icon?: string;
}

/** Navbar configuration. */
export interface NavbarConfig {
  links?: NavLink[];
  cta?: NavLink;
}

/** Footer link group. */
export interface FooterLinkGroup {
  title: string;
  items: NavLink[];
}

/** Footer configuration. */
export interface FooterConfig {
  socials?: Record<string, string>;
  links?: FooterLinkGroup[];
}

/** A group of pages within a sidebar tab. */
export interface SidebarGroup {
  title: string;
  icon?: string;
  expanded?: boolean;
  pages: string[];
}

/** A tab in the sidebar containing groups of pages. */
export interface SidebarTab {
  tab: string;
  groups: SidebarGroup[];
}

/** Search configuration. */
export interface SearchConfig {
  placeholder?: string;
}

/** SEO configuration. */
export interface SeoConfig {
  siteName?: string;
  ogImage?: string;
  twitterHandle?: string;
}

/** Redirect rule. */
export interface RedirectConfig {
  source: string;
  destination: string;
}

/** LLM output generation configuration. */
export interface LlmConfig {
  enabled?: boolean;
  title?: string;
  description?: string;
  exclude?: string[];
}

/** Banner configuration. */
export interface BannerConfig {
  text: string;
  link?: NavLink;
  dismissible?: boolean;
}

/** Custom head tag injection. */
export interface HeadTag {
  tag: string;
  attrs?: Record<string, string | boolean>;
  content?: string;
}

/** Plausible analytics configuration. */
export interface PlausibleConfig {
  domain: string;
}

/** Analytics configuration. */
export interface AnalyticsConfig {
  plausible?: PlausibleConfig;
}

/** Code theme configuration — supports separate light/dark themes. */
export interface CodeThemeConfig {
  light: string;
  dark: string;
}

/** Font configuration. */
export interface FontsConfig {
  heading?: string;
  body?: string;
  mono?: string;
}

/** Theme color overrides. */
export interface ThemeColors {
  primary?: string;
}

/** Theme configuration. */
export interface ThemeConfig {
  palette?: string;
  radius?: string;
  colors?: ThemeColors;
  appearance?: 'light' | 'dark' | 'system';
  codeTheme?: CodeThemeConfig;
  fonts?: FontsConfig;
}

/** Full documentation site configuration. */
export interface DocsConfig {
  name: string;
  logo?: LogoConfig;
  favicon?: string;
  theme?: ThemeConfig;
  navbar?: NavbarConfig;
  footer?: FooterConfig;
  sidebar: SidebarTab[];
  search?: SearchConfig;
  seo?: SeoConfig;
  redirects?: RedirectConfig[];
  llm?: LlmConfig;
  banner?: BannerConfig;
  head?: HeadTag[];
  analytics?: AnalyticsConfig;
}
