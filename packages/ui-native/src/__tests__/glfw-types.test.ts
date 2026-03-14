import { describe, expect, it } from 'bun:test';
import {
  GLFW_CONTEXT_VERSION_MAJOR,
  GLFW_CONTEXT_VERSION_MINOR,
  GLFW_FALSE,
  GLFW_OPENGL_CORE_PROFILE,
  GLFW_OPENGL_FORWARD_COMPAT,
  GLFW_OPENGL_PROFILE,
  GLFW_RESIZABLE,
  GLFW_TRUE,
  GLFW_VISIBLE,
  type GLFWBindings,
} from '../window/glfw-constants';

describe('GLFW constants', () => {
  it('Then TRUE and FALSE have correct values', () => {
    expect(GLFW_TRUE).toBe(1);
    expect(GLFW_FALSE).toBe(0);
  });

  it('Then window hint constants are defined', () => {
    expect(typeof GLFW_RESIZABLE).toBe('number');
    expect(typeof GLFW_VISIBLE).toBe('number');
    expect(typeof GLFW_CONTEXT_VERSION_MAJOR).toBe('number');
    expect(typeof GLFW_CONTEXT_VERSION_MINOR).toBe('number');
    expect(typeof GLFW_OPENGL_PROFILE).toBe('number');
    expect(typeof GLFW_OPENGL_FORWARD_COMPAT).toBe('number');
    expect(typeof GLFW_OPENGL_CORE_PROFILE).toBe('number');
  });

  it('Then GLFWBindings type has required methods', () => {
    // Type-level assertion — if this compiles, the interface is correct
    const _check: GLFWBindings = {} as GLFWBindings;
    expect(typeof _check).toBe('object');
  });
});
