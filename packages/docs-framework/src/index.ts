export { initDocs } from './cli/init';
export { defineDocsConfig } from './config/define';
export { loadDocsConfig } from './config/load';
export type {
  AnalyticsConfig,
  BannerConfig,
  CodeThemeConfig,
  DocsConfig,
  FontsConfig,
  FooterConfig,
  FooterLinkGroup,
  HeadTag,
  LlmConfig,
  LogoConfig,
  NavbarConfig,
  NavLink,
  PlausibleConfig,
  RedirectConfig,
  SearchConfig,
  SeoConfig,
  SidebarGroup,
  SidebarTab,
  ThemeColors,
  ThemeConfig,
} from './config/types';
export type { BuildDocsOptions, BuildManifest, ManifestRoute } from './generator/build-pipeline';
export { buildDocs } from './generator/build-pipeline';
export type { DiscoveredPage } from './generator/discover';
export { discoverPages } from './generator/discover';
export type { LlmPage } from './generator/llm-index';
export { generateLlmsFullTxt, generateLlmsTxt } from './generator/llm-index';
export type { TocHeading } from './mdx/extract-headings';
export { extractHeadings } from './mdx/extract-headings';
export type { FrontmatterResult } from './mdx/frontmatter';
export { parseFrontmatter } from './mdx/frontmatter';
export { mdxToMarkdown } from './mdx/llm-markdown';
export type { Breadcrumb, NavLink as PageNavLink, PageRoute } from './routing/resolve';
export { resolveRoutes } from './routing/resolve';
