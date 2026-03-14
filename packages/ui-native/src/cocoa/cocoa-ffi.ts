/**
 * Cocoa FFI bindings.
 *
 * Compiles the Objective-C bridge at runtime via clang,
 * then loads the dylib with dlopen and exposes typed wrappers
 * for native macOS controls.
 */

import { CString, dlopen, FFIType, type Pointer } from 'bun:ffi';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const { f64, i32, ptr, void: ffiVoid } = FFIType;

export interface CocoaBindings {
  createTextField(x: number, y: number, w: number, h: number): Pointer;
  addToWindow(nsWindow: Pointer, view: Pointer): void;
  removeFromWindow(view: Pointer): void;
  getText(field: Pointer): string;
  setText(field: Pointer, text: string): void;
  setPlaceholder(field: Pointer, text: string): void;
  setFrame(view: Pointer, x: number, y: number, w: number, h: number): void;
  setBgColor(field: Pointer, r: number, g: number, b: number, a: number): void;
  setTextColor(field: Pointer, r: number, g: number, b: number, a: number): void;
  setFontSize(field: Pointer, size: number): void;
  setBordered(field: Pointer, bordered: boolean): void;
  setBorderColor(field: Pointer, r: number, g: number, b: number, a: number): void;
  setCornerRadius(field: Pointer, radius: number): void;
  focus(field: Pointer): void;
  isFocused(field: Pointer): boolean;
  release(obj: Pointer): void;
  contentHeight(nsWindow: Pointer): number;
}

function toCString(str: string): Uint8Array {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const buf = new Uint8Array(bytes.length + 1);
  buf.set(bytes);
  buf[bytes.length] = 0;
  return buf;
}

const DYLIB_PATH = '/tmp/vt-cocoa-bridge.dylib';

function compileAndLoad() {
  const sourceFile = join(import.meta.dirname, 'cocoa-bridge.m');

  // Recompile if dylib is missing or source is newer
  let needsCompile = !existsSync(DYLIB_PATH);
  if (!needsCompile) {
    const srcStat = Bun.file(sourceFile);
    const dylibStat = Bun.file(DYLIB_PATH);
    needsCompile = srcStat.lastModified > dylibStat.lastModified;
  }

  if (needsCompile) {
    const result = Bun.spawnSync([
      'clang',
      '-shared',
      '-o',
      DYLIB_PATH,
      '-framework',
      'Cocoa',
      '-fPIC',
      sourceFile,
    ]);
    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString();
      throw new Error(`Failed to compile Cocoa bridge: ${stderr}`);
    }
  }

  const lib = dlopen(DYLIB_PATH, {
    vt_cocoa_create_text_field: { args: [f64, f64, f64, f64], returns: ptr },
    vt_cocoa_add_to_window: { args: [ptr, ptr], returns: ffiVoid },
    vt_cocoa_remove_from_window: { args: [ptr], returns: ffiVoid },
    vt_cocoa_get_text: { args: [ptr], returns: ptr },
    vt_cocoa_set_text: { args: [ptr, ptr], returns: ffiVoid },
    vt_cocoa_set_placeholder: { args: [ptr, ptr], returns: ffiVoid },
    vt_cocoa_set_frame: { args: [ptr, f64, f64, f64, f64], returns: ffiVoid },
    vt_cocoa_set_bg_color: { args: [ptr, f64, f64, f64, f64], returns: ffiVoid },
    vt_cocoa_set_text_color: { args: [ptr, f64, f64, f64, f64], returns: ffiVoid },
    vt_cocoa_set_font_size: { args: [ptr, f64], returns: ffiVoid },
    vt_cocoa_set_bordered: { args: [ptr, i32], returns: ffiVoid },
    vt_cocoa_set_border_color: { args: [ptr, f64, f64, f64, f64], returns: ffiVoid },
    vt_cocoa_set_corner_radius: { args: [ptr, f64], returns: ffiVoid },
    vt_cocoa_focus: { args: [ptr], returns: ffiVoid },
    vt_cocoa_is_focused: { args: [ptr], returns: i32 },
    vt_cocoa_release: { args: [ptr], returns: ffiVoid },
    vt_cocoa_content_height: { args: [ptr], returns: f64 },
  });

  return lib.symbols;
}

let bindings: ReturnType<typeof compileAndLoad> | null = null;

export function loadCocoa(): CocoaBindings {
  if (!bindings) {
    bindings = compileAndLoad();
  }
  const sym = bindings;

  return {
    createTextField(x: number, y: number, w: number, h: number) {
      return sym.vt_cocoa_create_text_field(x, y, w, h) as Pointer;
    },

    addToWindow(nsWindow: Pointer, view: Pointer) {
      sym.vt_cocoa_add_to_window(nsWindow, view);
    },

    removeFromWindow(view: Pointer) {
      sym.vt_cocoa_remove_from_window(view);
    },

    getText(field: Pointer): string {
      const cstr = sym.vt_cocoa_get_text(field) as Pointer;
      if (!cstr) return '';
      return new CString(cstr).toString();
    },

    setText(field: Pointer, text: string) {
      sym.vt_cocoa_set_text(field, toCString(text));
    },

    setPlaceholder(field: Pointer, text: string) {
      sym.vt_cocoa_set_placeholder(field, toCString(text));
    },

    setFrame(view: Pointer, x: number, y: number, w: number, h: number) {
      sym.vt_cocoa_set_frame(view, x, y, w, h);
    },

    setBgColor(field: Pointer, r: number, g: number, b: number, a: number) {
      sym.vt_cocoa_set_bg_color(field, r, g, b, a);
    },

    setTextColor(field: Pointer, r: number, g: number, b: number, a: number) {
      sym.vt_cocoa_set_text_color(field, r, g, b, a);
    },

    setFontSize(field: Pointer, size: number) {
      sym.vt_cocoa_set_font_size(field, size);
    },

    setBordered(field: Pointer, bordered: boolean) {
      sym.vt_cocoa_set_bordered(field, bordered ? 1 : 0);
    },

    setBorderColor(field: Pointer, r: number, g: number, b: number, a: number) {
      sym.vt_cocoa_set_border_color(field, r, g, b, a);
    },

    setCornerRadius(field: Pointer, radius: number) {
      sym.vt_cocoa_set_corner_radius(field, radius);
    },

    focus(field: Pointer) {
      sym.vt_cocoa_focus(field);
    },

    isFocused(field: Pointer): boolean {
      return (sym.vt_cocoa_is_focused(field) as number) !== 0;
    },

    release(obj: Pointer) {
      sym.vt_cocoa_release(obj);
    },

    contentHeight(nsWindow: Pointer): number {
      return sym.vt_cocoa_content_height(nsWindow) as number;
    },
  };
}
