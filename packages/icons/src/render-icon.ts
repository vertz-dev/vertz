import type { IconProps } from './types';

export function renderIcon(svgString: string, props?: IconProps): HTMLSpanElement {
  const { size = 16, className, class: classProp } = props ?? {};
  const effectiveClass = className ?? classProp;
  const span = document.createElement('span');
  span.style.cssText = `display: inline-flex; align-items: center; width: ${size}px; height: ${size}px; flex-shrink: 0`;
  if (effectiveClass) span.className = effectiveClass;
  span.innerHTML = svgString
    .replace(/\bwidth="\d+"/, `width="${size}"`)
    .replace(/\bheight="\d+"/, `height="${size}"`);
  return span;
}
