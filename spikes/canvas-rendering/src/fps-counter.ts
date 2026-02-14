export class FPSCounter {
  private frames = 0;
  private lastTime = performance.now();
  private fps = 0;
  private element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
    this.tick();
  }

  private tick = () => {
    this.frames++;
    const now = performance.now();
    const delta = now - this.lastTime;

    if (delta >= 1000) {
      this.fps = Math.round((this.frames * 1000) / delta);
      this.element.textContent = `${this.fps} FPS`;
      this.frames = 0;
      this.lastTime = now;
    }

    requestAnimationFrame(this.tick);
  };

  getFPS(): number {
    return this.fps;
  }
}
