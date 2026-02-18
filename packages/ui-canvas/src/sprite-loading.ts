import { Assets, type Sprite } from 'pixi.js';

/**
 * Load a texture asynchronously and assign it to a Sprite.
 * The sprite is hidden until the texture loads successfully.
 *
 * - On success: sets `sprite.texture` and makes the sprite visible.
 * - On failure: logs a warning, sprite remains invisible.
 * - If the sprite is destroyed before the texture loads, the assignment is skipped.
 *
 * @param sprite - The Sprite to load the texture into.
 * @param path - The texture asset path (resolved by PixiJS Assets).
 * @returns A promise that resolves when loading completes (success or failure).
 */
export async function loadSpriteTexture(sprite: Sprite, path: string): Promise<void> {
  sprite.visible = false;

  try {
    const texture = await Assets.load(path);

    // Guard against sprite destroyed while loading
    if (sprite.destroyed) return;

    sprite.texture = texture;
    sprite.visible = true;
  } catch (error) {
    console.warn(
      `[ui-canvas] Failed to load texture "${path}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
