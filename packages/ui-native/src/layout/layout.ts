/**
 * Yoga-based flexbox layout engine.
 *
 * Maps NativeElement style attributes to Yoga node properties,
 * computes layout, and returns absolute positions for each element.
 */

import Yoga, {
  Align,
  Display,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  Wrap,
  type Node as YogaNode,
} from 'yoga-layout';
import { NativeElement } from '../native-element';

export interface ComputedLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute flexbox layout for a NativeElement tree.
 *
 * Returns a Map from each NativeElement to its absolute position and size.
 * Text nodes are not included (they inherit parent position).
 */
export function computeLayout(
  root: NativeElement,
  viewportWidth: number,
  viewportHeight: number,
): Map<NativeElement, ComputedLayout> {
  const layouts = new Map<NativeElement, ComputedLayout>();
  const nodeMap = new Map<NativeElement, YogaNode>();

  // Build Yoga tree
  const rootNode = buildYogaTree(root, nodeMap);

  // Compute layout
  rootNode.calculateLayout(viewportWidth, viewportHeight);

  // Extract computed layouts (absolute positions)
  extractLayouts(root, rootNode, 0, 0, layouts, nodeMap);

  // Free Yoga nodes
  rootNode.freeRecursive();

  return layouts;
}

function buildYogaTree(el: NativeElement, nodeMap: Map<NativeElement, YogaNode>): YogaNode {
  const node = Yoga.Node.create();
  nodeMap.set(el, node);

  // Apply style attributes
  applyStyles(el, node);

  // Add children (skip text nodes — they don't get Yoga nodes)
  let yogaIndex = 0;
  for (const child of el.children) {
    if (child instanceof NativeElement) {
      const childNode = buildYogaTree(child, nodeMap);
      node.insertChild(childNode, yogaIndex++);
    }
  }

  return node;
}

function applyStyles(el: NativeElement, node: YogaNode): void {
  // Flex direction
  const flexDir = el.getAttribute('style:flexDirection');
  if (flexDir) {
    const dirMap: Record<string, FlexDirection> = {
      row: FlexDirection.Row,
      'row-reverse': FlexDirection.RowReverse,
      column: FlexDirection.Column,
      'column-reverse': FlexDirection.ColumnReverse,
    };
    if (dirMap[flexDir]) {
      node.setFlexDirection(dirMap[flexDir]);
    }
  }

  // Width / Height
  const width = el.getAttribute('style:width');
  if (width) node.setWidth(Number(width));

  const height = el.getAttribute('style:height');
  if (height) node.setHeight(Number(height));

  // Gap
  const gap = el.getAttribute('style:gap');
  if (gap) node.setGap(Gutter.All, Number(gap));

  const rowGap = el.getAttribute('style:rowGap');
  if (rowGap) node.setGap(Gutter.Row, Number(rowGap));

  const columnGap = el.getAttribute('style:columnGap');
  if (columnGap) node.setGap(Gutter.Column, Number(columnGap));

  // Padding
  const padding = el.getAttribute('style:padding');
  if (padding) node.setPadding(Edge.All, Number(padding));

  const paddingTop = el.getAttribute('style:paddingTop');
  if (paddingTop) node.setPadding(Edge.Top, Number(paddingTop));

  const paddingBottom = el.getAttribute('style:paddingBottom');
  if (paddingBottom) node.setPadding(Edge.Bottom, Number(paddingBottom));

  const paddingLeft = el.getAttribute('style:paddingLeft');
  if (paddingLeft) node.setPadding(Edge.Left, Number(paddingLeft));

  const paddingRight = el.getAttribute('style:paddingRight');
  if (paddingRight) node.setPadding(Edge.Right, Number(paddingRight));

  // Margin
  const margin = el.getAttribute('style:margin');
  if (margin) node.setMargin(Edge.All, Number(margin));

  const marginTop = el.getAttribute('style:marginTop');
  if (marginTop) node.setMargin(Edge.Top, Number(marginTop));

  const marginBottom = el.getAttribute('style:marginBottom');
  if (marginBottom) node.setMargin(Edge.Bottom, Number(marginBottom));

  const marginLeft = el.getAttribute('style:marginLeft');
  if (marginLeft) node.setMargin(Edge.Left, Number(marginLeft));

  const marginRight = el.getAttribute('style:marginRight');
  if (marginRight) node.setMargin(Edge.Right, Number(marginRight));

  // Flex grow/shrink
  const flexGrow = el.getAttribute('style:flexGrow');
  if (flexGrow) node.setFlexGrow(Number(flexGrow));

  const flexShrink = el.getAttribute('style:flexShrink');
  if (flexShrink) node.setFlexShrink(Number(flexShrink));

  // Flex basis
  const flexBasis = el.getAttribute('style:flexBasis');
  if (flexBasis) {
    if (flexBasis === 'auto') {
      node.setFlexBasisAuto();
    } else {
      node.setFlexBasis(Number(flexBasis));
    }
  }

  // Justify content
  const justifyContent = el.getAttribute('style:justifyContent');
  if (justifyContent) {
    const justifyMap: Record<string, Justify> = {
      'flex-start': Justify.FlexStart,
      center: Justify.Center,
      'flex-end': Justify.FlexEnd,
      'space-between': Justify.SpaceBetween,
      'space-around': Justify.SpaceAround,
      'space-evenly': Justify.SpaceEvenly,
    };
    if (justifyMap[justifyContent]) {
      node.setJustifyContent(justifyMap[justifyContent]);
    }
  }

  // Align items
  const alignItems = el.getAttribute('style:alignItems');
  if (alignItems) {
    const alignMap: Record<string, Align> = {
      'flex-start': Align.FlexStart,
      center: Align.Center,
      'flex-end': Align.FlexEnd,
      stretch: Align.Stretch,
      baseline: Align.Baseline,
    };
    if (alignMap[alignItems]) {
      node.setAlignItems(alignMap[alignItems]);
    }
  }

  // Align self
  const alignSelf = el.getAttribute('style:alignSelf');
  if (alignSelf) {
    const selfMap: Record<string, Align> = {
      auto: Align.Auto,
      'flex-start': Align.FlexStart,
      center: Align.Center,
      'flex-end': Align.FlexEnd,
      stretch: Align.Stretch,
      baseline: Align.Baseline,
    };
    if (selfMap[alignSelf]) {
      node.setAlignSelf(selfMap[alignSelf]);
    }
  }

  // Flex wrap
  const flexWrap = el.getAttribute('style:flexWrap');
  if (flexWrap) {
    const wrapMap: Record<string, Wrap> = {
      nowrap: Wrap.NoWrap,
      wrap: Wrap.Wrap,
      'wrap-reverse': Wrap.WrapReverse,
    };
    if (wrapMap[flexWrap]) {
      node.setFlexWrap(wrapMap[flexWrap]);
    }
  }

  // Display
  const display = el.getAttribute('style:display');
  if (display === 'none') {
    node.setDisplay(Display.None);
  }
}

function extractLayouts(
  el: NativeElement,
  yogaNode: YogaNode,
  parentAbsX: number,
  parentAbsY: number,
  layouts: Map<NativeElement, ComputedLayout>,
  nodeMap: Map<NativeElement, YogaNode>,
): void {
  const layout = yogaNode.getComputedLayout();
  const absX = parentAbsX + layout.left;
  const absY = parentAbsY + layout.top;

  layouts.set(el, {
    x: absX,
    y: absY,
    width: layout.width,
    height: layout.height,
  });

  // Recurse into children
  for (const child of el.children) {
    if (child instanceof NativeElement) {
      const childYogaNode = nodeMap.get(child);
      if (childYogaNode) {
        extractLayouts(child, childYogaNode, absX, absY, layouts, nodeMap);
      }
    }
  }
}
