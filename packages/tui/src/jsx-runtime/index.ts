import type { CellStyle } from '../buffer/cell';
import { defaultLayoutProps } from '../layout/types';
import type { TuiElement, TuiNode, TuiTextNode } from '../nodes/types';

/** Color type for Text components. */
export type Color =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'gray'
  | 'redBright'
  | 'greenBright'
  | 'yellowBright'
  | 'blueBright'
  | 'magentaBright'
  | 'cyanBright'
  | 'whiteBright'
  | `#${string}`;

/** Tag type: string intrinsic or component function. */
type Tag = string | ((props: Record<string, unknown>) => TuiNode);

/** JSX factory function. */
export function jsx(tag: Tag, props: Record<string, unknown>): TuiNode {
  // Component function
  if (typeof tag === 'function') {
    return tag(props);
  }

  const { children, ...rest } = props;
  const element = createElement(tag, rest);
  element.children = normalizeChildren(children);
  return element;
}

/** JSX factory for elements with multiple static children. */
export const jsxs: typeof jsx = jsx;

/** JSX dev factory. */
export const jsxDEV: typeof jsx = jsx;

/** Fragment: returns children as-is. */
export function Fragment(props: { children?: TuiNode }): TuiNode {
  return props.children ?? null;
}

/** Create a TUI element from tag and props. */
function createElement(tag: string, props: Record<string, unknown>): TuiElement {
  const layoutProps = defaultLayoutProps();
  const style: CellStyle = {};

  // Map props to layout props and style
  for (const [key, value] of Object.entries(props)) {
    switch (key) {
      case 'direction':
        if (value === 'row' || value === 'column') layoutProps.direction = value;
        break;
      case 'padding':
        if (typeof value === 'number') layoutProps.padding = value;
        break;
      case 'paddingX':
        if (typeof value === 'number') layoutProps.paddingX = value;
        break;
      case 'paddingY':
        if (typeof value === 'number') layoutProps.paddingY = value;
        break;
      case 'gap':
        if (typeof value === 'number') layoutProps.gap = value;
        break;
      case 'width':
        if (typeof value === 'number' || value === 'full') layoutProps.width = value;
        break;
      case 'height':
        if (typeof value === 'number') layoutProps.height = value;
        break;
      case 'grow':
        if (typeof value === 'number') layoutProps.grow = value;
        break;
      case 'align':
        if (value === 'start' || value === 'center' || value === 'end') layoutProps.align = value;
        break;
      case 'justify':
        if (value === 'start' || value === 'center' || value === 'end' || value === 'between') {
          layoutProps.justify = value;
        }
        break;
      case 'border':
        if (
          value === 'single' ||
          value === 'double' ||
          value === 'round' ||
          value === 'bold' ||
          value === 'none'
        ) {
          layoutProps.border = value;
        }
        break;
      // Style props
      case 'color':
        if (typeof value === 'string') style.color = value;
        break;
      case 'bgColor':
      case 'borderColor':
        if (typeof value === 'string') style.bgColor = value;
        break;
      case 'bold':
        if (value === true) style.bold = true;
        break;
      case 'dim':
        if (value === true) style.dim = true;
        break;
      case 'italic':
        if (value === true) style.italic = true;
        break;
      case 'underline':
        if (value === true) style.underline = true;
        break;
      case 'strikethrough':
        if (value === true) style.strikethrough = true;
        break;
    }
  }

  return {
    _tuiElement: true,
    tag,
    props,
    style,
    layoutProps,
    children: [],
    box: { x: 0, y: 0, width: 0, height: 0 },
  };
}

/** Normalize children into a flat array of TuiNode. */
function normalizeChildren(children: unknown): TuiNode[] {
  if (children == null || children === false || children === true) return [];
  if (Array.isArray(children)) {
    return children.flatMap((c) => normalizeChildren(c));
  }
  if (typeof children === 'string' || typeof children === 'number') {
    const textNode: TuiTextNode = {
      _tuiText: true,
      text: String(children),
      style: {},
      box: { x: 0, y: 0, width: 0, height: 0 },
    };
    return [textNode];
  }
  return [children as TuiNode];
}

// JSX namespace for TypeScript
export declare namespace JSX {
  type Element = TuiNode;
  interface IntrinsicElements {
    [tag: string]: Record<string, unknown>;
  }
}
