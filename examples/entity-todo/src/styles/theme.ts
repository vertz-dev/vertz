/**
 * Theme definition for the Entity Todo demo.
 */

import { defineTheme } from '@vertz/ui';

export const todoTheme = defineTheme({
  colors: {
    primary: {
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
    },
    success: {
      500: '#22c55e',
      700: '#15803d',
    },
    danger: {
      500: '#ef4444',
      700: '#b91c1c',
    },
    gray: {
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      700: '#374151',
      800: '#1f2937',
      900: '#111827',
    },
    background: {
      DEFAULT: '#ffffff',
      _dark: '#111827',
    },
    foreground: {
      DEFAULT: '#111827',
      _dark: '#f9fafb',
    },
    muted: {
      DEFAULT: '#6b7280',
      _dark: '#9ca3af',
    },
    surface: {
      DEFAULT: '#f9fafb',
      _dark: '#1f2937',
    },
    border: {
      DEFAULT: '#e5e7eb',
      _dark: '#374151',
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
});
