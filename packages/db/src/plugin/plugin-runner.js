/**
 * Create a plugin runner that executes hooks across a set of plugins.
 *
 * @experimental
 */
export function createPluginRunner(plugins) {
  return {
    runBeforeQuery(context) {
      for (const plugin of plugins) {
        if (plugin.beforeQuery) {
          const result = plugin.beforeQuery(context);
          if (result !== undefined) {
            return result;
          }
        }
      }
      return undefined;
    },
    runAfterQuery(context, result) {
      let current = result;
      for (const plugin of plugins) {
        if (plugin.afterQuery) {
          const pluginResult = plugin.afterQuery(context, current);
          current = pluginResult !== undefined ? pluginResult : current;
        }
      }
      return current;
    },
  };
}
//# sourceMappingURL=plugin-runner.js.map
