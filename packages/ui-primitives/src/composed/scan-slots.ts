/**
 * Slot scanning utility for composed primitives.
 * Scans resolved child nodes for `data-slot` markers and collects them
 * into a map by slot name. Non-slot nodes go into `rest`.
 */

export interface SlotEntry {
  /** The marker element with data-slot. */
  element: HTMLElement;
  /** Child nodes of the marker. */
  children: Node[];
  /** Additional data-* attributes on the marker (excluding data-slot). */
  attrs: Record<string, string>;
}

export interface ScanResult {
  /** Map of slot name → entries (one per occurrence of that slot). */
  slots: Map<string, SlotEntry[]>;
  /** Nodes that did not have a data-slot attribute. */
  rest: Node[];
}

/**
 * Scan an array of DOM nodes for `data-slot` markers.
 * Returns a ScanResult with slot entries grouped by name and non-slot nodes as rest.
 */
export function scanSlots(nodes: Node[]): ScanResult {
  const slots = new Map<string, SlotEntry[]>();
  const rest: Node[] = [];

  for (const node of nodes) {
    if (!(node instanceof HTMLElement) || !node.dataset.slot) {
      rest.push(node);
      continue;
    }

    const slotName = node.dataset.slot;
    const children = Array.from(node.childNodes);
    const attrs: Record<string, string> = {};

    // Collect data-* attributes (excluding data-slot itself)
    for (const key of Object.keys(node.dataset)) {
      if (key !== 'slot') {
        attrs[key] = node.dataset[key]!;
      }
    }

    const entry: SlotEntry = { element: node, children, attrs };

    if (!slots.has(slotName)) {
      slots.set(slotName, []);
    }
    slots.get(slotName)!.push(entry);
  }

  return { slots, rest };
}
