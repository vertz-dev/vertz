/**
 * Vertz Error Overlay
 *
 * Connects to /__vertz_errors WebSocket and displays a persistent error bar
 * at the bottom center of the page. Non-dismissable by the user — only
 * auto-clears when the error is fixed (successful recompile or HMR update).
 */
(function() {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────
  var WS_PATH = '/__vertz_errors';
  var RECONNECT_BASE_MS = 100;
  var RECONNECT_MAX_MS = 5000;
  var RAPID_RECONNECT_WINDOW_MS = 30000;
  var RAPID_RECONNECT_LIMIT = 10;

  // ── State ──────────────────────────────────────────────────────
  var ws = null;
  var reconnectAttempts = 0;
  var reconnectTimer = null;
  var barEl = null;
  var rapidReconnects = [];
  var currentCategory = null;

  // ── Editor Detection ───────────────────────────────────────────

  function getEditorScheme() {
    var meta = document.querySelector('meta[name="vertz-editor"]');
    if (meta) return meta.getAttribute('content');
    return 'vscode';
  }

  function resolveFilePath(file) {
    if (!file) return file;
    // Already absolute
    if (file.charAt(0) === '/') return file;
    // Resolve relative paths using the project root injected by the HTML shell.
    var rootMeta = document.querySelector('meta[name="vertz-root"]');
    if (rootMeta) {
      var root = rootMeta.getAttribute('content') || '';
      // Ensure single separator between root and relative path.
      if (root.charAt(root.length - 1) === '/') return root + file;
      return root + '/' + file;
    }
    return file;
  }

  function editorUri(file, line, column) {
    var scheme = getEditorScheme();
    var lineNum = line || 1;
    var colNum = column || 1;
    var absFile = resolveFilePath(file);

    switch (scheme) {
      case 'cursor':
        return 'cursor://file' + absFile + ':' + lineNum + ':' + colNum;
      case 'webstorm':
        return 'webstorm://open?file=' + encodeURIComponent(absFile) + '&line=' + lineNum + '&column=' + colNum;
      case 'zed':
        return 'zed://open?path=' + encodeURIComponent(absFile) + '&line=' + lineNum + '&column=' + colNum;
      case 'vscode':
      default:
        return 'vscode://file' + absFile + ':' + lineNum + ':' + colNum;
    }
  }

  // ── Error Bar ───────────────────────────────────────────────────

  function createBar() {
    if (barEl) return barEl;

    barEl = document.createElement('div');
    barEl.id = '__vertz_error_overlay';
    barEl.style.cssText = [
      'position:fixed',
      'bottom:16px',
      'left:50%',
      'transform:translateX(-50%) translateY(20px)',
      'z-index:2147483646',
      'max-width:720px',
      'width:calc(100vw - 32px)',
      'background:#18181b',
      'border:1px solid #3f3f46',
      'border-radius:10px',
      'box-shadow:0 8px 32px rgba(0,0,0,0.4)',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
      'font-size:13px',
      'color:#e4e4e7',
      'opacity:0',
      'transition:opacity 0.15s,transform 0.2s',
      'pointer-events:auto',
      'overflow:hidden',
    ].join(';');

    document.body.appendChild(barEl);

    // Slide up + fade in
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        if (barEl) {
          barEl.style.opacity = '1';
          barEl.style.transform = 'translateX(-50%) translateY(0)';
        }
      });
    });

    return barEl;
  }

  function removeBar() {
    if (!barEl) return;
    barEl.style.opacity = '0';
    barEl.style.transform = 'translateX(-50%) translateY(20px)';
    var el = barEl;
    barEl = null;
    currentCategory = null;
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 200);
  }

  // ── Rendering ───────────────────────────────────────────────────

  var categoryColors = {
    build: '#ef4444',
    resolve: '#f97316',
    ssr: '#eab308',
    runtime: '#a855f7',
  };

  function renderErrors(data) {
    var errors = data.errors || [];
    var category = data.category || 'build';

    if (errors.length === 0) {
      removeBar();
      return;
    }

    currentCategory = category;
    var bar = createBar();
    bar.innerHTML = '';

    var color = categoryColors[category] || '#ef4444';

    // Single-row layout for each error
    for (var i = 0; i < errors.length; i++) {
      var err = errors[i];

      var row = document.createElement('div');
      row.style.cssText = [
        'display:flex',
        'align-items:flex-start',
        'gap:10px',
        'padding:12px 16px',
        i > 0 ? 'border-top:1px solid #27272a' : '',
      ].join(';');

      // Category dot — amber for warnings
      var dotColor = (err.severity === 'warning') ? '#f59e0b' : color;
      var dot = document.createElement('span');
      dot.style.cssText = [
        'width:8px',
        'height:8px',
        'border-radius:50%',
        'background:' + dotColor,
        'flex-shrink:0',
        'margin-top:4px',
      ].join(';');
      row.appendChild(dot);

      // Content wrapper
      var content = document.createElement('div');
      content.style.cssText = 'flex:1;min-width:0;';

      // Error message — amber for warnings, red for errors
      var isWarning = err.severity === 'warning';
      var msg = document.createElement('span');
      msg.textContent = err.message;
      msg.style.cssText = 'color:' + (isWarning ? '#fcd34d' : '#fca5a5') + ';word-break:break-word;';
      content.appendChild(msg);

      // File link (inline, after message)
      if (err.file) {
        // Show relative path for readability — strip common prefixes
        var displayPath = err.file;
        var srcIdx = displayPath.indexOf('/src/');
        if (srcIdx !== -1) {
          displayPath = displayPath.substring(srcIdx + 1); // "src/..."
        }
        var locText = displayPath;
        if (err.line) locText += ':' + err.line;
        if (err.column) locText += ':' + err.column;

        var loc = document.createElement('a');
        loc.textContent = locText;
        loc.href = editorUri(err.file, err.line, err.column);
        loc.style.cssText = [
          'display:block',
          'color:#60a5fa',
          'text-decoration:none',
          'font-size:11px',
          'margin-top:4px',
        ].join(';');
        loc.onmouseover = function() { this.style.textDecoration = 'underline'; };
        loc.onmouseout = function() { this.style.textDecoration = 'none'; };
        content.appendChild(loc);
      }

      // Suggestion (if available)
      if (err.suggestion) {
        var sug = document.createElement('div');
        sug.style.cssText = [
          'margin-top:6px',
          'padding:6px 10px',
          'background:rgba(34,197,94,0.08)',
          'border:1px solid rgba(34,197,94,0.2)',
          'border-radius:4px',
          'color:#86efac',
          'font-size:11px',
          'line-height:1.4',
        ].join(';');
        var sugLabel = document.createElement('span');
        sugLabel.textContent = 'Fix: ';
        sugLabel.style.cssText = 'font-weight:600;color:#4ade80;';
        sug.appendChild(sugLabel);
        sug.appendChild(document.createTextNode(err.suggestion));
        content.appendChild(sug);
      }

      // Code snippet (collapsible for bar mode — keep compact)
      if (err.code_snippet) {
        var pre = document.createElement('pre');
        pre.style.cssText = [
          'margin:6px 0 0',
          'padding:8px',
          'background:#09090b',
          'border:1px solid #27272a',
          'border-radius:4px',
          'overflow-x:auto',
          'font-size:11px',
          'line-height:1.5',
          'max-height:120px',
          'overflow-y:auto',
        ].join(';');

        var lines = err.code_snippet.split('\n');
        for (var j = 0; j < lines.length; j++) {
          var line = lines[j];
          if (!line && j === lines.length - 1) continue;
          var lineEl = document.createElement('div');
          if (line.charAt(0) === '>') {
            var hlColor = isWarning ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';
            lineEl.style.cssText = 'background:' + hlColor + ';margin:0 -8px;padding:0 8px;';
          }
          lineEl.textContent = line;
          pre.appendChild(lineEl);
        }
        content.appendChild(pre);
      }

      row.appendChild(content);
      bar.appendChild(row);
    }
  }

  // ── "Server Down" Fallback ─────────────────────────────────────

  function showServerDown() {
    currentCategory = 'server';
    var bar = createBar();
    bar.innerHTML = '';

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 16px;';

    var icon = document.createElement('span');
    icon.textContent = '\u26A0';
    icon.style.cssText = 'font-size:16px;flex-shrink:0;';
    row.appendChild(icon);

    var msg = document.createElement('span');
    msg.textContent = 'Dev server may be down. Check the terminal.';
    msg.style.cssText = 'color:#a1a1aa;font-size:13px;';
    row.appendChild(msg);

    var hint = document.createElement('span');
    hint.textContent = 'Reconnecting...';
    hint.style.cssText = 'color:#52525b;font-size:11px;margin-left:auto;';
    row.appendChild(hint);

    bar.appendChild(row);
  }

  // ── WebSocket Connection ───────────────────────────────────────

  function connect() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = protocol + '//' + location.host + WS_PATH;

    try {
      ws = new WebSocket(url);
    } catch (err) {
      scheduleReconnect();
      return;
    }

    ws.onopen = function() {
      reconnectAttempts = 0;
    };

    ws.onmessage = function(event) {
      try {
        var data = JSON.parse(event.data);
        switch (data.type) {
          case 'error':
            renderErrors(data);
            break;
          case 'clear':
            // Server-side clear should not dismiss client-side runtime errors.
            // Runtime errors (e.g., import() failures) are only cleared by the
            // HMR client when a subsequent import succeeds.
            if (currentCategory !== 'runtime') {
              removeBar();
            }
            break;
        }
      } catch (err) {
        // Ignore parse errors
      }
    };

    ws.onclose = function() {
      scheduleReconnect();
    };

    ws.onerror = function() {
      // onclose fires after onerror
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;

    var now = Date.now();
    rapidReconnects.push(now);
    rapidReconnects = rapidReconnects.filter(function(t) {
      return now - t < RAPID_RECONNECT_WINDOW_MS;
    });

    if (rapidReconnects.length >= RAPID_RECONNECT_LIMIT) {
      showServerDown();
      reconnectAttempts = 99;
    }

    var delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts),
      RECONNECT_MAX_MS
    );
    reconnectAttempts++;

    reconnectTimer = setTimeout(function() {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  // ── Public API ─────────────────────────────────────────────────
  globalThis.__vertz_error_overlay = {
    showErrors: renderErrors,
    dismiss: removeBar,
  };

  // ── Client-Side Error Capture ─────────────────────────────────
  //
  // Captures uncaught runtime errors and unhandled promise rejections,
  // then reports them to the server so they appear in the overlay,
  // terminal output, and error log file.

  var lastReportedError = '';
  var reportDebounceTimer = null;

  function reportClientError(message, source, lineno, colno, stack) {
    // Deduplicate rapid-fire reports of the same error.
    // Strip "Uncaught Error: " / "Uncaught " prefix so that the same error
    // reported via window.onerror (prefixed) and console.error (raw) deduplicates.
    var normalizedMsg = String(message)
      .replace(/^Uncaught\s+\w+:\s*/, '')
      .replace(/^Uncaught\s+/, '');
    var key = normalizedMsg + '|' + (source || '') + '|' + (lineno || 0);
    if (key === lastReportedError) return;
    lastReportedError = key;

    // Clear dedup key after a short window so the same error can be
    // reported again if it recurs after a code change.
    clearTimeout(reportDebounceTimer);
    reportDebounceTimer = setTimeout(function() { lastReportedError = ''; }, 2000);

    var body = JSON.stringify({
      message: String(message),
      file: source || null,
      line: lineno || null,
      column: colno || null,
      stack: stack || null,
    });

    // Fire-and-forget POST — do not await or retry.
    try {
      fetch('/__vertz_api/report-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
      }).catch(function() { /* network failure — silent */ });
    } catch (_) {
      // fetch not available or blocked — silent
    }
  }

  // Intercept console.error to capture errors swallowed by the framework's
  // reactive runtime (e.g., thrown errors inside effects/renders that are
  // caught internally and only logged, never re-thrown to window.onerror).
  var originalConsoleError = console.error;
  console.error = function() {
    // Call the original first so DevTools still shows the error.
    originalConsoleError.apply(console, arguments);

    // Check if any argument is an Error object or looks like an error.
    for (var i = 0; i < arguments.length; i++) {
      var arg = arguments[i];
      if (arg instanceof Error) {
        var stack = arg.stack || null;
        var file = null;
        var line = null;
        var col = null;
        if (stack) {
          // Extract location from the FIRST user-code frame (skip framework internals).
          var lines = stack.split('\n');
          for (var j = 0; j < lines.length; j++) {
            var match = lines[j].match(/(?:at\s+\S+\s+\()?(https?:\/\/[^)]+):(\d+):(\d+)\)?/);
            if (match && match[1].indexOf('/@deps/') === -1 && match[1].indexOf('/node_modules/') === -1) {
              file = match[1];
              line = parseInt(match[2], 10);
              col = parseInt(match[3], 10);
              break;
            }
          }
        }
        reportClientError(arg.message, file, line, col, stack);
        return; // Only report the first Error in the arguments.
      }
    }
  };

  // Capture uncaught synchronous errors (e.g., throw in component body,
  // duplicate declarations, reference errors).
  window.addEventListener('error', function(event) {
    // Ignore errors from browser extensions or cross-origin scripts.
    if (event.filename && event.filename.indexOf(location.origin) === -1) return;

    var stack = event.error && event.error.stack ? event.error.stack : null;
    reportClientError(
      event.message || 'Unknown error',
      event.filename || null,
      event.lineno || null,
      event.colno || null,
      stack
    );
  });

  // Capture unhandled promise rejections (e.g., async component errors,
  // failed dynamic imports during initial load).
  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    var message = reason instanceof Error ? reason.message : String(reason || 'Unhandled promise rejection');
    var stack = reason instanceof Error ? reason.stack : null;

    // Try to extract file/line from the stack trace.
    var file = null;
    var line = null;
    var col = null;
    if (stack) {
      // Match patterns like "at Foo (http://localhost:3000/src/app.tsx:42:15)"
      // or "http://localhost:3000/src/app.tsx:42:15"
      var match = stack.match(/(?:at\s+\S+\s+\()?(\S+):(\d+):(\d+)\)?/);
      if (match) {
        file = match[1];
        line = parseInt(match[2], 10);
        col = parseInt(match[3], 10);
      }
    }

    reportClientError(message, file, line, col, stack);
  });

  // ── Initialize ─────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { connect(); });
  } else {
    connect();
  }
})();
