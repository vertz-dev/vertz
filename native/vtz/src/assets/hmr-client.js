/**
 * Vertz HMR Client Runtime
 *
 * Connects to the dev server's WebSocket HMR endpoint and handles:
 * - Module hot updates (dynamic re-import + Fast Refresh)
 * - CSS hot updates (swap <link> tags)
 * - Full page reloads (entry file changes)
 * - Connection status indicators
 * - Auto-reconnect with exponential backoff
 * - Rapid reconnect detection with "server down" message
 */
(function() {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────
  var WS_PATH = '/__vertz_hmr';
  var RECONNECT_BASE_MS = 100;
  var RECONNECT_MAX_MS = 5000;
  var TOAST_DURATION_MS = 1500;
  var RAPID_RECONNECT_WINDOW_MS = 30000;
  var RAPID_RECONNECT_LIMIT = 10;
  var SESSION_KEY = '__vertz_hmr_reconnects';

  // ── State ──────────────────────────────────────────────────────
  var ws = null;
  var reconnectAttempts = 0;
  var reconnectTimer = null;
  var statusDot = null;
  var toastEl = null;
  var toastTimer = null;

  // moduleUrl → HotContext. Keyed by normalized URL-relative pathname.
  var hotContexts = Object.create(null);

  // ── Hot Context API (import.meta.hot) ──────────────────────────

  /**
   * Normalize any module URL into a URL-relative pathname.
   * The compiler passes `import.meta.url` (a full http(s) URL in the browser).
   * The server broadcasts URL-relative paths (e.g. "/src/app.tsx").
   * This converts both into the same key form: the pathname, without query/hash.
   */
  function normalizeModuleUrl(raw) {
    if (typeof raw !== 'string') return '';
    if (raw.indexOf('://') !== -1) {
      try {
        return new URL(raw).pathname;
      } catch (_) {
        return raw;
      }
    }
    var q = raw.indexOf('?');
    if (q !== -1) raw = raw.slice(0, q);
    var h = raw.indexOf('#');
    if (h !== -1) raw = raw.slice(0, h);
    return raw;
  }

  /**
   * Create a per-module hot context. Stores dispose callbacks, event
   * listeners, persistent data, and the declined flag. Returned object
   * is the runtime shape of `import.meta.hot` (matches ImportMetaHot in
   * vertz/client type declarations).
   */
  function createHotContext(moduleUrl) {
    var disposeCallbacks = [];
    var listeners = Object.create(null);
    var declined = false;
    var data = {};

    var ctx = {
      accept: function(_depsOrCb, _cb) {
        // The vtz dev server self-accepts via the globalThis Fast Refresh
        // registry; per-module accept callbacks are not invoked. Kept as a
        // no-op so code written against the Vite/Bun HMR API still loads.
      },
      dispose: function(cb) {
        if (typeof cb === 'function') disposeCallbacks.push(cb);
      },
      data: data,
      invalidate: function(message) {
        var reason = '[vertz-hmr] Invalidated' + (message ? ': ' + message : '');
        console.log(reason, '(' + moduleUrl + ')');
        showToast('Invalidated — reloading');
        setTimeout(function() { location.reload(); }, 50);
      },
      decline: function() {
        declined = true;
      },
      on: function(event, cb) {
        if (typeof event !== 'string' || typeof cb !== 'function') return;
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
      },
      off: function(event, cb) {
        var subs = listeners[event];
        if (!subs) return;
        var filtered = [];
        for (var i = 0; i < subs.length; i++) {
          if (subs[i] !== cb) filtered.push(subs[i]);
        }
        listeners[event] = filtered;
      },
    };

    // Internal hooks used by the HMR transport. Prefixed with `_` so they are
    // visible as developer-facing API only if someone explicitly looks for
    // them; they are not part of ImportMetaHot.
    ctx._emit = function(event, payload) {
      var subs = listeners[event];
      if (!subs) return;
      for (var i = 0; i < subs.length; i++) {
        try { subs[i](payload); } catch (err) {
          console.error('[vertz-hmr] Listener for', event, 'threw:', err);
        }
      }
    };
    ctx._runDispose = function() {
      while (disposeCallbacks.length) {
        var cb = disposeCallbacks.shift();
        try { cb(data); } catch (err) {
          console.error('[vertz-hmr] dispose callback threw:', err);
        }
      }
    };
    ctx._isDeclined = function() { return declined; };

    return ctx;
  }

  function getHotContext(moduleUrl) {
    var key = normalizeModuleUrl(moduleUrl);
    if (!hotContexts[key]) hotContexts[key] = createHotContext(key);
    return hotContexts[key];
  }

  // Expose for compiler-rewritten `import.meta.hot` references.
  globalThis.__vtz_hot = getHotContext;

  // ── Reconnect Tracking ─────────────────────────────────────────

  function trackReconnect() {
    try {
      var data = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
      var now = Date.now();
      data.push(now);
      // Keep only entries within the window
      data = data.filter(function(t) { return now - t < RAPID_RECONNECT_WINDOW_MS; });
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
      return data.length;
    } catch (e) {
      return 0;
    }
  }

  function resetReconnectTracking() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
      // Ignore
    }
  }

  // ── Visual Feedback ────────────────────────────────────────────

  function createStatusDot() {
    if (statusDot) return;
    statusDot = document.createElement('div');
    statusDot.id = '__vertz_hmr_dot';
    statusDot.style.cssText = [
      'position:fixed',
      'bottom:8px',
      'left:8px',
      'width:8px',
      'height:8px',
      'border-radius:50%',
      'z-index:2147483647',
      'pointer-events:none',
      'transition:background-color 0.2s',
      'opacity:0.7',
    ].join(';');
    document.body.appendChild(statusDot);
  }

  function setStatus(color) {
    if (!statusDot) createStatusDot();
    var colors = {
      green: '#22c55e',
      yellow: '#eab308',
      red: '#ef4444',
    };
    statusDot.style.backgroundColor = colors[color] || colors.red;
  }

  function showToast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = '__vertz_hmr_toast';
      toastEl.style.cssText = [
        'position:fixed',
        'bottom:24px',
        'left:50%',
        'transform:translateX(-50%)',
        'padding:4px 12px',
        'border-radius:4px',
        'background:rgba(0,0,0,0.75)',
        'color:#fff',
        'font:12px/1.4 system-ui,sans-serif',
        'z-index:2147483647',
        'pointer-events:none',
        'transition:opacity 0.3s',
        'opacity:0',
      ].join(';');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.style.opacity = '1';

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() {
      if (toastEl) toastEl.style.opacity = '0';
    }, TOAST_DURATION_MS);
  }

  // ── Fast Refresh Integration ───────────────────────────────────

  function performFastRefresh(moduleId) {
    // Vertz-native Fast Refresh (Vertz framework)
    var fr = globalThis[Symbol.for('vertz:fast-refresh')];
    if (fr && typeof fr.__$refreshPerform === 'function') {
      try {
        fr.__$refreshPerform(moduleId);
      } catch (err) {
        console.error('[vertz-hmr] Fast Refresh failed for', moduleId, err);
      }
    }
  }

  // ── HMR Handlers ──────────────────────────────────────────────

  async function handleUpdate(data) {
    var start = performance.now();
    var modules = data.modules || [];
    var timestamp = data.timestamp || Date.now();
    var errors = [];

    // If any module in this batch has been marked declined by user code, fall
    // back to a full page reload — the module owner has opted out of HMR.
    for (var d = 0; d < modules.length; d++) {
      var declinedKey = normalizeModuleUrl(modules[d]);
      var declinedCtx = hotContexts[declinedKey];
      if (declinedCtx && declinedCtx._isDeclined()) {
        console.log('[vertz-hmr] Module declined HMR — full reload:', declinedKey);
        handleFullReload({ reason: 'module declined HMR: ' + declinedKey });
        return;
      }
    }

    for (var i = 0; i < modules.length; i++) {
      var mod = modules[i];
      var ctx = getHotContext(mod);
      ctx._emit('vertz:beforeUpdate', { module: normalizeModuleUrl(mod) });
      try {
        ctx._runDispose();
        // Dynamic re-import with cache-bust timestamp
        await import(mod + '?t=' + timestamp);
        // Trigger Fast Refresh for the updated module
        performFastRefresh(mod);
        ctx._emit('vertz:afterUpdate', { module: normalizeModuleUrl(mod) });
      } catch (err) {
        var errMsg = err.message || String(err);
        console.error('[vertz-hmr] Failed to import', mod, err);
        errors.push({ message: errMsg, file: mod });
        ctx._emit('vertz:error', { module: normalizeModuleUrl(mod), error: err });
      }
    }

    var elapsed = Math.round(performance.now() - start);
    var overlay = globalThis.__vertz_error_overlay;

    if (errors.length > 0) {
      // Show errors in overlay
      if (overlay && typeof overlay.showErrors === 'function') {
        overlay.showErrors({
          category: 'runtime',
          errors: errors,
        });
      }
      showToast('Update failed');
      console.error('[vertz-hmr] ' + errors.length + ' module(s) failed to update');
    } else {
      // Dismiss any previous import error overlay
      if (overlay && typeof overlay.dismiss === 'function') {
        overlay.dismiss();
      }
      showToast('Updated (' + elapsed + 'ms)');
      console.log('[vertz-hmr] Updated ' + modules.length + ' module(s) in ' + elapsed + 'ms');
    }
  }

  function handleCssUpdate(data) {
    var file = data.file;
    var timestamp = data.timestamp || Date.now();

    // Find and update <link> tags matching this CSS file
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    var updated = false;

    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var href = link.getAttribute('href') || '';
      // Strip query params for comparison
      var baseHref = href.split('?')[0];
      if (baseHref === file || baseHref.endsWith(file)) {
        link.setAttribute('href', file + '?t=' + timestamp);
        updated = true;
      }
    }

    if (!updated) {
      // CSS file not found as <link> — might be inline or a new file
      // Create a new link tag
      var newLink = document.createElement('link');
      newLink.rel = 'stylesheet';
      newLink.href = file + '?t=' + timestamp;
      document.head.appendChild(newLink);
    }

    showToast('CSS updated');
    console.log('[vertz-hmr] CSS updated:', file);
  }

  function handleFullReload(data) {
    showToast('Full reload');
    console.log('[vertz-hmr] Full reload:', data.reason);
    // Emit beforeFullReload on every known hot context so user code can
    // snapshot state or clean up before the page is destroyed.
    for (var key in hotContexts) {
      hotContexts[key]._emit('vertz:beforeFullReload', { reason: data.reason });
    }
    // Small delay to show the toast
    setTimeout(function() {
      location.reload();
    }, 100);
  }

  function handleNavigate(data) {
    var to = data.to;
    if (!to) return;
    console.log('[vertz-hmr] Navigate:', to);
    showToast('Navigating to ' + to);
    // Use history API + popstate to trigger client-side routing
    history.pushState(null, '', to);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  }

  // ── WebSocket Connection ───────────────────────────────────────

  function connect() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = protocol + '//' + location.host + WS_PATH;

    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.error('[vertz-hmr] WebSocket creation failed:', err);
      scheduleReconnect();
      return;
    }

    ws.onopen = function() {
      reconnectAttempts = 0;
      resetReconnectTracking();
      setStatus('green');
      console.log('[vertz-hmr] Connected');
    };

    ws.onmessage = function(event) {
      try {
        var data = JSON.parse(event.data);
        switch (data.type) {
          case 'connected':
            setStatus('green');
            break;
          case 'update':
            handleUpdate(data);
            break;
          case 'css-update':
            handleCssUpdate(data);
            break;
          case 'full-reload':
            handleFullReload(data);
            break;
          case 'navigate':
            handleNavigate(data);
            break;
          default:
            console.log('[vertz-hmr] Unknown message type:', data.type);
        }
      } catch (err) {
        console.error('[vertz-hmr] Failed to parse message:', err);
      }
    };

    ws.onclose = function() {
      setStatus('red');
      scheduleReconnect();
    };

    ws.onerror = function() {
      // onclose will fire after onerror, so just set status here
      setStatus('red');
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return; // Already scheduled

    setStatus('yellow');

    // Track rapid reconnects
    var count = trackReconnect();
    if (count >= RAPID_RECONNECT_LIMIT) {
      showToast('Server may be down. Check terminal.');
      console.warn('[vertz-hmr] Too many rapid reconnects (' + count + '). Server may be down.');
    }

    var delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts),
      RECONNECT_MAX_MS
    );
    reconnectAttempts++;

    console.log('[vertz-hmr] Reconnecting in ' + delay + 'ms (attempt ' + reconnectAttempts + ')');

    reconnectTimer = setTimeout(function() {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  // ── Initialize ────────────────────────────────────────────────

  // Wait for DOM to be ready before creating visual elements
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      createStatusDot();
      connect();
    });
  } else {
    createStatusDot();
    connect();
  }
})();
