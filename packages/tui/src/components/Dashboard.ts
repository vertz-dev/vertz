import { __append, __element } from '../internals';
import type { TuiChild, TuiElement } from '../tui-element';

export interface DashboardProps {
  /** Fixed element at the top of the dashboard. */
  header?: TuiElement;
  /** Fixed element at the bottom of the dashboard. */
  footer?: TuiElement;
  /** Content to display in the middle (scrollable area). */
  children?: TuiChild;
}

/**
 * Dashboard — three-region layout for long-running CLI tools.
 *
 * Divides the terminal into:
 * - Header (fixed at top, 1 row minimum)
 * - Content (fills remaining space, grows to fit)
 * - Footer (fixed at bottom, 1 row minimum)
 *
 * Use with `tui.mount(App, { mode: 'alternate' })` for clean restore on exit.
 */
export function Dashboard({ header, footer, children }: DashboardProps): TuiElement {
  const outer = __element('Box', 'direction', 'column', 'width', 'full');

  // Header region
  if (header) {
    __append(outer, header);
  }

  // Content region — grows to fill available space
  const contentBox = __element('Box', 'direction', 'column', 'grow', 1);
  if (children) {
    __append(contentBox, children);
  }
  __append(outer, contentBox);

  // Footer region
  if (footer) {
    __append(outer, footer);
  }

  return outer;
}
