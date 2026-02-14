/**
 * Demo Script Type Definitions
 * 
 * These types define the structure for automated demo recordings.
 */

import type { Page } from '@playwright/test';

/**
 * Delay configuration for realistic human-like timing
 */
export interface DelayConfig {
  /** Base delay in milliseconds */
  base: number;
  /** Random variance (0-1) to add natural timing */
  variance?: number;
}

/**
 * Screenshot annotation options
 */
export interface ScreenshotOptions {
  /** Descriptive name for the screenshot */
  name: string;
  /** Optional text overlay */
  annotation?: string;
  /** Highlight specific elements */
  highlight?: string[];
}

/**
 * Action types for demo scripts
 */
export type DemoAction =
  | { type: 'navigate'; url: string; waitFor?: string }
  | { type: 'click'; selector: string; description?: string }
  | { type: 'type'; selector: string; text: string; description?: string }
  | { type: 'wait'; ms: number; description?: string }
  | { type: 'screenshot'; options: ScreenshotOptions }
  | { type: 'custom'; fn: (page: Page) => Promise<void>; description?: string };

/**
 * Demo script configuration
 */
export interface DemoScript {
  /** Unique identifier for the demo */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what the demo showcases */
  description: string;
  /** Starting URL (can be relative to base URL) */
  startUrl: string;
  /** Sequence of actions to execute */
  actions: DemoAction[];
  /** Default delay between actions (can be overridden per action) */
  defaultDelay?: DelayConfig;
  /** Video output path (relative to demos/) */
  outputPath: string;
}

/**
 * Recorder configuration options
 */
export interface RecorderConfig {
  /** Base URL for the application */
  baseUrl: string;
  /** Video recording settings */
  video?: {
    /** Video format */
    format?: 'webm' | 'mp4';
    /** Video dimensions */
    size?: { width: number; height: number };
    /** Frame rate */
    fps?: number;
  };
  /** Headless mode (default: true) */
  headless?: boolean;
  /** Default timeout for actions (ms) */
  timeout?: number;
  /** Output directory for demos */
  outputDir?: string;
}

/**
 * Demo execution result
 */
export interface DemoResult {
  /** Demo script ID */
  id: string;
  /** Success status */
  success: boolean;
  /** Duration in milliseconds */
  duration: number;
  /** Path to output video */
  videoPath?: string;
  /** Paths to screenshots */
  screenshots: string[];
  /** Error message if failed */
  error?: string;
}
