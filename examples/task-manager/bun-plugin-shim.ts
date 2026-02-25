/**
 * Thin shim that wraps @vertz/ui-server/bun-plugin for bunfig.toml consumption.
 *
 * bunfig.toml `[serve.static] plugins` requires a default export of type BunPlugin.
 * The @vertz/ui-server/bun-plugin package exports a factory function (createVertzBunPlugin)
 * as a named export — this shim bridges the two.
 */
import { createVertzBunPlugin } from '@vertz/ui-server/bun-plugin';

const { plugin } = createVertzBunPlugin();

export default plugin;
