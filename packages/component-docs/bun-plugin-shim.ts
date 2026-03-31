/**
 * Thin shim that wraps @vertz/ui-server/bun-plugin for bunfig.toml consumption.
 */
import { createVertzBunPlugin } from '@vertz/ui-server/bun-plugin';

const { plugin } = createVertzBunPlugin();

export default plugin;
