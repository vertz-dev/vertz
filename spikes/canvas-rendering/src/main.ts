import { DOMRenderer } from './dom-renderer';
import { CanvasRenderer } from './canvas-renderer';
import { generateNodes, randomizePositions, type NodeData } from './node-data';
import { FPSCounter } from './fps-counter';

class App {
  private domRenderer: DOMRenderer;
  private canvasRenderer: CanvasRenderer;
  private nodes: NodeData[] = [];
  private nodeCount = 100;
  private animating = false;
  private animationFrame: number | null = null;

  constructor() {
    const domContainer = document.getElementById('dom-container')!;
    const canvasContainer = document.getElementById('canvas-container')!;
    
    this.domRenderer = new DOMRenderer(domContainer);
    this.canvasRenderer = new CanvasRenderer(canvasContainer);
  }

  async init() {
    // Initialize canvas renderer
    await this.canvasRenderer.init();

    // Set up FPS counters
    new FPSCounter(document.getElementById('dom-fps')!);
    new FPSCounter(document.getElementById('canvas-fps')!);

    // Set up controls
    this.setupControls();

    // Initial render
    this.updateNodeCount(this.nodeCount);
  }

  private setupControls() {
    const nodeCountSlider = document.getElementById('node-count') as HTMLInputElement;
    const nodeCountValue = document.getElementById('node-count-value')!;
    const randomizeBtn = document.getElementById('randomize')!;
    const animateBtn = document.getElementById('animate')!;

    nodeCountSlider.addEventListener('input', (e) => {
      const count = parseInt((e.target as HTMLInputElement).value);
      nodeCountValue.textContent = count.toString();
      this.updateNodeCount(count);
    });

    randomizeBtn.addEventListener('click', () => {
      this.randomizePositions();
    });

    animateBtn.addEventListener('click', () => {
      this.toggleAnimation();
      animateBtn.textContent = this.animating ? 'Stop Animation' : 'Toggle Animation';
    });
  }

  private updateNodeCount(count: number) {
    this.nodeCount = count;
    const domContainer = document.getElementById('dom-container')!;
    const canvasContainer = document.getElementById('canvas-container')!;
    
    this.nodes = generateNodes(
      count,
      domContainer.clientWidth,
      domContainer.clientHeight
    );

    this.domRenderer.render(this.nodes);
    this.canvasRenderer.render(this.nodes);
  }

  private randomizePositions() {
    const domContainer = document.getElementById('dom-container')!;
    randomizePositions(
      this.nodes,
      domContainer.clientWidth,
      domContainer.clientHeight
    );
  }

  private toggleAnimation() {
    this.animating = !this.animating;
    
    if (this.animating) {
      this.startAnimation();
    } else if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private startAnimation() {
    const domContainer = document.getElementById('dom-container')!;
    const width = domContainer.clientWidth;
    const height = domContainer.clientHeight;
    
    const animate = (time: number) => {
      if (!this.animating) return;

      // Animate each node in a circular pattern
      for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        const speed = 0.001 + (i % 5) * 0.0002;
        const radius = 50 + (i % 10) * 20;
        const centerX = width / 2;
        const centerY = height / 2;
        
        const angle = time * speed + (i * Math.PI * 2) / this.nodes.length;
        node.x.value = centerX + Math.cos(angle) * radius - 25;
        node.y.value = centerY + Math.sin(angle) * radius - 25;
      }

      this.animationFrame = requestAnimationFrame(animate);
    };

    this.animationFrame = requestAnimationFrame(animate);
  }
}

// Start the app
const app = new App();
app.init().catch(console.error);
