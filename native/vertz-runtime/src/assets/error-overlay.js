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

  function editorUri(file, line, column) {
    var scheme = getEditorScheme();
    var lineNum = line || 1;
    var colNum = column || 1;

    switch (scheme) {
      case 'cursor':
        return 'cursor://file' + file + ':' + lineNum + ':' + colNum;
      case 'webstorm':
        return 'webstorm://open?file=' + encodeURIComponent(file) + '&line=' + lineNum + '&column=' + colNum;
      case 'zed':
        return 'zed://open?path=' + encodeURIComponent(file) + '&line=' + lineNum + '&column=' + colNum;
      case 'vscode':
      default:
        return 'vscode://file' + file + ':' + lineNum + ':' + colNum;
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

      // Category dot
      var dot = document.createElement('span');
      dot.style.cssText = [
        'width:8px',
        'height:8px',
        'border-radius:50%',
        'background:' + color,
        'flex-shrink:0',
        'margin-top:4px',
      ].join(';');
      row.appendChild(dot);

      // Content wrapper
      var content = document.createElement('div');
      content.style.cssText = 'flex:1;min-width:0;';

      // Error message
      var msg = document.createElement('span');
      msg.textContent = err.message;
      msg.style.cssText = 'color:#fca5a5;word-break:break-word;';
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
            lineEl.style.cssText = 'background:rgba(239,68,68,0.15);margin:0 -8px;padding:0 8px;';
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

  // ── Initialize ─────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { connect(); });
  } else {
    connect();
  }
})();
