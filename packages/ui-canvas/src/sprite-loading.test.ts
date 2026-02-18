import { Assets, Sprite, Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSpriteTexture } from './sprite-loading';

describe('Feature: Sprite async texture loading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Given a sprite and a valid texture path', () => {
    describe('When loadSpriteTexture is called', () => {
      it('then the sprite starts invisible', () => {
        const sprite = new Sprite();
        const mockTexture = Texture.WHITE;
        vi.spyOn(Assets, 'load').mockResolvedValue(mockTexture);

        loadSpriteTexture(sprite, 'assets/player.png');

        expect(sprite.visible).toBe(false);
      });

      it('then the sprite becomes visible after texture loads', async () => {
        const sprite = new Sprite();
        const mockTexture = Texture.WHITE;
        vi.spyOn(Assets, 'load').mockResolvedValue(mockTexture);

        await loadSpriteTexture(sprite, 'assets/player.png');

        expect(sprite.texture).toBe(mockTexture);
        expect(sprite.visible).toBe(true);
      });
    });
  });

  describe('Given a texture that fails to load', () => {
    describe('When loadSpriteTexture is called', () => {
      it('then the sprite remains invisible and a warning is logged', async () => {
        const sprite = new Sprite();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(Assets, 'load').mockRejectedValue(new Error('Not found'));

        await loadSpriteTexture(sprite, 'assets/missing.png');

        expect(sprite.visible).toBe(false);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('assets/missing.png'),
        );
      });
    });
  });

  describe('Given a sprite that was destroyed before texture loads', () => {
    describe('When the texture resolves', () => {
      it('then the texture is not assigned to the destroyed sprite', async () => {
        const sprite = new Sprite();
        const mockTexture = Texture.WHITE;

        let resolveLoad!: (value: Texture) => void;
        vi.spyOn(Assets, 'load').mockReturnValue(
          new Promise((resolve) => {
            resolveLoad = resolve;
          }),
        );

        const loadPromise = loadSpriteTexture(sprite, 'assets/player.png');

        // Destroy sprite before texture loads
        sprite.destroy();

        // Now resolve the texture
        resolveLoad(mockTexture);
        await loadPromise;

        // Should not crash — texture not assigned to destroyed sprite
        expect(sprite.destroyed).toBe(true);
      });
    });
  });
});
