import { signal } from '@vertz/ui';
import { Canvas, Sprite, useTicker } from '../../packages/canvas/src/index';

const BUNNY_TEXTURE = 'https://pixijs.com/assets/bunny.png';
const WIDTH = 800;
const HEIGHT = 600;
const GRAVITY = 0.5;
const BOUNCE_DAMPING = 0.9;

interface SpriteData {
  x: ReturnType<typeof signal<number>>;
  y: ReturnType<typeof signal<number>>;
  vx: number;
  vy: number;
}

function createSpriteData(): SpriteData {
  return {
    x: signal(Math.random() * WIDTH),
    y: signal(Math.random() * HEIGHT / 2),
    vx: (Math.random() - 0.5) * 10,
    vy: Math.random() * -5 - 2,
  };
}

function BouncingSprite(props: { data: SpriteData }) {
  const { data } = props;
  
  useTicker((delta) => {
    data.vy += GRAVITY * delta;
    
    let newX = data.x() + data.vx * delta;
    let newY = data.y() + data.vy * delta;
    
    if (newX < 0) {
      newX = 0;
      data.vx *= -BOUNCE_DAMPING;
    } else if (newX > WIDTH) {
      newX = WIDTH;
      data.vx *= -BOUNCE_DAMPING;
    }
    
    if (newY > HEIGHT) {
      newY = HEIGHT;
      data.vy *= -BOUNCE_DAMPING;
    } else if (newY < 0) {
      newY = 0;
      data.vy *= -BOUNCE_DAMPING;
    }
    
    data.x.set(newX);
    data.y.set(newY);
  });
  
  return Sprite({
    x: data.x(),
    y: data.y(),
    texture: BUNNY_TEXTURE,
    anchor: 0.5,
  });
}

function StatsOverlay(props: { spriteCount: number }) {
  const fps = signal(0);
  const frameTime = signal(0);
  let lastTime = Date.now();
  let frames = 0;
  let frameTimes: number[] = [];
  
  useTicker(() => {
    frames++;
    const now = Date.now();
    const elapsed = now - lastTime;
    
    // Track individual frame times
    frameTimes.push(elapsed);
    if (frameTimes.length > 60) frameTimes.shift();
    
    // Update metrics every 500ms
    if (elapsed >= 500) {
      const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      fps.set(Math.round((frames / elapsed) * 1000));
      frameTime.set(Math.round(avgFrameTime * 10) / 10);
      frames = 0;
      lastTime = now;
    }
  });
  
  const stats = document.createElement('div');
  stats.className = 'stats';
  
  const updateStats = () => {
    const fpsValue = fps();
    const ftValue = frameTime();
    
    let fpsClass = 'value';
    if (fpsValue < 30) fpsClass = 'value error';
    else if (fpsValue < 50) fpsClass = 'value warning';
    
    stats.innerHTML = `
      <div class="metric">
        <span class="label">Sprites:</span>
        <span class="value">${props.spriteCount}</span>
      </div>
      <div class="metric">
        <span class="label">FPS:</span>
        <span class="${fpsClass}">${fpsValue}</span>
      </div>
      <div class="metric">
        <span class="label">Frame Time:</span>
        <span class="value">${ftValue}ms</span>
      </div>
      <div class="metric">
        <span class="label">Target:</span>
        <span class="value">60 FPS (16.7ms)</span>
      </div>
    `;
  };
  
  useTicker(() => {
    updateStats();
  });
  
  return stats;
}

function App(spriteCount: number) {
  const sprites: SpriteData[] = [];
  for (let i = 0; i < spriteCount; i++) {
    sprites.push(createSpriteData());
  }
  
  const container = document.createElement('div');
  container.className = 'canvas-container';
  
  const canvas = Canvas({
    width: WIDTH,
    height: HEIGHT,
    background: 0x1099bb,
    children: () => {
      const frag = document.createDocumentFragment();
      sprites.forEach(data => {
        frag.appendChild(BouncingSprite({ data }));
      });
      return frag;
    },
  });
  
  const statsOverlay = StatsOverlay({ spriteCount });
  
  container.appendChild(canvas);
  container.appendChild(statsOverlay);
  
  return container;
}

let currentApp: HTMLElement | null = null;

function mount(spriteCount: number) {
  const root = document.getElementById('root');
  if (!root) throw new Error('Root element not found');
  
  // Remove existing app
  if (currentApp) {
    root.removeChild(currentApp);
    currentApp = null;
  }
  
  // Mount new app
  currentApp = App(spriteCount);
  root.appendChild(currentApp);
}

// Button handlers
function setupControls() {
  const buttons = {
    '100': document.getElementById('btn-100'),
    '500': document.getElementById('btn-500'),
    '1000': document.getElementById('btn-1000'),
    '2000': document.getElementById('btn-2000'),
  };
  
  Object.entries(buttons).forEach(([count, btn]) => {
    if (btn) {
      btn.addEventListener('click', () => {
        // Update active state
        Object.values(buttons).forEach(b => b?.classList.remove('active'));
        btn.classList.add('active');
        
        // Remount with new count
        mount(parseInt(count, 10));
      });
    }
  });
}

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setupControls();
    mount(100); // Start with 100
  });
} else {
  setupControls();
  mount(100);
}
