/**
 * CSS and HTML sanitization utilities for theme and font compilation.
 *
 * These functions prevent injection attacks when interpolating user-provided
 * values into CSS rules or HTML attributes.
 */

/**
 * Sanitize a CSS value to prevent injection attacks.
 * Strips characters and patterns that could break out of a CSS property value.
 */
export function sanitizeCssValue(value: string): string {
  return value
    .replace(/[;{}<>']/g, '')
    .replace(/url\s*\(/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/@import/gi, '');
}

/**
 * Escape a string for safe use in an HTML attribute value (double-quoted).
 * Prevents attribute breakout and HTML injection.
 */
export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}
