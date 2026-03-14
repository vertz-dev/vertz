/**
 * OpenGL text renderer using FreeType glyph atlas.
 *
 * Pre-renders ASCII glyphs to a texture atlas, then draws text
 * as textured quads with per-vertex colors.
 */

import { ptr, toArrayBuffer } from 'bun:ffi';
import {
  GL_ARRAY_BUFFER,
  GL_CLAMP_TO_EDGE,
  GL_FLOAT,
  GL_FRAGMENT_SHADER,
  GL_LINEAR,
  GL_RED,
  GL_STATIC_DRAW,
  GL_TEXTURE_2D,
  GL_TEXTURE_MAG_FILTER,
  GL_TEXTURE_MIN_FILTER,
  GL_TEXTURE_WRAP_S,
  GL_TEXTURE_WRAP_T,
  GL_TEXTURE0,
  GL_TRIANGLES,
  GL_UNPACK_ALIGNMENT,
  GL_UNSIGNED_BYTE,
  GL_VERTEX_SHADER,
  type GLBindings,
} from '../render/gl-ffi';
import { loadFreetype } from './freetype-ffi';

interface CachedGlyph {
  /** Texture atlas X offset */
  atlasX: number;
  /** Glyph bitmap width */
  width: number;
  /** Glyph bitmap height */
  height: number;
  /** Horizontal bearing */
  bearingX: number;
  /** Vertical bearing */
  bearingY: number;
  /** Horizontal advance to next glyph */
  advance: number;
}

export interface TextRenderer {
  /** Render text at pixel position with RGBA color. */
  renderText(
    text: string,
    x: number,
    y: number,
    color: [number, number, number, number],
    viewportWidth: number,
    viewportHeight: number,
  ): void;
  /** Measure text width in pixels. */
  measureText(text: string): number;
  /** Get line height in pixels. */
  lineHeight(): number;
  /** Clean up GPU resources. */
  dispose(): void;
}

// Text shader: position (2) + texcoord (2) + color (4) = 8 floats per vertex
const TEXT_VERTEX_SHADER = `#version 330 core
layout (location = 0) in vec2 aPos;
layout (location = 1) in vec2 aTexCoord;
layout (location = 2) in vec4 aColor;
out vec2 vTexCoord;
out vec4 vColor;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
  vTexCoord = aTexCoord;
  vColor = aColor;
}
`;

const TEXT_FRAGMENT_SHADER = `#version 330 core
in vec2 vTexCoord;
in vec4 vColor;
out vec4 FragColor;
uniform sampler2D uTexture;
void main() {
  float alpha = texture(uTexture, vTexCoord).r;
  FragColor = vec4(vColor.rgb, vColor.a * alpha);
}
`;

const ATLAS_WIDTH = 1024;
const ATLAS_HEIGHT = 64;
const ASCII_START = 32; // space
const ASCII_END = 127; // ~

/**
 * Create a text renderer with a pre-built glyph atlas.
 *
 * Must be called after a GL context is current.
 */
export function createTextRenderer(
  gl: GLBindings,
  fontPath: string,
  fontSize: number,
): TextRenderer {
  const ft = loadFreetype();
  ft.init();
  const face = ft.loadFont(fontPath, fontSize);
  if (!face) {
    throw new Error(`Failed to load font: ${fontPath}`);
  }

  const _lineHeight = ft.lineHeight(face);
  const ascender = ft.ascender(face);

  // Build glyph atlas
  const glyphCache = new Map<number, CachedGlyph>();
  const atlasData = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT);
  let atlasX = 0;

  for (let charCode = ASCII_START; charCode < ASCII_END; charCode++) {
    const glyph = ft.renderGlyph(face, charCode);
    if (!glyph) continue;

    if (atlasX + glyph.width >= ATLAS_WIDTH) break; // atlas full

    // Copy glyph bitmap into atlas
    if (glyph.width > 0 && glyph.height > 0) {
      const bitmapArray = new Uint8Array(
        toArrayBuffer(glyph.buffer, 0, glyph.pitch * glyph.height),
      );
      for (let row = 0; row < glyph.height; row++) {
        for (let col = 0; col < glyph.width; col++) {
          const srcIdx = row * glyph.pitch + col;
          const dstIdx = row * ATLAS_WIDTH + (atlasX + col);
          atlasData[dstIdx] = bitmapArray[srcIdx];
        }
      }
    }

    glyphCache.set(charCode, {
      atlasX,
      width: glyph.width,
      height: glyph.height,
      bearingX: glyph.bearingX,
      bearingY: glyph.bearingY,
      advance: glyph.advance,
    });

    atlasX += glyph.width + 1; // 1px padding between glyphs
  }

  // Upload atlas to GPU texture
  gl.glPixelStorei(GL_UNPACK_ALIGNMENT, 1);
  const texBuf = new Uint8Array(4);
  gl.glGenTextures(1, texBuf);
  const texture = new DataView(texBuf.buffer).getUint32(0, true);

  gl.glBindTexture(GL_TEXTURE_2D, texture);
  gl.glTexImage2D(
    GL_TEXTURE_2D,
    0,
    GL_RED as number,
    ATLAS_WIDTH,
    ATLAS_HEIGHT,
    0,
    GL_RED,
    GL_UNSIGNED_BYTE,
    atlasData,
  );
  gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);

  // Compile text shaders
  const vertShader = compileShader(gl, GL_VERTEX_SHADER, TEXT_VERTEX_SHADER);
  const fragShader = compileShader(gl, GL_FRAGMENT_SHADER, TEXT_FRAGMENT_SHADER);

  const program = gl.glCreateProgram();
  gl.glAttachShader(program, vertShader);
  gl.glAttachShader(program, fragShader);
  gl.glLinkProgram(program);
  gl.glDeleteShader(vertShader);
  gl.glDeleteShader(fragShader);

  // Get uniform location for texture sampler
  const texUniformName = new TextEncoder().encode('uTexture\0');
  const texUniformLoc = gl.glGetUniformLocation(program, texUniformName);

  // Create VAO and VBO for text quads
  const vaoBuf = new Uint8Array(4);
  gl.glGenVertexArrays(1, vaoBuf);
  const vao = new DataView(vaoBuf.buffer).getUint32(0, true);

  const vboBuf = new Uint8Array(4);
  gl.glGenBuffers(1, vboBuf);
  const vbo = new DataView(vboBuf.buffer).getUint32(0, true);

  gl.glBindVertexArray(vao);
  gl.glBindBuffer(GL_ARRAY_BUFFER, vbo);

  const stride = 8 * 4; // 8 floats * 4 bytes

  // Position (location 0): 2 floats at offset 0
  gl.glVertexAttribPointer(0, 2, GL_FLOAT, 0, stride, 0);
  gl.glEnableVertexAttribArray(0);

  // TexCoord (location 1): 2 floats at offset 8
  gl.glVertexAttribPointer(1, 2, GL_FLOAT, 0, stride, 2 * 4);
  gl.glEnableVertexAttribArray(1);

  // Color (location 2): 4 floats at offset 16
  gl.glVertexAttribPointer(2, 4, GL_FLOAT, 0, stride, 4 * 4);
  gl.glEnableVertexAttribArray(2);

  gl.glBindVertexArray(0);

  return {
    renderText(text, x, y, color, viewportWidth, viewportHeight) {
      if (text.length === 0) return;

      const floatsPerVertex = 8;
      const verticesPerChar = 6;
      const maxFloats = text.length * verticesPerChar * floatsPerVertex;
      const data = new Float32Array(maxFloats);
      let offset = 0;
      let cursorX = x;

      for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const glyph = glyphCache.get(charCode);
        if (!glyph) {
          // Skip unknown characters, advance by space width
          const spaceGlyph = glyphCache.get(32);
          cursorX += spaceGlyph ? spaceGlyph.advance : fontSize / 2;
          continue;
        }

        if (glyph.width === 0 || glyph.height === 0) {
          cursorX += glyph.advance;
          continue;
        }

        // Pixel positions for the glyph quad
        const px0 = cursorX + glyph.bearingX;
        const py0 = y + (ascender - glyph.bearingY);
        const px1 = px0 + glyph.width;
        const py1 = py0 + glyph.height;

        // Convert pixel coords to NDC
        const nx0 = (px0 / viewportWidth) * 2 - 1;
        const ny0 = 1 - (py0 / viewportHeight) * 2;
        const nx1 = (px1 / viewportWidth) * 2 - 1;
        const ny1 = 1 - (py1 / viewportHeight) * 2;

        // Texture coordinates in atlas
        const tx0 = glyph.atlasX / ATLAS_WIDTH;
        const tx1 = (glyph.atlasX + glyph.width) / ATLAS_WIDTH;
        const ty0 = 0;
        const ty1 = glyph.height / ATLAS_HEIGHT;

        const [r, g, b, a] = color;

        // Two triangles for the glyph quad (6 vertices)
        // Triangle 1: top-left, top-right, bottom-right
        data[offset++] = nx0;
        data[offset++] = ny0;
        data[offset++] = tx0;
        data[offset++] = ty0;
        data[offset++] = r;
        data[offset++] = g;
        data[offset++] = b;
        data[offset++] = a;
        data[offset++] = nx1;
        data[offset++] = ny0;
        data[offset++] = tx1;
        data[offset++] = ty0;
        data[offset++] = r;
        data[offset++] = g;
        data[offset++] = b;
        data[offset++] = a;
        data[offset++] = nx1;
        data[offset++] = ny1;
        data[offset++] = tx1;
        data[offset++] = ty1;
        data[offset++] = r;
        data[offset++] = g;
        data[offset++] = b;
        data[offset++] = a;
        // Triangle 2: top-left, bottom-right, bottom-left
        data[offset++] = nx0;
        data[offset++] = ny0;
        data[offset++] = tx0;
        data[offset++] = ty0;
        data[offset++] = r;
        data[offset++] = g;
        data[offset++] = b;
        data[offset++] = a;
        data[offset++] = nx1;
        data[offset++] = ny1;
        data[offset++] = tx1;
        data[offset++] = ty1;
        data[offset++] = r;
        data[offset++] = g;
        data[offset++] = b;
        data[offset++] = a;
        data[offset++] = nx0;
        data[offset++] = ny1;
        data[offset++] = tx0;
        data[offset++] = ty1;
        data[offset++] = r;
        data[offset++] = g;
        data[offset++] = b;
        data[offset++] = a;

        cursorX += glyph.advance;
      }

      if (offset === 0) return;

      const vertexCount = offset / floatsPerVertex;

      gl.glUseProgram(program);
      gl.glActiveTexture(GL_TEXTURE0);
      gl.glBindTexture(GL_TEXTURE_2D, texture);
      gl.glUniform1i(texUniformLoc, 0);

      gl.glBindVertexArray(vao);
      gl.glBindBuffer(GL_ARRAY_BUFFER, vbo);
      gl.glBufferData(
        GL_ARRAY_BUFFER,
        offset * 4,
        new Uint8Array(data.buffer, 0, offset * 4),
        GL_STATIC_DRAW,
      );
      gl.glDrawArrays(GL_TRIANGLES, 0, vertexCount);
      gl.glBindVertexArray(0);
    },

    measureText(text: string): number {
      return ft.measureText(face, text);
    },

    lineHeight(): number {
      return _lineHeight;
    },

    dispose() {
      ft.freeFont(face);
      ft.shutdown();
    },
  };
}

function compileShader(gl: GLBindings, type: number, source: string): number {
  const shader = gl.glCreateShader(type);
  const encoder = new TextEncoder();
  const sourceBytes = encoder.encode(`${source}\0`);
  const sourcePtr = ptr(sourceBytes);
  const ptrArray = new BigUint64Array(1);
  ptrArray[0] = BigInt(sourcePtr);
  const ptrArrayBytes = new Uint8Array(ptrArray.buffer);

  gl.glShaderSource(shader, 1, ptrArrayBytes, null);
  gl.glCompileShader(shader);

  const status = new Uint8Array(4);
  gl.glGetShaderiv(shader, 0x8b81, status);
  const compiled = new DataView(status.buffer).getInt32(0, true);
  if (!compiled) {
    const logBuf = new Uint8Array(1024);
    gl.glGetShaderInfoLog(shader, 1024, null, logBuf);
    const msg = new TextDecoder().decode(logBuf).replace(/\0+$/, '');
    console.error(`Text shader compilation failed:\n${msg}`);
  }

  return shader;
}
