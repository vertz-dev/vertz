import { jsx } from '../jsx-runtime/index';
import type { TuiNode } from '../nodes/types';

export interface LogProps<T> {
  items: T[];
  children: (item: T) => TuiNode;
}

export function Log<T>(props: LogProps<T>): TuiNode {
  const { items, children: renderItem } = props;
  const nodes: TuiNode[] = items.map((item) => renderItem(item));
  return jsx('Box', { direction: 'column', children: nodes });
}
