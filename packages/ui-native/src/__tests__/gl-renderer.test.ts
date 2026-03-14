import { describe, expect, it } from 'bun:test';
import { buildBatchVertices, rectToVertices } from '../render/gl-renderer';
import type { RectCommand } from '../render/renderer';

describe('rectToVertices', () => {
  describe('Given a rect command in pixel coordinates', () => {
    it('Then converts to NDC and produces 6 vertices (2 triangles)', () => {
      const rect: RectCommand = {
        type: 'rect',
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        color: '#ff0000',
      };
      const verts = rectToVertices(rect, 800, 600);
      // 2 triangles = 6 vertices, each with x, y, r, g, b, a = 6 floats
      expect(verts.length).toBe(6);

      // Top-left corner should be at NDC (-1, 1) for pixel (0,0)
      expect(verts[0].x).toBeCloseTo(-1.0);
      expect(verts[0].y).toBeCloseTo(1.0);
      // Color should be red
      expect(verts[0].r).toBeCloseTo(1.0);
      expect(verts[0].g).toBeCloseTo(0.0);
      expect(verts[0].b).toBeCloseTo(0.0);
      expect(verts[0].a).toBeCloseTo(1.0);
    });

    it('Then bottom-right maps to correct NDC', () => {
      const rect: RectCommand = {
        type: 'rect',
        x: 400,
        y: 300,
        width: 400,
        height: 300,
        color: '#0000ff',
      };
      const verts = rectToVertices(rect, 800, 600);
      // Bottom-right vertex should be at NDC (1, -1) for pixel (800, 600)
      // That's vertex index 2 (bottom-right of first triangle)
      expect(verts[2].x).toBeCloseTo(1.0);
      expect(verts[2].y).toBeCloseTo(-1.0);
    });
  });

  describe('Given a transparent rect', () => {
    it('Then alpha is 0', () => {
      const rect: RectCommand = {
        type: 'rect',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        color: 'transparent',
      };
      const verts = rectToVertices(rect, 800, 600);
      expect(verts[0].a).toBe(0);
    });
  });
});

describe('buildBatchVertices', () => {
  describe('Given multiple rect commands', () => {
    it('Then produces a flat Float32Array with all vertices', () => {
      const rects: RectCommand[] = [
        { type: 'rect', x: 0, y: 0, width: 100, height: 50, color: '#ff0000' },
        { type: 'rect', x: 100, y: 0, width: 100, height: 50, color: '#00ff00' },
      ];
      const { data, vertexCount } = buildBatchVertices(rects, 800, 600);
      // 2 rects × 6 vertices × 6 floats = 72 floats
      expect(vertexCount).toBe(12);
      expect(data.length).toBe(72);
    });
  });

  describe('Given empty commands', () => {
    it('Then returns empty array', () => {
      const { data, vertexCount } = buildBatchVertices([], 800, 600);
      expect(vertexCount).toBe(0);
      expect(data.length).toBe(0);
    });
  });
});
