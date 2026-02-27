import { injectCSS } from './css';

/**
 * Register a CSS @keyframes animation and return its name.
 * The CSS is injected into the DOM (deduped by injectCSS).
 */
export function keyframes(name: string, frames: Record<string, Record<string, string>>): string {
  let css = `@keyframes ${name} {\n`;
  for (const [selector, props] of Object.entries(frames)) {
    const decls = Object.entries(props)
      .map(([p, v]) => `    ${p}: ${v};`)
      .join('\n');
    css += `  ${selector} {\n${decls}\n  }\n`;
  }
  css += '}';
  injectCSS(css);
  return name;
}
