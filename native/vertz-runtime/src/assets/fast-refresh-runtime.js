/**
 * Vertz Fast Refresh Runtime (Native Dev Server)
 *
 * Minimal Fast Refresh registry for the native Rust dev server.
 * This provides the same globalThis API that the compiler-injected
 * code expects:
 *
 * - __$refreshReg(moduleId, name, factory, hash) — register a component factory
 * - __$refreshTrack(moduleId, name, element, args, cleanups, ctx, signals) — track instance
 * - __$refreshPerform(moduleId) — re-mount all instances in a module
 *
 * The native compiler (vertz-compiler-core) emits Fast Refresh registration
 * code when `fast_refresh: true`. This runtime makes those calls work.
 *
 * NOTE: This is a simplified version for the native dev server. The full
 * Bun-based runtime (fast-refresh-runtime.ts) has deeper integration with
 * @vertz/ui/internals for signal preservation and context scopes.
 */
(function() {
  'use strict';

  var FR_KEY = Symbol.for('vertz:fast-refresh');
  var REGISTRY_KEY = Symbol.for('vertz:fast-refresh:registry');
  var DIRTY_KEY = Symbol.for('vertz:fast-refresh:dirty');

  // Persist across HMR re-evaluations via globalThis
  var registry = globalThis[REGISTRY_KEY] || (globalThis[REGISTRY_KEY] = new Map());
  var dirtyModules = globalThis[DIRTY_KEY] || (globalThis[DIRTY_KEY] = new Set());

  var performingRefresh = false;

  function getModule(moduleId) {
    var mod = registry.get(moduleId);
    if (!mod) {
      mod = new Map();
      registry.set(moduleId, mod);
    }
    return mod;
  }

  function __$refreshReg(moduleId, name, factory, hash) {
    var mod = getModule(moduleId);
    var existing = mod.get(name);
    if (existing) {
      if (hash && existing.hash === hash) return;
      existing.factory = factory;
      existing.hash = hash;
      existing.dirty = true;
      dirtyModules.add(moduleId);
    } else {
      mod.set(name, { factory: factory, instances: [], hash: hash, dirty: false });
    }
  }

  function __$refreshTrack(moduleId, name, element, args, cleanups, contextScope, signals) {
    if (performingRefresh) return element;

    var mod = registry.get(moduleId);
    if (!mod) return element;

    var record = mod.get(name);
    if (!record) return element;

    record.instances.push({
      element: element,
      args: args || [],
      cleanups: cleanups || [],
      contextScope: contextScope || null,
      signals: signals || [],
    });

    return element;
  }

  function __$refreshPerform(moduleId) {
    if (!dirtyModules.has(moduleId)) return;
    dirtyModules.delete(moduleId);

    var mod = registry.get(moduleId);
    if (!mod) return;

    performingRefresh = true;

    mod.forEach(function(record, name) {
      if (!record.dirty) return;
      record.dirty = false;

      var factory = record.factory;
      var instances = record.instances;
      var updatedInstances = [];

      for (var i = 0; i < instances.length; i++) {
        var instance = instances[i];
        var element = instance.element;
        var parent = element.parentNode;

        if (!parent) continue;

        try {
          var newElement = factory.apply(null, instance.args);

          // Run old cleanups
          if (instance.cleanups) {
            for (var j = instance.cleanups.length - 1; j >= 0; j--) {
              try { instance.cleanups[j](); } catch(e) {}
            }
          }

          parent.replaceChild(newElement, element);

          updatedInstances.push({
            element: newElement,
            args: instance.args,
            cleanups: [],
            contextScope: instance.contextScope,
            signals: [],
          });
        } catch (err) {
          console.error('[vertz-hmr] Error re-mounting ' + name + ':', err);
          updatedInstances.push(instance);
        }
      }

      record.instances = updatedInstances;
    });

    performingRefresh = false;
    console.log('[vertz-hmr] Hot updated: ' + moduleId);
  }

  // Expose on globalThis for compiler-injected code
  globalThis[FR_KEY] = {
    __$refreshReg: __$refreshReg,
    __$refreshTrack: __$refreshTrack,
    __$refreshPerform: __$refreshPerform,
  };
})();
