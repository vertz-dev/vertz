import type { CellStyle } from './buffer/cell';
import type { LayoutBox, LayoutProps } from './layout/types';

/** A persistent TUI element (like <Box> or <Text>). Built once, mutated by effects. */
export interface TuiElement {
  _tuiElement: true;
  tag: string;
  props: Record<string, unknown>;
  style: CellStyle;
  layoutProps: LayoutProps;
  children: TuiChild[];
  parent: TuiElement | null;
  dirty: boolean;
  /** Computed layout box. */
  box: LayoutBox;
}

/** A persistent text node. Updated in-place by reactive effects. */
export interface TuiTextNode {
  _tuiText: true;
  text: string;
  style: CellStyle;
  dirty: boolean;
  box: LayoutBox;
}

/** A conditional node that swaps between branches. */
export interface TuiConditionalNode {
  _tuiConditional: true;
  current: TuiElement | TuiTextNode | null;
  dirty: boolean;
}

/** A list node that manages keyed items. */
export interface TuiListNode {
  _tuiList: true;
  items: TuiElement[];
  dirty: boolean;
}

/** Any child in a persistent TUI tree. */
export type TuiChild = TuiElement | TuiTextNode | TuiConditionalNode | TuiListNode;

/** Check if a value is a TuiElement. */
export function isTuiElement(value: unknown): value is TuiElement {
  return typeof value === 'object' && value !== null && '_tuiElement' in value;
}

/** Check if a value is a TuiTextNode. */
export function isTuiTextNode(value: unknown): value is TuiTextNode {
  return typeof value === 'object' && value !== null && '_tuiText' in value;
}

/** Check if a value is a TuiConditionalNode. */
export function isTuiConditionalNode(value: unknown): value is TuiConditionalNode {
  return typeof value === 'object' && value !== null && '_tuiConditional' in value;
}

/** Check if a value is a TuiListNode. */
export function isTuiListNode(value: unknown): value is TuiListNode {
  return typeof value === 'object' && value !== null && '_tuiList' in value;
}
