import { signal } from '@vertz/ui';
import { Canvas, Sprite, useTicker } from '../../src/index';

// Bunny texture from PixiJS examples
const BUNNY_TEXTURE = 'https://pixijs.com/assets/bunny.png';

const WIDTH = 800;
const HEIGHT = 600;
const SPRITE_COUNT = 100;
const GRAVITY = 0.5;
const BOUNCE_DAMPING = 0.9;

/**
 * A single bouncing sprite with physics
 */
interface SpriteData {
  x: ReturnType<typeof signal<number>>;
  y: ReturnType<typeof signal<number>>;
  vx: number;
  vy: number;
}

/**
 * Create a bouncing sprite with random initial position and velocity
 */
function createSpriteData(): SpriteData {
  return {
    x: signal(Math.random() * WIDTH),
    y: signal(Math.random() * HEIGHT / 2), // Start in upper half
    vx: (Math.random() - 0.5) * 10,
    vy: Math.random() * -5 - 2, // Upward initial velocity
  };
}

/**
 * Bouncing sprite component - updates position each frame
 */
function BouncingSprite(props: { data: SpriteData }) {
  const { data } = props;
  
  useTicker((delta) => {
    // Apply gravity
    data.vy += GRAVITY * delta;
    
    // Update position
    let newX = data.x() + data.vx * delta;
    let newY = data.y() + data.vy * delta;
    
    // Bounce off walls (left/right)
    if (newX < 0) {
      newX = 0;
      data.vx *= -BOUNCE_DAMPING;
    } else if (newX > WIDTH) {
      newX = WIDTH;
      data.vx *= -BOUNCE_DAMPING;
    }
    
    // Bounce off floor/ceiling
    if (newY > HEIGHT) {
      newY = HEIGHT;
      data.vy *= -BOUNCE_DAMPING;
    } else if (newY < 0) {
      newY = 0;
      data.vy *= -BOUNCE_DAMPING;
    }
    
    // Update signals
    data.x.set(newX);
    data.y.set(newY);
  });
  
  return Sprite({
    x: data.x(),
    y: data.y(),
    texture: BUNNY_TEXTURE,
    anchor: 0.5, // Center the sprite
  });
}

/**
 * FPS counter component
 */
function FPSCounter() {
  const fps = signal(0);
  let lastTime = Date.now();
  let frames = 0;
  
  useTicker(() => {
    frames++;
    const now = Date.now();
    const elapsed = now - lastTime;
    
    // Update FPS every 500ms
    if (elapsed >= 500) {
      fps.set(Math.round((frames / elapsed) * 1000));
      frames = 0;
      lastTime = now;
    }
  });
  
  // Create DOM element for FPS display (overlay on canvas)
  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.innerHTML = `
    <div>FPS: <span id="fps-value">${fps()}</span></div>
    <div>Sprites: ${SPRITE_COUNT}</div>
  `;
  
  // Update FPS display when signal changes
  // In a real vertz app, this would be handled by the compiler
  // For this demo, we manually update the DOM
  const updateFPS = () => {
    const fpsEl = stats.querySelector('#fps-value');
    if (fpsEl) {
      fpsEl.textContent = fps().toString();
    }
  };
  
  useTicker(() => {
    updateFPS();
  });
  
  return stats;
}

/**
 * Main app - canvas with bouncing sprites
 */
function App() {
  // Create sprite data
  const sprites: SpriteData[] = [];
  for (let i = 0; i < SPRITE_COUNT; i++) {
    sprites.push(createSpriteData());
  }
  
  // Create container
  const container = document.createElement('div');
  container.className = 'canvas-container';
  
  // Create canvas with sprites
  const canvas = Canvas({
    width: WIDTH,
    height: HEIGHT,
    background: 0x1099bb, // PixiJS blue
    children: () => {
      const frag = document.createDocumentFragment();
      
      // Add all bouncing sprites
      sprites.forEach(data => {
        frag.appendChild(BouncingSprite({ data }));
      });
      
      return frag;
    },
  });
  
  // Add FPS counter overlay
  const fpsCounter = FPSCounter();
  
  container.appendChild(canvas);
  container.appendChild(fpsCounter);
  
  return container;
}

/**
 * Mount the app
 */
function mount() {
  const root = document.getElementById('root');
  if (!root) {
    throw new Error('Root element not found');
  }
  
  // In a real vertz app, this would be handled by the framework
  // For this demo, we manually mount
  root.appendChild(App());
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
