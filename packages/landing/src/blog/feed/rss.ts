import type { LoadedPost } from '../types';

const MAX_ITEMS = 20;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Convert an ISO date (`YYYY-MM-DD`) to RFC 822 (`Wed, 22 Apr 2026 00:00:00 GMT`). */
export function toRfc822(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  const weekday = WEEKDAYS[date.getUTCDay()] ?? 'Sun';
  const month = MONTHS[date.getUTCMonth()] ?? 'Jan';
  return (
    `${weekday}, ${pad(date.getUTCDate())} ${month} ${date.getUTCFullYear()} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} GMT`
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface RssFeedOptions {
  siteUrl: string;
  channelTitle?: string;
  channelDescription?: string;
  /** Last-build date, defaults to the newest post's date. */
  lastBuildDate?: string;
}

export function buildRssFeed(posts: LoadedPost[], options: RssFeedOptions): string {
  const siteUrl = options.siteUrl.replace(/\/+$/, '');
  const published = posts.filter((p) => !p.meta.draft);
  const sorted = [...published].sort((a, b) => b.meta.date.localeCompare(a.meta.date));
  const items = sorted.slice(0, MAX_ITEMS);

  const channelTitle = options.channelTitle ?? 'Vertz Blog';
  const channelDescription =
    options.channelDescription ?? 'Notes from building an agent-native framework.';
  const lastBuildDate = options.lastBuildDate ?? items[0]?.meta.date ?? '';

  const itemXml = items
    .map((post) => {
      const postUrl = `${siteUrl}/blog/${post.meta.slug}`;
      const categories = post.meta.tags
        .map((tag) => `    <category>${escapeXml(tag)}</category>`)
        .join('\n');
      return [
        '  <item>',
        `    <title>${escapeXml(post.meta.title)}</title>`,
        `    <link>${escapeXml(postUrl)}</link>`,
        `    <guid isPermaLink="true">${escapeXml(postUrl)}</guid>`,
        `    <pubDate>${toRfc822(post.meta.date)}</pubDate>`,
        `    <description>${escapeXml(post.meta.description)}</description>`,
        categories,
        '  </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const lastBuildXml = lastBuildDate
    ? `  <lastBuildDate>${toRfc822(lastBuildDate)}</lastBuildDate>\n`
    : '';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `  <title>${escapeXml(channelTitle)}</title>`,
    `  <link>${escapeXml(`${siteUrl}/blog`)}</link>`,
    `  <description>${escapeXml(channelDescription)}</description>`,
    `  <language>en</language>`,
    `  <atom:link href="${escapeXml(`${siteUrl}/blog/feed.xml`)}" rel="self" type="application/rss+xml" />`,
    lastBuildXml,
    itemXml,
    '</channel>',
    '</rss>',
    '',
  ]
    .filter((s) => s !== '')
    .join('\n');
}
