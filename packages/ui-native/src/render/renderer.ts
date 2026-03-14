/**
 * Scene graph → draw command pipeline.
 *
 * This module traverses the NativeElement tree and produces a flat list
 * of DrawCommands. These commands are then consumed by the GL renderer
 * (or any other backend) to produce actual pixels.
 *
 * Uses Yoga for flexbox layout computation.
 */

import { type ComputedLayout, computeLayout } from '../layout/layout';
import { NativeElement, NativeTextNode } from '../native-element';

export interface RectCommand {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface TextCommand {
  type: 'text';
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

export type DrawCommand = RectCommand | TextCommand;

const INVISIBLE_TAGS = new Set(['__comment', '__fragment']);

/**
 * Collect draw commands from a NativeElement tree.
 *
 * Uses Yoga flexbox layout to compute positions and sizes,
 * then emits draw commands for each element.
 */
export function collectDrawCommands(
  root: NativeElement,
  viewportWidth: number,
  viewportHeight: number,
): DrawCommand[] {
  const layouts = computeLayout(root, viewportWidth, viewportHeight);
  const commands: DrawCommand[] = [];
  traverseElement(root, layouts, commands);
  return commands;
}

function traverseElement(
  el: NativeElement,
  layouts: Map<NativeElement, ComputedLayout>,
  commands: DrawCommand[],
): void {
  const isInvisible = INVISIBLE_TAGS.has(el.tag);
  const layout = layouts.get(el);

  if (layout && !isInvisible) {
    const bg = el.getAttribute('style:bg');
    commands.push({
      type: 'rect',
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
      color: bg || 'transparent',
    });
  }

  for (const child of el.children) {
    if (child instanceof NativeTextNode) {
      const parentLayout = layout || { x: 0, y: 0 };
      commands.push({
        type: 'text',
        x: parentLayout.x + 4,
        y: parentLayout.y + 16,
        text: child.data,
        color: '#000000',
        fontSize: 14,
      });
    } else if (child instanceof NativeElement) {
      traverseElement(child, layouts, commands);
    }
  }
}

/**
 * Parse a hex color string to RGBA floats (0..1).
 */
export function parseColor(hex: string): [number, number, number, number] {
  if (hex === 'transparent') return [0, 0, 0, 0];
  if (!hex.startsWith('#')) return [0, 0, 0, 1];

  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const a = hex.length > 7 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 1;
  return [r, g, b, a];
}
