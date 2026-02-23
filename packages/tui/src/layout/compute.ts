import { measureTextWidth, splitTextLines } from './measure';
import type { LayoutConstraints, LayoutNode } from './types';

/**
 * Compute layout for a tree of layout nodes.
 * Sets the `box` property on each node with computed x, y, width, height.
 */
export function computeLayout(root: LayoutNode, constraints: LayoutConstraints): void {
  // First pass: compute sizes bottom-up
  computeSize(root, constraints);
  // Second pass: assign positions top-down
  assignPosition(root, 0, 0);
}

/** Compute the size of a node and its children. */
function computeSize(node: LayoutNode, constraints: LayoutConstraints): void {
  const { props } = node;
  const hasBorder = props.border !== 'none';
  const borderInset = hasBorder ? 2 : 0;
  const padX = (props.paddingX || props.padding) * 2;
  const padY = (props.paddingY || props.padding) * 2;

  // Resolve explicit width
  let resolvedWidth: number;
  if (props.width === 'full') {
    resolvedWidth = constraints.maxWidth;
  } else if (typeof props.width === 'number') {
    resolvedWidth = Math.min(props.width, constraints.maxWidth);
  } else {
    resolvedWidth = constraints.maxWidth;
  }

  const innerMaxWidth = Math.max(0, resolvedWidth - padX - borderInset);
  const innerMaxHeight = Math.max(0, constraints.maxHeight - padY - borderInset);

  if (node.type === 'text') {
    const text = node.text ?? '';
    const lines = splitTextLines(text, innerMaxWidth);
    const textWidth = lines.reduce((max, line) => Math.max(max, measureTextWidth(line)), 0);
    const textHeight = lines.length;

    // For text nodes, use content size unless explicit width set
    if (props.width === 'full' || typeof props.width === 'number') {
      node.box.width = resolvedWidth;
    } else {
      node.box.width = Math.min(textWidth + padX + borderInset, constraints.maxWidth);
    }
    node.box.height = Math.min(
      typeof props.height === 'number' ? props.height : textHeight + padY + borderInset,
      constraints.maxHeight,
    );
    return;
  }

  // Box node: compute children first
  const childConstraints: LayoutConstraints = {
    maxWidth: innerMaxWidth,
    maxHeight: innerMaxHeight,
  };

  for (const child of node.children) {
    computeSize(child, childConstraints);
  }

  // Compute content size based on direction
  let contentWidth = 0;
  let contentHeight = 0;
  const visibleChildren = node.children.filter((c) => c.box.width > 0 || c.box.height > 0);
  const gapTotal = Math.max(0, visibleChildren.length - 1) * props.gap;

  if (props.direction === 'row') {
    for (const child of visibleChildren) {
      contentWidth += child.box.width;
      contentHeight = Math.max(contentHeight, child.box.height);
    }
    contentWidth += gapTotal;
  } else {
    for (const child of visibleChildren) {
      contentWidth = Math.max(contentWidth, child.box.width);
      contentHeight += child.box.height;
    }
    contentHeight += gapTotal;
  }

  // Apply grow to children
  const growChildren = visibleChildren.filter((c) => c.props.grow > 0);
  if (growChildren.length > 0) {
    if (props.direction === 'row') {
      const nonGrowWidth = visibleChildren
        .filter((c) => c.props.grow === 0)
        .reduce((sum, c) => sum + c.box.width, 0);
      const remaining = Math.max(0, innerMaxWidth - nonGrowWidth - gapTotal);
      const totalGrow = growChildren.reduce((sum, c) => sum + c.props.grow, 0);
      for (const child of growChildren) {
        child.box.width = Math.floor((remaining * child.props.grow) / totalGrow);
      }
      contentWidth = innerMaxWidth;
    } else {
      // Column direction: grow children take remaining height
      const nonGrowHeight = visibleChildren
        .filter((c) => c.props.grow === 0)
        .reduce((sum, c) => sum + c.box.height, 0);
      const remaining = Math.max(0, innerMaxHeight - nonGrowHeight - gapTotal);
      const totalGrow = growChildren.reduce((sum, c) => sum + c.props.grow, 0);
      for (const child of growChildren) {
        child.box.height = Math.floor((remaining * child.props.grow) / totalGrow);
      }
      contentHeight = innerMaxHeight;
    }
  }

  // Set box dimensions
  if (props.width === 'full') {
    node.box.width = constraints.maxWidth;
  } else if (typeof props.width === 'number') {
    node.box.width = Math.min(props.width, constraints.maxWidth);
  } else {
    node.box.width = Math.min(contentWidth + padX + borderInset, constraints.maxWidth);
  }

  node.box.height = Math.min(
    typeof props.height === 'number' ? props.height : contentHeight + padY + borderInset,
    constraints.maxHeight,
  );
}

/** Assign positions to all nodes in the tree. */
function assignPosition(node: LayoutNode, x: number, y: number): void {
  node.box.x = x;
  node.box.y = y;

  if (node.type === 'text' || node.children.length === 0) return;

  const { props } = node;
  const hasBorder = props.border !== 'none';
  const borderOffset = hasBorder ? 1 : 0;
  const padLeft = (props.paddingX || props.padding) + borderOffset;
  const padTop = (props.paddingY || props.padding) + borderOffset;
  const padX = (props.paddingX || props.padding) * 2 + borderOffset * 2;
  const padY = (props.paddingY || props.padding) * 2 + borderOffset * 2;

  const innerWidth = Math.max(0, node.box.width - padX);
  const innerHeight = Math.max(0, node.box.height - padY);
  const visibleChildren = node.children.filter((c) => c.box.width > 0 || c.box.height > 0);
  const gapTotal = Math.max(0, visibleChildren.length - 1) * props.gap;

  if (props.direction === 'row') {
    const totalChildWidth = visibleChildren.reduce((sum, c) => sum + c.box.width, 0) + gapTotal;
    let offsetX = computeJustifyOffset(
      props.justify,
      innerWidth,
      totalChildWidth,
      visibleChildren.length,
    );

    for (const child of visibleChildren) {
      const offsetY = computeAlignOffset(props.align, innerHeight, child.box.height);
      assignPosition(child, x + padLeft + offsetX, y + padTop + offsetY);
      offsetX += child.box.width + props.gap;
    }
  } else {
    const totalChildHeight = visibleChildren.reduce((sum, c) => sum + c.box.height, 0) + gapTotal;
    let offsetY = computeJustifyOffset(
      props.justify,
      innerHeight,
      totalChildHeight,
      visibleChildren.length,
    );

    for (const child of visibleChildren) {
      const offsetX = computeAlignOffset(props.align, innerWidth, child.box.width);
      assignPosition(child, x + padLeft + offsetX, y + padTop + offsetY);
      offsetY += child.box.height + props.gap;
    }
  }
}

function computeJustifyOffset(
  justify: 'start' | 'center' | 'end' | 'between',
  totalSpace: number,
  contentSize: number,
  _childCount: number,
): number {
  switch (justify) {
    case 'start':
      return 0;
    case 'center':
      return Math.max(0, Math.floor((totalSpace - contentSize) / 2));
    case 'end':
      return Math.max(0, totalSpace - contentSize);
    case 'between':
      return 0; // Gap distribution handled separately
  }
}

function computeAlignOffset(
  align: 'start' | 'center' | 'end',
  totalSpace: number,
  childSize: number,
): number {
  switch (align) {
    case 'start':
      return 0;
    case 'center':
      return Math.max(0, Math.floor((totalSpace - childSize) / 2));
    case 'end':
      return Math.max(0, totalSpace - childSize);
  }
}
