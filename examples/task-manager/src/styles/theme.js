/**
 * Theme definition for the Task Manager app.
 *
 * Uses defineTheme() to create light/dark themes with contextual tokens.
 * Colors swap automatically based on the data-theme attribute set by ThemeProvider.
 */
import { defineTheme } from '@vertz/ui';
export const taskManagerTheme = defineTheme({
    colors: {
        // Raw tokens — fixed values available in both themes
        primary: {
            50: '#eff6ff',
            100: '#dbeafe',
            200: '#bfdbfe',
            500: '#3b82f6',
            600: '#2563eb',
            700: '#1d4ed8',
            900: '#1e3a5f',
        },
        success: {
            100: '#dcfce7',
            500: '#22c55e',
            700: '#15803d',
        },
        warning: {
            100: '#fef9c3',
            500: '#eab308',
            700: '#a16207',
        },
        danger: {
            100: '#fee2e2',
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
            600: '#4b5563',
            700: '#374151',
            800: '#1f2937',
            900: '#111827',
        },
        // Contextual tokens — swap between light and dark
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
        '2xl': '3rem',
    },
});
//# sourceMappingURL=theme.js.map