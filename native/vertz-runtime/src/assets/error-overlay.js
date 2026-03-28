/**
 * Vertz Error Overlay
 *
 * Connects to /__vertz_errors WebSocket and displays a floating error card
 * with syntax highlighting, code snippets, and clickable editor links.
 * Auto-dismisses when errors are fixed.
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
  var overlayEl = null;
  var rapidReconnects = [];

  // ── Editor Detection ───────────────────────────────────────────

  function getEditorScheme() {
    // Server can inject this via a meta tag
    var meta = document.querySelector('meta[name="vertz-editor"]');
    if (meta) return meta.getAttribute('content');
    // Default to vscode
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

  // ── Overlay Rendering ─────────────────────────────────────────

  function createOverlay() {
    if (overlayEl) return overlayEl;

    overlayEl = document.createElement('div');
    overlayEl.id = '__vertz_error_overlay';
    overlayEl.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483646',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:rgba(0,0,0,0.5)',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
      'font-size:13px',
      'color:#e4e4e7',
      'opacity:0',
      'transition:opacity 0.15s',
    ].join(';');

    document.body.appendChild(overlayEl);

    // Fade in
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        if (overlayEl) overlayEl.style.opacity = '1';
      });
    });

    return overlayEl;
  }

  function removeOverlay() {
    if (!overlayEl) return;
    overlayEl.style.opacity = '0';
    var el = overlayEl;
    overlayEl = null;
    setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 150);
  }

  function renderErrors(data) {
    var errors = data.errors || [];
    var category = data.category || 'build';

    if (errors.length === 0) {
      removeOverlay();
      return;
    }

    var overlay = createOverlay();

    var card = document.createElement('div');
    card.style.cssText = [
      'background:#18181b',
      'border:1px solid #3f3f46',
      'border-radius:12px',
      'max-width:720px',
      'width:90vw',
      'max-height:80vh',
      'overflow-y:auto',
      'box-shadow:0 25px 50px -12px rgba(0,0,0,0.5)',
      'padding:0',
    ].join(';');

    // Header
    var header = document.createElement('div');
    header.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'padding:16px 20px',
      'border-bottom:1px solid #3f3f46',
    ].join(';');

    var categoryColors = {
      build: '#ef4444',
      resolve: '#f97316',
      ssr: '#eab308',
      runtime: '#a855f7',
    };

    var title = document.createElement('div');
    title.style.cssText = 'display:flex;align-items:center;gap:8px;';
    var dot = document.createElement('span');
    dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:' + (categoryColors[category] || '#ef4444');
    var titleText = document.createElement('span');
    titleText.style.cssText = 'font-size:14px;font-weight:600;color:#fafafa;';
    titleText.textContent = category.charAt(0).toUpperCase() + category.slice(1) + ' Error';
    if (errors.length > 1) titleText.textContent += ' (' + errors.length + ')';
    title.appendChild(dot);
    title.appendChild(titleText);
    header.appendChild(title);

    // Dismiss button
    var dismiss = document.createElement('button');
    dismiss.textContent = '\u00D7';
    dismiss.style.cssText = [
      'background:none',
      'border:none',
      'color:#71717a',
      'font-size:20px',
      'cursor:pointer',
      'padding:0 4px',
      'line-height:1',
    ].join(';');
    dismiss.onclick = function() { removeOverlay(); };
    header.appendChild(dismiss);

    card.appendChild(header);

    // Error items
    for (var i = 0; i < errors.length; i++) {
      var err = errors[i];
      var item = document.createElement('div');
      item.style.cssText = 'padding:16px 20px;' + (i > 0 ? 'border-top:1px solid #27272a;' : '');

      // File location (clickable)
      if (err.file) {
        var loc = document.createElement('a');
        var locText = err.file;
        if (err.line) locText += ':' + err.line;
        if (err.column) locText += ':' + err.column;
        loc.textContent = locText;
        loc.href = editorUri(err.file, err.line, err.column);
        loc.style.cssText = [
          'display:block',
          'color:#60a5fa',
          'text-decoration:none',
          'margin-bottom:8px',
          'font-size:12px',
        ].join(';');
        loc.onmouseover = function() { this.style.textDecoration = 'underline'; };
        loc.onmouseout = function() { this.style.textDecoration = 'none'; };
        item.appendChild(loc);
      }

      // Error message
      var msg = document.createElement('div');
      msg.textContent = err.message;
      msg.style.cssText = 'color:#fca5a5;margin-bottom:8px;line-height:1.5;white-space:pre-wrap;word-break:break-word;';
      item.appendChild(msg);

      // Code snippet
      if (err.code_snippet) {
        var pre = document.createElement('pre');
        pre.style.cssText = [
          'background:#09090b',
          'border:1px solid #27272a',
          'border-radius:6px',
          'padding:12px',
          'margin:0',
          'overflow-x:auto',
          'font-size:12px',
          'line-height:1.6',
        ].join(';');

        var lines = err.code_snippet.split('\n');
        for (var j = 0; j < lines.length; j++) {
          var line = lines[j];
          if (!line && j === lines.length - 1) continue; // skip trailing empty

          var lineEl = document.createElement('div');
          var isError = line.charAt(0) === '>';
          if (isError) {
            lineEl.style.cssText = 'background:rgba(239,68,68,0.15);margin:0 -12px;padding:0 12px;';
          }
          lineEl.textContent = line;
          pre.appendChild(lineEl);
        }

        item.appendChild(pre);
      }

      card.appendChild(item);
    }

    overlay.innerHTML = '';
    overlay.appendChild(card);

    // Close on backdrop click
    overlay.onclick = function(e) {
      if (e.target === overlay) removeOverlay();
    };

    // Close on Escape
    var escHandler = function(e) {
      if (e.key === 'Escape') {
        removeOverlay();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  // ── "Server Down" Fallback ─────────────────────────────────────

  function showServerDown() {
    var overlay = createOverlay();
    overlay.innerHTML = '';

    var card = document.createElement('div');
    card.style.cssText = [
      'background:#18181b',
      'border:1px solid #3f3f46',
      'border-radius:12px',
      'padding:32px',
      'text-align:center',
      'max-width:400px',
    ].join(';');

    var icon = document.createElement('div');
    icon.textContent = '\u26A0';
    icon.style.cssText = 'font-size:32px;margin-bottom:12px;';
    card.appendChild(icon);

    var msg = document.createElement('div');
    msg.textContent = 'Dev server may be down. Check the terminal.';
    msg.style.cssText = 'color:#a1a1aa;font-size:14px;margin-bottom:16px;';
    card.appendChild(msg);

    var hint = document.createElement('div');
    hint.textContent = 'Reconnecting...';
    hint.style.cssText = 'color:#52525b;font-size:12px;';
    card.appendChild(hint);

    overlay.appendChild(card);
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
            removeOverlay();
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

    // Track rapid reconnects
    var now = Date.now();
    rapidReconnects.push(now);
    // Remove old entries outside the window
    rapidReconnects = rapidReconnects.filter(function(t) {
      return now - t < RAPID_RECONNECT_WINDOW_MS;
    });

    if (rapidReconnects.length >= RAPID_RECONNECT_LIMIT) {
      showServerDown();
      // Still try to reconnect, but at max interval
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

  // ── Initialize ─────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { connect(); });
  } else {
    connect();
  }
})();
