import { effect } from './signal';
import type { NodeData } from './node-data';

export class DOMRenderer {
  private container: HTMLElement;
  private elements = new Map<number, HTMLDivElement>();
  private nodes: NodeData[] = [];
  private cleanups: Array<() => void> = [];
  private dragging: { node: NodeData; offsetX: number; offsetY: number } | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(nodes: NodeData[]) {
    // Clean up old nodes
    this.cleanup();
    this.nodes = nodes;

    // Create DOM elements for each node
    for (const node of nodes) {
      const el = document.createElement('div');
      el.className = 'node';
      el.style.background = node.color;
      el.textContent = node.label;
      
      this.elements.set(node.id, el);
      this.container.appendChild(el);

      // Set up drag handlers
      this.setupDrag(el, node);

      // Use effect to reactively update position
      const cleanup = effect(() => {
        el.style.left = `${node.x.value}px`;
        el.style.top = `${node.y.value}px`;
      });
      
      this.cleanups.push(cleanup);
    }
  }

  private setupDrag(el: HTMLDivElement, node: NodeData) {
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      this.dragging = {
        node,
        offsetX: e.clientX - node.x.peek(),
        offsetY: e.clientY - node.y.peek(),
      };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.dragging) return;
      const rect = this.container.getBoundingClientRect();
      this.dragging.node.x.value = e.clientX - rect.left - this.dragging.offsetX;
      this.dragging.node.y.value = e.clientY - rect.top - this.dragging.offsetY;
    };

    const onMouseUp = () => {
      this.dragging = null;
    };

    el.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    this.cleanups.push(() => {
      el.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    });
  }

  cleanup() {
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.cleanups = [];
    this.elements.clear();
    this.container.innerHTML = '';
  }
}
