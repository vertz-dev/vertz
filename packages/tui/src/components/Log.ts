import { __append, __element } from '../internals';
import type { TuiChild, TuiElement } from '../tui-element';

export interface LogProps<T> {
  items: T[];
  children: (item: T) => TuiChild;
}

export function Log<T>(props: LogProps<T>): TuiElement {
  const { items, children: renderItem } = props;
  const box = __element('Box', 'direction', 'column');
  for (const item of items) {
    __append(box, renderItem(item));
  }
  return box;
}
