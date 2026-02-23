/** Computed layout box — the result of layout computation. */
export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Border style options. */
export type BorderStyle = 'single' | 'double' | 'round' | 'bold' | 'none';

/** Layout constraints passed from parent to child. */
export interface LayoutConstraints {
  maxWidth: number;
  maxHeight: number;
}

/** Layout properties for a node. */
export interface LayoutProps {
  direction: 'row' | 'column';
  padding: number;
  paddingX: number;
  paddingY: number;
  gap: number;
  width: number | 'full' | undefined;
  height: number | undefined;
  grow: number;
  align: 'start' | 'center' | 'end';
  justify: 'start' | 'center' | 'end' | 'between';
  border: BorderStyle;
}

/** Default layout properties. */
export function defaultLayoutProps(): LayoutProps {
  return {
    direction: 'column',
    padding: 0,
    paddingX: 0,
    paddingY: 0,
    gap: 0,
    width: undefined,
    height: undefined,
    grow: 0,
    align: 'start',
    justify: 'start',
    border: 'none',
  };
}

/** A layout node in the tree. */
export interface LayoutNode {
  type: 'box' | 'text';
  props: LayoutProps;
  /** Text content for text nodes. */
  text?: string;
  children: LayoutNode[];
  /** Computed layout box, set during layout pass. */
  box: LayoutBox;
}

/** Border character sets. */
export interface BorderChars {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
}

export const BORDER_CHARS: Record<Exclude<BorderStyle, 'none'>, BorderChars> = {
  single: {
    topLeft: '\u250C',
    topRight: '\u2510',
    bottomLeft: '\u2514',
    bottomRight: '\u2518',
    horizontal: '\u2500',
    vertical: '\u2502',
  },
  double: {
    topLeft: '\u2554',
    topRight: '\u2557',
    bottomLeft: '\u255A',
    bottomRight: '\u255D',
    horizontal: '\u2550',
    vertical: '\u2551',
  },
  round: {
    topLeft: '\u256D',
    topRight: '\u256E',
    bottomLeft: '\u2570',
    bottomRight: '\u256F',
    horizontal: '\u2500',
    vertical: '\u2502',
  },
  bold: {
    topLeft: '\u250F',
    topRight: '\u2513',
    bottomLeft: '\u2517',
    bottomRight: '\u251B',
    horizontal: '\u2501',
    vertical: '\u2503',
  },
};
