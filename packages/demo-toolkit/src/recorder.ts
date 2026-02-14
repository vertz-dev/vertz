/**
 * Core Recording Engine
 *
 * Wraps Playwright to provide video recording capabilities for demo scripts.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { type Browser, type BrowserContext, chromium, type Page } from '@playwright/test';
import type { RecorderConfig } from './types.js';

/**
 * Demo recorder powered by Playwright
 */
export class DemoRecorder {
  private config: Required<RecorderConfig>;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(config: RecorderConfig) {
    this.config = {
      baseUrl: config.baseUrl,
      video: {
        format: config.video?.format ?? 'webm',
        size: config.video?.size ?? { width: 1280, height: 720 },
        fps: config.video?.fps ?? 30,
      },
      headless: config.headless ?? true,
      timeout: config.timeout ?? 30000,
      outputDir: config.outputDir ?? 'demos',
    };
  }

  /**
   * Initialize the browser and context
   */
  async init(): Promise<void> {
    // Ensure output directory exists
    await fs.mkdir(this.config.outputDir, { recursive: true });

    // Launch browser
    this.browser = await chromium.launch({
      headless: this.config.headless,
    });

    // Create context with video recording
    this.context = await this.browser.newContext({
      viewport: this.config.video.size,
      recordVideo: {
        dir: this.config.outputDir,
        size: this.config.video.size,
      },
    });

    // Set default timeout
    this.context.setDefaultTimeout(this.config.timeout);

    // Create page
    this.page = await this.context.newPage();
  }

  /**
   * Get the current page
   */
  getPage(): Page {
    if (!this.page) {
      throw new Error('Recorder not initialized. Call init() first.');
    }
    return this.page;
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string, waitFor?: string): Promise<void> {
    const page = this.getPage();
    const fullUrl = url.startsWith('http') ? url : `${this.config.baseUrl}${url}`;

    await page.goto(fullUrl);

    if (waitFor) {
      await page.waitForSelector(waitFor);
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(name: string): Promise<string> {
    const page = this.getPage();
    const screenshotPath = path.join(this.config.outputDir, `${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return screenshotPath;
  }

  /**
   * Click an element
   */
  async click(selector: string): Promise<void> {
    const page = this.getPage();
    await page.click(selector);
  }

  /**
   * Type text into an element
   */
  async type(selector: string, text: string): Promise<void> {
    const page = this.getPage();
    await page.fill(selector, text);
  }

  /**
   * Wait for a specified duration
   */
  async wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Close the recorder and save video
   */
  async close(): Promise<string | null> {
    if (!this.page || !this.context) {
      return null;
    }

    // Close page to finalize video
    await this.page.close();

    // Get video path before closing context
    const videoPath = await this.page.video()?.path();

    // Close context and browser
    await this.context.close();
    if (this.browser) {
      await this.browser.close();
    }

    // Reset state
    this.page = null;
    this.context = null;
    this.browser = null;

    return videoPath ?? null;
  }

  /**
   * Get the base URL
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Get the output directory
   */
  getOutputDir(): string {
    return this.config.outputDir;
  }
}

/**
 * Calculate delay with optional variance for human-like timing
 */
export function calculateDelay(base: number, variance = 0): number {
  if (variance === 0) return base;
  const randomFactor = 1 + (Math.random() * 2 - 1) * variance;
  return Math.floor(base * randomFactor);
}
