import type { CellStyle } from '../buffer/cell';
import type { LayoutBox, LayoutProps } from '../layout/types';

/** Any renderable TUI content. */
export type TuiNode = TuiElement | TuiTextNode | null | undefined | false | TuiNode[];

/** A TUI element (like <Box> or <Text>). */
export interface TuiElement {
  _tuiElement: true;
  tag: string;
  props: Record<string, unknown>;
  style: CellStyle;
  layoutProps: LayoutProps;
  children: TuiNode[];
  /** Computed layout box. */
  box: LayoutBox;
  /** Component function, if this is a component element. */
  component?: (props: Record<string, unknown>) => TuiNode;
}

/** A text node (raw string or number). */
export interface TuiTextNode {
  _tuiText: true;
  text: string;
  style: CellStyle;
  box: LayoutBox;
}

/** Check if a value is a TuiElement. */
export function isTuiElement(value: unknown): value is TuiElement {
  return typeof value === 'object' && value !== null && '_tuiElement' in value;
}

/** Check if a value is a TuiTextNode. */
export function isTuiTextNode(value: unknown): value is TuiTextNode {
  return typeof value === 'object' && value !== null && '_tuiText' in value;
}

/** Create a TUI text node. */
export function createTextNode(text: string, style: CellStyle = {}): TuiTextNode {
  return {
    _tuiText: true,
    text,
    style,
    box: { x: 0, y: 0, width: 0, height: 0 },
  };
}
