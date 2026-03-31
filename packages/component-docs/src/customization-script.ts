import { palettes } from '@vertz/theme-shadcn';
import { ACCENT_PRESETS, RADIUS_VALUES } from './hooks/use-customization';

/**
 * Generates a blocking <script> tag that reads the `vertz-customization` cookie
 * and applies CSS custom properties on <html> BEFORE the first paint.
 *
 * This prevents the visible theme flash between SSR (default zinc/md) and
 * the user's saved customization preferences (palette, radius, accent).
 *
 * The script embeds all palette, accent, and radius data as compact JSON
 * so it can apply CSS variables synchronously without any imports.
 */
export function generateCustomizationScript(): string {
  // Build compact palette data: { slate: { background: ['light', 'dark'], ... }, ... }
  // Exclude zinc (the default) — no overrides needed for default palette.
  const compactPalettes: Record<string, Record<string, [string, string]>> = {};
  for (const [name, tokens] of Object.entries(palettes)) {
    if (name === 'zinc') continue;
    const compact: Record<string, [string, string]> = {};
    for (const [token, variants] of Object.entries(tokens)) {
      compact[token] = [variants.DEFAULT, variants._dark ?? variants.DEFAULT];
    }
    compactPalettes[name] = compact;
  }

  // Build compact accent data: { red: { primary: ['light', 'dark'], ... }, ... }
  const compactAccents: Record<string, Record<string, [string, string]>> = {};
  for (const [name, preset] of Object.entries(ACCENT_PRESETS)) {
    const compact: Record<string, [string, string]> = {};
    for (const [token, variants] of Object.entries(preset.tokens)) {
      compact[token] = [variants.DEFAULT, variants._dark];
    }
    compactAccents[name] = compact;
  }

  // Escape </ sequences to prevent premature </script> closing in HTML.
  const data = JSON.stringify({
    p: compactPalettes,
    a: compactAccents,
    r: RADIUS_VALUES,
  }).replace(/<\//g, '<\\/');

  // The script runs synchronously in <head>, after the theme init script
  // has already set data-theme on <html>.
  const script = `(function(){
  var m=document.cookie.match(/(?:^|; )vertz-customization=([^;]+)/);
  if(!m)return;
  var parts=m[1].split(',');
  if(parts.length<3)return;
  var palette=parts[0],radius=parts[1],accent=parts[2];
  var isDark=document.documentElement.getAttribute('data-theme')==='dark';
  var D=${data};
  var root=document.documentElement;
  if(palette!=='zinc'&&D.p[palette]){
    var t=D.p[palette];
    for(var n in t)root.style.setProperty('--color-'+n,isDark?t[n][1]:t[n][0]);
  }
  if(radius!=='md'&&D.r[radius]){
    root.style.setProperty('--radius',D.r[radius]);
  }
  if(accent!=='default'&&D.a[accent]){
    var a=D.a[accent];
    for(var n in a)root.style.setProperty('--color-'+n,isDark?a[n][1]:a[n][0]);
  }
})();`;

  return `<script>${script}</script>`;
}
