import { __append, __element, __staticText } from '../internals';
import type { TuiElement } from '../tui-element';

export interface BannerProps {
  title: string;
  subtitle?: string;
  border?: 'single' | 'double' | 'round' | 'bold';
  titleColor?: string;
}

export function Banner({
  title,
  subtitle,
  border = 'round',
  titleColor = 'cyanBright',
}: BannerProps): TuiElement {
  const box = __element(
    'Box',
    'border',
    border,
    'paddingX',
    2,
    'paddingY',
    1,
    'direction',
    'column',
  );

  const titleEl = __element('Text', 'bold', true, 'color', titleColor);
  __append(titleEl, __staticText(title));
  __append(box, titleEl);

  if (subtitle) {
    const subtitleEl = __element('Text', 'dim', true);
    __append(subtitleEl, __staticText(subtitle));
    __append(box, subtitleEl);
  }

  return box;
}
