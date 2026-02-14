import * as PIXI from 'pixi.js';
import { effect } from './signal';
import type { NodeData } from './node-data';

export class CanvasRenderer {
  private app: PIXI.Application;
  private container: HTMLElement;
  private sprites = new Map<number, PIXI.Graphics>();
  private labels = new Map<number, PIXI.Text>();
  private nodes: NodeData[] = [];
  private cleanups: Array<() => void> = [];
  private dragging: { node: NodeData; offsetX: number; offsetY: number } | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    
    // Create PixiJS application
    this.app = new PIXI.Application();
  }

  async init() {
    await this.app.init({
      width: this.container.clientWidth,
      height: this.container.clientHeight,
      backgroundColor: 0x111111,
      antialias: true,
    });

    this.container.appendChild(this.app.canvas);

    // Set up global pointer events for dragging
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = new PIXI.Rectangle(0, 0, this.app.canvas.width, this.app.canvas.height);
    
    this.app.stage.on('globalpointermove', (e: PIXI.FederatedPointerEvent) => {
      if (!this.dragging) return;
      const pos = e.global;
      this.dragging.node.x.value = pos.x - this.dragging.offsetX;
      this.dragging.node.y.value = pos.y - this.dragging.offsetY;
    });

    this.app.stage.on('pointerup', () => {
      this.dragging = null;
    });

    this.app.stage.on('pointerupoutside', () => {
      this.dragging = null;
    });
  }

  render(nodes: NodeData[]) {
    this.cleanup();
    this.nodes = nodes;

    for (const node of nodes) {
      // Create graphics for the box
      const graphics = new PIXI.Graphics();
      graphics.eventMode = 'static';
      graphics.cursor = 'pointer';
      
      // Draw rounded rectangle
      const color = parseInt(node.color.slice(1), 16);
      graphics.roundRect(0, 0, 50, 50, 6);
      graphics.fill({ color });
      
      this.sprites.set(node.id, graphics);
      this.app.stage.addChild(graphics);

      // Create text label
      const text = new PIXI.Text({
        text: node.label,
        style: {
          fontSize: 14,
          fontWeight: '600',
          fill: 0xffffff,
        },
      });
      text.anchor.set(0.5);
      text.x = 25;
      text.y = 25;
      
      graphics.addChild(text);
      this.labels.set(node.id, text);

      // Set up drag handlers
      graphics.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
        e.stopPropagation();
        const pos = e.global;
        this.dragging = {
          node,
          offsetX: pos.x - node.x.peek(),
          offsetY: pos.y - node.y.peek(),
        };
      });

      // Use effect to reactively update position
      const cleanup = effect(() => {
        graphics.x = node.x.value;
        graphics.y = node.y.value;
      });
      
      this.cleanups.push(cleanup);
    }
  }

  cleanup() {
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.cleanups = [];
    
    for (const sprite of this.sprites.values()) {
      sprite.destroy();
    }
    this.sprites.clear();
    this.labels.clear();
  }

  destroy() {
    this.cleanup();
    this.app.destroy(true, { children: true });
  }
}
