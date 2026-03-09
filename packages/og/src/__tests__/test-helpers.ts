/**
 * Shared test utilities for @vertz/og tests.
 */

import type { SatoriElement } from '../types';

let cachedFont: ArrayBuffer | undefined;

/** Load a test font (cached across calls within a test run). */
export async function getTestFont(): Promise<ArrayBuffer> {
  if (cachedFont) return cachedFont;

  const res = await fetch(
    'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400&display=swap&subset=latin',
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } },
  );
  const css = await res.text();
  const match = css.match(/src:\s*url\(([^)]+)\)/);
  if (!match?.[1]) throw new Error('Could not load test font');
  const fontData = await fetch(match[1]).then((r) => r.arrayBuffer());
  cachedFont = fontData;
  return fontData;
}

/** Standard font config for tests. */
export function testFonts(font: ArrayBuffer) {
  return [{ data: font, name: 'Noto Sans', weight: 400 as const, style: 'normal' as const }];
}

/** Recursively search for a text string in a Satori element tree. */
export function findTextInTree(
  node: SatoriElement | string | number | boolean | null | undefined,
  text: string,
): boolean {
  if (node == null || typeof node === 'boolean') return false;
  if (typeof node === 'string') return node === text;
  if (typeof node === 'number') return String(node) === text;

  const children = node.props.children;
  if (children == null) return false;
  if (typeof children === 'string') return children === text;
  if (typeof children === 'number') return String(children) === text;
  if (typeof children === 'boolean') return false;
  if (Array.isArray(children)) {
    return children.some((child) => findTextInTree(child as SatoriElement, text));
  }
  return findTextInTree(children, text);
}

/** Recursively search for a style property value in a Satori element tree. */
export function findStyleInTree(
  node: SatoriElement | string | number | boolean | null | undefined,
  prop: string,
  value: string,
): boolean {
  if (node == null || typeof node !== 'object') return false;

  if (node.props.style && node.props.style[prop] === value) return true;

  const children = node.props.children;
  if (children == null) return false;
  if (Array.isArray(children)) {
    return children.some((child) => findStyleInTree(child as SatoriElement, prop, value));
  }
  if (typeof children === 'object') {
    return findStyleInTree(children, prop, value);
  }
  return false;
}

/** Find a style property value anywhere in a Satori element tree. */
export function findStyleValue(
  node: SatoriElement | string | number | boolean | null | undefined,
  prop: string,
): string {
  if (node == null || typeof node !== 'object') return '';
  const val = node.props.style?.[prop];
  if (typeof val === 'string') return val;
  const children = node.props.children;
  if (children == null) return '';
  if (Array.isArray(children)) {
    for (const c of children) {
      const found = findStyleValue(c as SatoriElement, prop);
      if (found) return found;
    }
  } else if (typeof children === 'object') {
    return findStyleValue(children, prop);
  }
  return '';
}
