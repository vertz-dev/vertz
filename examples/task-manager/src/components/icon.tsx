/**
 * Icon component — renders Lucide SVG icons inline.
 *
 * Uses lucide-static which exports SVG strings for each icon.
 * The component wraps the SVG string in a span with display:contents
 * so the SVG integrates naturally into flex/grid layouts.
 */

import * as icons from 'lucide-static';

export type IconName = keyof typeof icons;

export interface IconProps {
  name: IconName;
  size?: number;
  class?: string;
}

export function Icon({ name, size = 16, class: className }: IconProps) {
  const svgString = icons[name] as string;
  const wrapper = (
    <span
      style={`display: inline-flex; align-items: center; width: ${size}px; height: ${size}px; flex-shrink: 0`}
    />
  );
  if (className) {
    (wrapper as Element).setAttribute('class', className);
  }
  // lucide-static provides complete <svg> strings — render via innerHTML
  (wrapper as HTMLElement).innerHTML = svgString.replace(
    '<svg ',
    `<svg width="${size}" height="${size}" `,
  );
  return wrapper;
}
