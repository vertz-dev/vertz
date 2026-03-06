import type { IconProps } from './types';

export function renderIcon(svgString: string, props?: IconProps): HTMLSpanElement {
  const { size = 16, class: className } = props ?? {};
  const span = document.createElement('span');
  span.style.cssText = `display: inline-flex; align-items: center; width: ${size}px; height: ${size}px; flex-shrink: 0`;
  if (className) span.className = className;
  span.innerHTML = svgString
    .replace(/width="\d+"/, `width="${size}"`)
    .replace(/height="\d+"/, `height="${size}"`);
  return span;
}
