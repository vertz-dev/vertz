/**
 * OpenGL renderer that draws colored rectangles from DrawCommands.
 *
 * Uses a single shader program with per-vertex colors.
 * Rectangles are batched into a single draw call for performance.
 */

import { ptr } from 'bun:ffi';
import {
  GL_ARRAY_BUFFER,
  GL_FLOAT,
  GL_FRAGMENT_SHADER,
  GL_STATIC_DRAW,
  GL_TRIANGLES,
  GL_VERTEX_SHADER,
  type GLBindings,
} from './gl-ffi';
import { parseColor, type RectCommand } from './renderer';

// --- Vertex generation (pure math, testable without GPU) ---

export interface RectVertex {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Convert a RectCommand (pixel coords) to 6 vertices (2 triangles) in NDC.
 *
 * NDC: x[-1,1] left-to-right, y[-1,1] bottom-to-top.
 * Pixel: x[0,width] left-to-right, y[0,height] top-to-bottom.
 */
export function rectToVertices(
  rect: RectCommand,
  viewportWidth: number,
  viewportHeight: number,
): RectVertex[] {
  const [r, g, b, a] = parseColor(rect.color);

  // Convert pixel coords to NDC
  const x0 = (rect.x / viewportWidth) * 2 - 1;
  const y0 = 1 - (rect.y / viewportHeight) * 2;
  const x1 = ((rect.x + rect.width) / viewportWidth) * 2 - 1;
  const y1 = 1 - ((rect.y + rect.height) / viewportHeight) * 2;

  // Two triangles: top-left, top-right, bottom-right + top-left, bottom-right, bottom-left
  return [
    { x: x0, y: y0, r, g, b, a }, // top-left
    { x: x1, y: y0, r, g, b, a }, // top-right
    { x: x1, y: y1, r, g, b, a }, // bottom-right
    { x: x0, y: y0, r, g, b, a }, // top-left
    { x: x1, y: y1, r, g, b, a }, // bottom-right
    { x: x0, y: y1, r, g, b, a }, // bottom-left
  ];
}

/**
 * Batch multiple rect commands into a single Float32Array for GPU upload.
 * Returns the flat vertex data and count.
 */
export function buildBatchVertices(
  rects: RectCommand[],
  viewportWidth: number,
  viewportHeight: number,
): { data: Float32Array; vertexCount: number } {
  if (rects.length === 0) {
    return { data: new Float32Array(0), vertexCount: 0 };
  }

  const floatsPerVertex = 6; // x, y, r, g, b, a
  const verticesPerRect = 6; // 2 triangles
  const totalFloats = rects.length * verticesPerRect * floatsPerVertex;
  const data = new Float32Array(totalFloats);

  let offset = 0;
  for (const rect of rects) {
    const verts = rectToVertices(rect, viewportWidth, viewportHeight);
    for (const v of verts) {
      data[offset++] = v.x;
      data[offset++] = v.y;
      data[offset++] = v.r;
      data[offset++] = v.g;
      data[offset++] = v.b;
      data[offset++] = v.a;
    }
  }

  return { data, vertexCount: rects.length * verticesPerRect };
}

// --- Shader sources ---

const VERTEX_SHADER_SRC = `#version 330 core
layout (location = 0) in vec2 aPos;
layout (location = 1) in vec4 aColor;
out vec4 vColor;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
  vColor = aColor;
}
`;

const FRAGMENT_SHADER_SRC = `#version 330 core
in vec4 vColor;
out vec4 FragColor;
void main() {
  FragColor = vColor;
}
`;

// --- GPU renderer (requires GL context) ---

export interface GLRenderer {
  /** Render rect commands to the current GL context. */
  renderRects(rects: RectCommand[], viewportWidth: number, viewportHeight: number): void;
  /** Clean up GPU resources. */
  dispose(): void;
}

/**
 * Create a GL renderer with compiled shaders and buffer objects.
 * Must be called after a GL context is current.
 */
export function createGLRenderer(gl: GLBindings): GLRenderer {
  // Compile shaders
  const vertShader = compileShader(gl, GL_VERTEX_SHADER, VERTEX_SHADER_SRC);
  const fragShader = compileShader(gl, GL_FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);

  // Link program
  const program = gl.glCreateProgram();
  gl.glAttachShader(program, vertShader);
  gl.glAttachShader(program, fragShader);
  gl.glLinkProgram(program);

  // Check link status
  const linkStatus = new Uint8Array(4);
  gl.glGetProgramiv(program, 0x8b82 /* GL_LINK_STATUS */, linkStatus);
  const linked = new DataView(linkStatus.buffer).getInt32(0, true);
  if (!linked) {
    const logBuf = new Uint8Array(1024);
    gl.glGetProgramInfoLog(program, 1024, null, logBuf);
    const msg = new TextDecoder().decode(logBuf).replace(/\0+$/, '');
    console.error(`Shader link failed:\n${msg}`);
  }

  gl.glDeleteShader(vertShader);
  gl.glDeleteShader(fragShader);

  // Create VAO and VBO
  const vaoBuffer = new Uint8Array(4);
  gl.glGenVertexArrays(1, vaoBuffer);
  const vao = new DataView(vaoBuffer.buffer).getUint32(0, true);

  const vboBuffer = new Uint8Array(4);
  gl.glGenBuffers(1, vboBuffer);
  const vbo = new DataView(vboBuffer.buffer).getUint32(0, true);

  gl.glBindVertexArray(vao);
  gl.glBindBuffer(GL_ARRAY_BUFFER, vbo);

  const stride = 6 * 4; // 6 floats × 4 bytes

  // Position attribute (location 0): 2 floats at offset 0
  gl.glVertexAttribPointer(0, 2, GL_FLOAT, 0, stride, 0);
  gl.glEnableVertexAttribArray(0);

  // Color attribute (location 1): 4 floats at offset 8
  gl.glVertexAttribPointer(1, 4, GL_FLOAT, 0, stride, 2 * 4);
  gl.glEnableVertexAttribArray(1);

  gl.glBindVertexArray(0);

  // Enable blending for transparent rects
  gl.glEnable(0x0be2); // GL_BLEND
  gl.glBlendFunc(0x0302, 0x0303); // GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA

  return {
    renderRects(rects, viewportWidth, viewportHeight) {
      if (rects.length === 0) return;

      const { data, vertexCount } = buildBatchVertices(rects, viewportWidth, viewportHeight);

      gl.glUseProgram(program);
      gl.glBindVertexArray(vao);
      gl.glBindBuffer(GL_ARRAY_BUFFER, vbo);
      gl.glBufferData(
        GL_ARRAY_BUFFER,
        data.byteLength,
        new Uint8Array(data.buffer),
        GL_STATIC_DRAW,
      );
      gl.glDrawArrays(GL_TRIANGLES, 0, vertexCount);
      gl.glBindVertexArray(0);
    },

    dispose() {
      // cleanup would delete program, vao, vbo
    },
  };
}

function compileShader(gl: GLBindings, type: number, source: string): number {
  const shader = gl.glCreateShader(type);

  // Create null-terminated source string
  const encoder = new TextEncoder();
  const sourceBytes = encoder.encode(`${source}\0`);

  // glShaderSource expects char** (pointer to array of string pointers).
  // 1. Get pointer to the source string bytes
  const sourcePtr = ptr(sourceBytes);
  // 2. Write that pointer value into a buffer (char**)
  const ptrArray = new BigUint64Array(1);
  ptrArray[0] = BigInt(sourcePtr);
  const ptrArrayBytes = new Uint8Array(ptrArray.buffer);

  gl.glShaderSource(shader, 1, ptrArrayBytes, null);
  gl.glCompileShader(shader);

  // Check compilation status
  const status = new Uint8Array(4);
  gl.glGetShaderiv(shader, 0x8b81 /* GL_COMPILE_STATUS */, status);
  const compiled = new DataView(status.buffer).getInt32(0, true);
  if (!compiled) {
    const logBuf = new Uint8Array(1024);
    gl.glGetShaderInfoLog(shader, 1024, null, logBuf);
    const msg = new TextDecoder().decode(logBuf).replace(/\0+$/, '');
    console.error(`Shader compilation failed:\n${msg}`);
  }

  return shader;
}
