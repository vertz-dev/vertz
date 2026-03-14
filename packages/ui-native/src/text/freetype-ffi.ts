/**
 * FreeType FFI bindings.
 *
 * Uses Bun's cc() to compile the C bridge at runtime,
 * then exposes typed wrappers for font loading, glyph rendering,
 * and text measurement.
 */

import { cc, FFIType, type Pointer } from 'bun:ffi';
import { join } from 'node:path';

const { i32, ptr, u32, void: ffiVoid } = FFIType;

export interface GlyphMetrics {
  width: number;
  height: number;
  bearingX: number;
  bearingY: number;
  advance: number;
  pitch: number;
  buffer: Pointer; // pointer to bitmap data
}

export interface FreetypeBindings {
  init(): number;
  loadFont(path: string, pixelSize: number): Pointer | null;
  freeFont(face: Pointer): void;
  lineHeight(face: Pointer): number;
  ascender(face: Pointer): number;
  renderGlyph(face: Pointer, charCode: number): GlyphMetrics | null;
  measureText(face: Pointer, text: string): number;
  shutdown(): void;
}

function findFreetypeInclude(): string {
  const candidates = [
    '/opt/homebrew/include/freetype2',
    '/usr/local/include/freetype2',
    '/usr/include/freetype2',
  ];
  for (const p of candidates) {
    try {
      Bun.file(join(p, 'ft2build.h')).size;
      return p;
    } catch {}
  }
  throw new Error('Could not find FreeType headers. Install with: brew install freetype');
}

function findFreetypeLib(): string {
  const candidates =
    process.platform === 'darwin'
      ? ['/opt/homebrew/lib', '/usr/local/lib']
      : ['/usr/lib/x86_64-linux-gnu', '/usr/lib', '/usr/lib64', '/usr/local/lib'];
  for (const p of candidates) {
    try {
      Bun.file(join(p, 'libfreetype.dylib')).size;
      return p;
    } catch {}
    try {
      Bun.file(join(p, 'libfreetype.so')).size;
      return p;
    } catch {}
  }
  throw new Error('Could not find FreeType library. Install with: brew install freetype');
}

let bindings: ReturnType<typeof compileBindings> | null = null;

function compileBindings() {
  const includeDir = findFreetypeInclude();
  const libDir = findFreetypeLib();
  const sourceFile = join(import.meta.dirname, 'text-bridge.c');

  const { symbols } = cc({
    source: sourceFile,
    include: [includeDir],
    library: ['freetype'],
    flags: [`-L${libDir}`],
    symbols: {
      vt_ft_init: { returns: i32 },
      vt_ft_load_font: { args: [ptr, i32], returns: ptr },
      vt_ft_free_font: { args: [ptr], returns: ffiVoid },
      vt_ft_line_height: { args: [ptr], returns: i32 },
      vt_ft_ascender: { args: [ptr], returns: i32 },
      vt_ft_render_glyph: {
        args: [ptr, u32, ptr, ptr, ptr, ptr, ptr, ptr],
        returns: ptr,
      },
      vt_ft_measure_text: { args: [ptr, ptr], returns: i32 },
      vt_ft_shutdown: { returns: ffiVoid },
    },
  });

  return symbols;
}

function toCString(str: string): Uint8Array {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const buf = new Uint8Array(bytes.length + 1);
  buf.set(bytes);
  buf[bytes.length] = 0;
  return buf;
}

export function loadFreetype(): FreetypeBindings {
  if (!bindings) {
    bindings = compileBindings();
  }
  const sym = bindings;

  // Reusable buffers for glyph metric output params (6 int32 values)
  const metricsBuf = new Int32Array(6);
  const metricsBytes = new Uint8Array(metricsBuf.buffer);

  return {
    init() {
      return sym.vt_ft_init() as number;
    },

    loadFont(path: string, pixelSize: number) {
      const pathBuf = toCString(path);
      return sym.vt_ft_load_font(pathBuf, pixelSize) as Pointer | null;
    },

    freeFont(face: Pointer) {
      sym.vt_ft_free_font(face);
    },

    lineHeight(face: Pointer) {
      return sym.vt_ft_line_height(face) as number;
    },

    ascender(face: Pointer) {
      return sym.vt_ft_ascender(face) as number;
    },

    renderGlyph(face: Pointer, charCode: number): GlyphMetrics | null {
      const widthBuf = metricsBytes.subarray(0, 4);
      const heightBuf = metricsBytes.subarray(4, 8);
      const bearingXBuf = metricsBytes.subarray(8, 12);
      const bearingYBuf = metricsBytes.subarray(12, 16);
      const advanceBuf = metricsBytes.subarray(16, 20);
      const pitchBuf = metricsBytes.subarray(20, 24);

      const bufferPtr = sym.vt_ft_render_glyph(
        face,
        charCode,
        widthBuf,
        heightBuf,
        bearingXBuf,
        bearingYBuf,
        advanceBuf,
        pitchBuf,
      ) as Pointer | null;

      if (!bufferPtr) return null;

      const view = new DataView(metricsBuf.buffer);
      return {
        width: view.getInt32(0, true),
        height: view.getInt32(4, true),
        bearingX: view.getInt32(8, true),
        bearingY: view.getInt32(12, true),
        advance: view.getInt32(16, true),
        pitch: view.getInt32(20, true),
        buffer: bufferPtr,
      };
    },

    measureText(face: Pointer, text: string) {
      const textBuf = toCString(text);
      return sym.vt_ft_measure_text(face, textBuf) as number;
    },

    shutdown() {
      sym.vt_ft_shutdown();
    },
  };
}
