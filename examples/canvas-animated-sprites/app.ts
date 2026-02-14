/**
 * Spike 01 — Animated Sprites Demo & Benchmark
 *
 * N sprites bouncing with gravity, position driven by vertz signals,
 * rendered by PixiJS. Click buttons to change sprite count.
 *
 * Directly uses PixiJS + signal + effect to validate the core concept:
 *   signal change → effect fires → PIXI property updated
 */
import { Application, Sprite, Texture } from 'pixi.js';
import { signal, effect } from '@vertz/ui';
import { pushScope, popScope, runCleanups } from '@vertz/ui/internals';
import type { Signal, DisposeFn } from '@vertz/ui';

const WIDTH = 800;
const HEIGHT = 600;
const GRAVITY = 0.75;
const BUNNY_URL = 'https://pixijs.com/assets/bunny.png';

interface Bunny {
  x: Signal<number>;
  y: Signal<number>;
  vx: number;
  vy: number;
  sprite: Sprite;
}

let app: Application;
let bunnies: Bunny[] = [];
let scope: DisposeFn[] = [];
let tickerCb: ((dt: any) => void) | null = null;

let frames = 0;
let lastFpsTime = performance.now();
const statsEl = document.getElementById('stats')!;

function createBunny(texture: Texture): Bunny {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);

  const x = signal(Math.random() * WIDTH);
  const y = signal(Math.random() * HEIGHT * 0.5);

  // *** THE CORE CONCEPT: signal → effect → PixiJS property ***
  effect(() => { sprite.x = x.value; });
  effect(() => { sprite.y = y.value; });

  app.stage.addChild(sprite);
  return { x, y, vx: (Math.random() - 0.5) * 10, vy: 0, sprite };
}

function updateBunny(b: Bunny, dt: number) {
  b.vy += GRAVITY * dt;
  let nx = b.x.value + b.vx * dt;
  let ny = b.y.value + b.vy * dt;

  if (nx < 0 || nx > WIDTH) { b.vx *= -1; nx = Math.max(0, Math.min(WIDTH, nx)); }
  if (ny > HEIGHT) { b.vy *= -0.85; ny = HEIGHT; if (Math.random() > 0.5) b.vy -= Math.random() * 6; }
  if (ny < 0) { b.vy = 0; ny = 0; }

  b.x.value = nx;
  b.y.value = ny;
}

async function start(count: number) {
  if (tickerCb) { app.ticker.remove(tickerCb); tickerCb = null; }
  runCleanups(scope);
  popScope();
  bunnies.forEach(b => b.sprite.destroy());
  bunnies = [];
  app.stage.removeChildren();

  scope = pushScope();
  const texture = await Texture.from(BUNNY_URL);
  for (let i = 0; i < count; i++) bunnies.push(createBunny(texture));

  tickerCb = (ticker: any) => {
    const dt = ticker.deltaTime ?? ticker;
    for (const b of bunnies) updateBunny(b, dt);

    frames++;
    const now = performance.now();
    if (now - lastFpsTime >= 500) {
      const fps = Math.round((frames * 1000) / (now - lastFpsTime));
      frames = 0;
      lastFpsTime = now;
      statsEl.textContent = `FPS: ${fps}\nSprites: ${count}`;
    }
  };
  app.ticker.add(tickerCb);
}

async function init() {
  app = new Application();
  await app.init({
    canvas: document.getElementById('canvas') as HTMLCanvasElement,
    width: WIDTH, height: HEIGHT, background: 0x1099bb,
  });

  document.querySelectorAll<HTMLButtonElement>('button[data-count]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('button[data-count]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      start(parseInt(btn.dataset.count!, 10));
    });
  });

  scope = pushScope();
  start(100);
}

init().catch(console.error);
