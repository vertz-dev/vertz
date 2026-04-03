/**
 * Vertz Fast Refresh Runtime (Native Dev Server)
 *
 * Component registry and DOM replacement for the native Rust dev server.
 * This provides the same globalThis API that the compiler-injected
 * code expects:
 *
 * - __$refreshReg(moduleId, name, factory, hash) — register a component factory
 * - __$refreshTrack(moduleId, name, element, args, cleanups, ctx, signals) — track instance
 * - __$refreshPerform(moduleId) — re-mount all instances in a module
 *
 * Signal state is preserved across HMR cycles using name-based (_hmrKey)
 * and position-based matching. DOM state (form values, focus, scroll)
 * is captured before replacement and restored to the new tree.
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

  /**
   * During __$refreshPerform, the factory wrapper's signal collection intercepts
   * all signals before __$refreshPerform's own collector can see them (stack-based
   * nesting). The wrapper passes collected signals to __$refreshTrack, which
   * normally discards them during refresh. Instead, we stash them here so
   * __$refreshPerform can retrieve them.
   */
  var refreshSignals = null;

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

  // ── DOM State Preservation ──────────────────────────────────────

  function formFieldKey(el, index) {
    var name = el.getAttribute('name');
    if (name) return 'name:' + name;
    var id = el.getAttribute('id');
    if (id) return 'id:' + id;
    var placeholder = el.getAttribute('placeholder');
    if (placeholder) return 'placeholder:' + placeholder;
    return 'pos:' + el.tagName.toLowerCase() + ':' + index;
  }

  function captureFormFields(element) {
    var fields = new Map();
    var inputs = element.querySelectorAll('input, textarea, select');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var type = el.type || '';
      if (type === 'file') continue;
      var key = formFieldKey(el, i);
      fields.set(key, {
        value: el.value || '',
        checked: el.checked || false,
        selectedIndex: el.selectedIndex != null ? el.selectedIndex : -1,
        type: type,
      });
    }
    return fields;
  }

  function captureFocus(element) {
    var active = element.ownerDocument && element.ownerDocument.activeElement;
    if (!active) return null;
    if (!element.contains(active)) return null;
    var name = active.getAttribute('name');
    var id = active.getAttribute('id');
    var matchKey = name || id;
    if (!matchKey) return null;
    var selectionStart = -1;
    var selectionEnd = -1;
    if ('selectionStart' in active && active.selectionStart != null) {
      selectionStart = active.selectionStart;
      selectionEnd = active.selectionEnd != null ? active.selectionEnd : selectionStart;
    }
    return {
      matchKey: matchKey,
      matchBy: name ? 'name' : 'id',
      selectionStart: selectionStart,
      selectionEnd: selectionEnd,
    };
  }

  function walkElements(root, callback) {
    callback(root);
    var children = root.children;
    for (var i = 0; i < children.length; i++) {
      if (children[i]) walkElements(children[i], callback);
    }
  }

  function captureScrollPositions(element) {
    var positions = [];
    walkElements(element, function(el) {
      if (el.scrollTop === 0 && el.scrollLeft === 0) return;
      var id = el.getAttribute('id');
      if (id) {
        positions.push({
          matchKey: id, matchBy: 'id',
          scrollTop: el.scrollTop, scrollLeft: el.scrollLeft,
        });
        return;
      }
      if (el.className) {
        var selector = el.tagName.toLowerCase() + '.' + el.className;
        positions.push({
          matchKey: selector, matchBy: 'selector',
          scrollTop: el.scrollTop, scrollLeft: el.scrollLeft,
        });
      }
    });
    return positions;
  }

  function captureDOMState(element) {
    return {
      formFields: captureFormFields(element),
      focus: captureFocus(element),
      scrollPositions: captureScrollPositions(element),
    };
  }

  function restoreFormFields(element, fields) {
    if (fields.size === 0) return;
    var inputs = element.querySelectorAll('input, textarea, select');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var key = formFieldKey(el, i);
      var saved = fields.get(key);
      if (!saved) continue;
      if (saved.type === 'file') continue;
      if (el.tagName === 'SELECT') {
        el.selectedIndex = saved.selectedIndex;
      } else if (saved.type === 'checkbox' || saved.type === 'radio') {
        el.checked = saved.checked;
      } else {
        el.value = saved.value;
      }
    }
  }

  function restoreFocus(element, focus) {
    if (!focus) return;
    var target = focus.matchBy === 'name'
      ? element.querySelector('[name="' + focus.matchKey + '"]')
      : element.querySelector('#' + focus.matchKey);
    if (!target) return;
    if (target.disabled) return;
    if (typeof target.focus === 'function') target.focus();
    if (focus.selectionStart >= 0 && typeof target.setSelectionRange === 'function') {
      try {
        target.setSelectionRange(focus.selectionStart, focus.selectionEnd);
      } catch (_) { /* Some input types don't support setSelectionRange */ }
    }
  }

  function restoreScrollPositions(element, positions) {
    for (var i = 0; i < positions.length; i++) {
      var pos = positions[i];
      var target = pos.matchBy === 'id'
        ? element.querySelector('#' + pos.matchKey)
        : element.querySelector(pos.matchKey);
      if (!target) continue;
      target.scrollTop = pos.scrollTop;
      target.scrollLeft = pos.scrollLeft;
    }
  }

  function restoreDOMState(newElement, snapshot) {
    restoreFormFields(newElement, snapshot.formFields);
    restoreFocus(newElement, snapshot.focus);
    restoreScrollPositions(newElement, snapshot.scrollPositions);
  }

  // ── Registry Helpers ────────────────────────────────────────────

  function getModule(moduleId) {
    var mod = registry.get(moduleId);
    if (!mod) {
      mod = new Map();
      registry.set(moduleId, mod);
    }
    return mod;
  }

  function peekSignal(sig) {
    return sig.peek ? sig.peek() : sig.value;
  }

  // ── Public API ──────────────────────────────────────────────────

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
    // During __$refreshPerform, the factory wrapper calls __$refreshTrack.
    // Stash the signals so __$refreshPerform can retrieve them (the wrapper's
    // signal collection intercepts them before __$refreshPerform's collector).
    if (performingRefresh) {
      refreshSignals = signals || [];
      return element;
    }

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

        // Skip instances no longer in the DOM
        if (!parent) continue;

        try {
          var oldSignals = instance.signals || [];

          // 1. Create new disposal scope and restore context BEFORE factory call
          var newCleanups = helpers.pushScope ? helpers.pushScope() : [];
          var prevScope = null;
          if (helpers.setContextScope && instance.contextScope) {
            prevScope = helpers.getContextScope ? helpers.getContextScope() : null;
            helpers.setContextScope(instance.contextScope);
          }

          var newElement;
          var newSignals;
          var newContextScope;
          try {
            // 2. Re-execute the factory. Signal collection is handled by the
            //    factory wrapper (which calls startSignalCollection/stopSignalCollection
            //    internally). The wrapper passes collected signals to __$refreshTrack,
            //    which stashes them in `refreshSignals` during refresh mode.
            refreshSignals = null;
            newElement = factory.apply(null, instance.args);
            newSignals = refreshSignals || [];
            refreshSignals = null;
            // Capture the context scope established during factory execution
            newContextScope = helpers.getContextScope ? helpers.getContextScope() : null;
          } catch (err) {
            // Factory failed — run partial cleanups, keep old instance
            refreshSignals = null;
            if (helpers.runCleanups) helpers.runCleanups(newCleanups);
            if (helpers.popScope) helpers.popScope();
            if (helpers.setContextScope && prevScope !== null) helpers.setContextScope(prevScope);
            console.error('[vertz-hmr] Error re-mounting ' + name + ':', err);
            updatedInstances.push(instance);
            continue;
          }

          // 3. Post-factory: signal restoration, cleanup, scope management.
          //    Wrapped in try/finally to guarantee context scope restoration.
          try {
            // Restore signal values: named signals by _hmrKey, unnamed by position
            if (oldSignals.length > 0) {
              var namedSaved = new Map();
              var unnamedSaved = [];
              for (var s = 0; s < oldSignals.length; s++) {
                var sig = oldSignals[s];
                if (sig._hmrKey) {
                  namedSaved.set(sig._hmrKey, peekSignal(sig));
                } else {
                  unnamedSaved.push(peekSignal(sig));
                }
              }

              var unnamedIdx = 0;
              for (var s = 0; s < newSignals.length; s++) {
                var nsig = newSignals[s];
                if (nsig._hmrKey && namedSaved.has(nsig._hmrKey)) {
                  nsig.value = namedSaved.get(nsig._hmrKey);
                } else if (!nsig._hmrKey && unnamedIdx < unnamedSaved.length) {
                  nsig.value = unnamedSaved[unnamedIdx++];
                }
              }
            }

            if (helpers.popScope) helpers.popScope();

            // Run old cleanups
            if (helpers.runCleanups && instance.cleanups) {
              helpers.runCleanups(instance.cleanups);
            } else if (instance.cleanups) {
              for (var j = instance.cleanups.length - 1; j >= 0; j--) {
                try { instance.cleanups[j](); } catch(e) {}
              }
            }

            // Forward new cleanups to parent scope
            if (newCleanups && newCleanups.length > 0 && helpers._tryOnCleanup && helpers.runCleanups) {
              var nC = newCleanups;
              var rc = helpers.runCleanups;
              helpers._tryOnCleanup(function() { rc(nC); });
            }
          } finally {
            if (helpers.setContextScope && prevScope !== null) {
              helpers.setContextScope(prevScope);
            }
          }

          // 4. Capture DOM state, replace node, restore state
          var domSnapshot = null;
          try { domSnapshot = captureDOMState(element); } catch (_) {}

          parent.replaceChild(newElement, element);

          if (domSnapshot) {
            try {
              restoreDOMState(newElement, domSnapshot);
            } catch (_) {
              console.warn('[vertz-hmr] Failed to restore DOM state');
            }
          }

          // 5. Track new instance with new context and signals
          updatedInstances.push({
            element: newElement,
            args: instance.args,
            cleanups: newCleanups || [],
            contextScope: newContextScope || instance.contextScope,
            signals: newSignals,
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
