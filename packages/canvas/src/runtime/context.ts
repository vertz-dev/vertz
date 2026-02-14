import { createContext } from '@vertz/ui';
import type { Application } from 'pixi.js';

/**
 * Context for providing the PixiJS Application to child components.
 * This allows Sprite, Container, and other canvas components to access
 * the app instance and add themselves to the scene graph.
 */
export const CanvasContext = createContext<Application | null>(null);
