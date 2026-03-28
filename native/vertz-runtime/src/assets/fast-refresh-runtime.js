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
 * Context scope helpers (pushScope, popScope, getContextScope, setContextScope,
 * etc.) are registered lazily by a companion module script that imports from
 * @vertz/ui/internals. Until registered, the wrapper code uses no-op defaults
 * (which is fine for initial render — providers manage context natively).
 * The helpers must be registered before the first HMR re-mount.
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

  // Helpers registered lazily from @vertz/ui/internals
  var helpers = {
    setContextScope: null,
    getContextScope: null,
    pushScope: null,
    popScope: null,
    startSignalCollection: null,
    stopSignalCollection: null,
    _tryOnCleanup: null,
    runCleanups: null,
  };

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
          // Restore context scope before calling the factory so useContext/useRouter work
          var prevScope = null;
          if (helpers.setContextScope && instance.contextScope) {
            prevScope = helpers.getContextScope ? helpers.getContextScope() : null;
            helpers.setContextScope(instance.contextScope);
          }

          var newElement = factory.apply(null, instance.args);

          // Restore previous scope
          if (helpers.setContextScope && prevScope !== null) {
            helpers.setContextScope(prevScope);
          }

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

  /**
   * Register helper functions from @vertz/ui/internals.
   * Called by a companion module script after @vertz/ui loads.
   */
  function registerHelpers(fns) {
    Object.assign(helpers, fns);
    // Also update the API object so newly-loaded modules get real implementations
    var api = globalThis[FR_KEY];
    if (api && fns.pushScope) api.pushScope = fns.pushScope;
    if (api && fns.popScope) api.popScope = fns.popScope;
    if (api && fns.getContextScope) api.getContextScope = fns.getContextScope;
    if (api && fns.setContextScope) api.setContextScope = fns.setContextScope;
    if (api && fns.startSignalCollection) api.startSignalCollection = fns.startSignalCollection;
    if (api && fns.stopSignalCollection) api.stopSignalCollection = fns.stopSignalCollection;
    if (api && fns._tryOnCleanup) api._tryOnCleanup = fns._tryOnCleanup;
    if (api && fns.runCleanups) api.runCleanups = fns.runCleanups;
  }

  // Expose on globalThis for compiler-injected code
  globalThis[FR_KEY] = {
    __$refreshReg: __$refreshReg,
    __$refreshTrack: __$refreshTrack,
    __$refreshPerform: __$refreshPerform,
    registerHelpers: registerHelpers,
  };
})();
