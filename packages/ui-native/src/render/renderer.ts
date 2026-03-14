/**
 * Scene graph → draw command pipeline.
 *
 * This module traverses the NativeElement tree and produces a flat list
 * of DrawCommands. These commands are then consumed by the GL renderer
 * (or any other backend) to produce actual pixels.
 *
 * This separation allows testing the rendering logic without a GPU context.
 */

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
 * For Phase 1, this uses a simple stack-based layout:
 * - Elements are stacked vertically
 * - Each element fills the parent width
 * - Height is auto (content-based) or explicit
 *
 * Full flexbox layout (Yoga) will replace this in Phase 3.
 */
export function collectDrawCommands(
  root: NativeElement,
  viewportWidth: number,
  viewportHeight: number,
): DrawCommand[] {
  const commands: DrawCommand[] = [];
  traverseElement(root, 0, 0, viewportWidth, viewportHeight, commands);
  return commands;
}

function traverseElement(
  el: NativeElement,
  x: number,
  y: number,
  width: number,
  height: number,
  commands: DrawCommand[],
): number {
  const isInvisible = INVISIBLE_TAGS.has(el.tag);

  // Draw rect if element has a background color
  const bg = el.getAttribute('style:bg');
  if (bg && !isInvisible) {
    commands.push({
      type: 'rect',
      x,
      y,
      width,
      height,
      color: bg,
    });
  } else if (!isInvisible && !bg) {
    // Emit a transparent rect so the element participates in layout
    commands.push({
      type: 'rect',
      x,
      y,
      width,
      height,
      color: 'transparent',
    });
  }

  // Layout children vertically (simple stack for Phase 1)
  let childY = y;
  const childHeight = Math.max(30, height / Math.max(el.children.length, 1));

  for (const child of el.children) {
    if (child instanceof NativeTextNode) {
      commands.push({
        type: 'text',
        x: x + 4,
        y: childY + 16,
        text: child.data,
        color: '#000000',
        fontSize: 14,
      });
      childY += 20;
    } else if (child instanceof NativeElement) {
      const usedHeight = traverseElement(child, x, childY, width, childHeight, commands);
      childY += usedHeight;
    }
  }

  return Math.max(childY - y, 30);
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
