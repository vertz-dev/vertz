/**
 * Client-side entry point for Entity Todo.
 *
 * For SSR mode:
 * - The server renders the full HTML page
 * - On client load, we mount() the app which replaces the SSR content
 * - This is the simplest approach that works for any SSR content
 *
 * For per-component hydration (advanced):
 * - Would need to register components in a registry
 * - Use hydrate(registry) to hydrate interactive components
 * - This requires build-time code generation to populate the registry
 */

import { mount } from '@vertz/ui';
import { App } from './app';

mount(App, '#app', { hydration: 'tolerant' });
