/**
 * React Fast Refresh Runtime Bootstrap (vtz dev server)
 *
 * This script sets up the global `$RefreshReg$` and `$RefreshSig$` functions
 * that oxc_transformer's React Refresh plugin emits calls to. It also exposes
 * a `__vtz_react_refresh_perform()` helper that the HMR client calls after
 * re-evaluating a module to flush pending registrations.
 *
 * The actual react-refresh/runtime module is loaded as an ES module from
 * /@deps/react-refresh/runtime (served via the standard dep pre-bundling).
 * This bootstrap provides the global shims so that component registrations
 * work even before the module is loaded (they're buffered).
 */
(function () {
  'use strict';

  // Module-level buffer: stores registrations until react-refresh/runtime is ready
  var pendingRegs = [];
  var runtime = null;

  // The HMR client script (react-refresh-setup.js) will call this once
  // react-refresh/runtime has been imported
  globalThis.__vtz_react_refresh_init = function (refreshRuntime) {
    runtime = refreshRuntime;
    runtime.injectIntoGlobalHook(globalThis);
    // Flush any registrations that happened before the runtime loaded
    for (var i = 0; i < pendingRegs.length; i++) {
      var reg = pendingRegs[i];
      runtime.register(reg.type, reg.id);
    }
    pendingRegs = [];
  };

  // Global registration function — called by oxc React Refresh transform
  // Signature: $RefreshReg$(type, id)
  globalThis.$RefreshReg$ = function (type, id) {
    if (runtime) {
      runtime.register(type, id);
    } else {
      pendingRegs.push({ type: type, id: id });
    }
  };

  // Global signature function — called by oxc React Refresh transform
  // Signature: $RefreshSig$() returns a signature tracking function
  globalThis.$RefreshSig$ = function () {
    if (runtime) {
      return runtime.createSignatureFunctionForTransform();
    }
    // Before runtime loads, return a pass-through function
    return function (type) {
      return type;
    };
  };

  // Called by the HMR client after a module is re-evaluated.
  // Tells React to perform the refresh (re-render updated components).
  globalThis.__vtz_react_refresh_perform = function () {
    if (runtime && runtime.performReactRefresh) {
      runtime.performReactRefresh();
    }
  };

  // Tell the HMR client that this page uses React Refresh
  globalThis.__vtz_has_react_refresh = true;
})();
