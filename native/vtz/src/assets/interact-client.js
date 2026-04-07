/**
 * Vertz Browser Interaction Client
 *
 * Connects to the dev server's /__vertz_interact WebSocket and enables
 * MCP tools to interact with this browser tab: clicking elements, typing
 * text, filling forms, and collecting structured page snapshots.
 *
 * Zero overhead when no agent is controlling this tab — the snapshot
 * collector only runs when explicitly requested.
 */
(function() {
  'use strict';

  var WS_PATH = '/__vertz_interact';
  var TAB_ID_KEY = '__vertz_tab_id';
  var RECONNECT_BASE_MS = 500;
  var RECONNECT_MAX_MS = 5000;

  // ── Stable Tab ID ──────────────────────────────────────────────
  // Persisted in sessionStorage so the same tab keeps its ID across
  // page refreshes, HMR reloads, and WebSocket reconnections.
  var tabId;
  try {
    tabId = sessionStorage.getItem(TAB_ID_KEY);
    if (!tabId) {
      tabId = 'tab-' + crypto.randomUUID().slice(0, 8);
      sessionStorage.setItem(TAB_ID_KEY, tabId);
    }
  } catch (e) {
    // sessionStorage not available (e.g., sandboxed iframe)
    tabId = 'tab-' + Math.random().toString(36).slice(2, 10);
  }

  // ── State ──────────────────────────────────────────────────────
  var ws = null;
  var reconnectAttempts = 0;
  var reconnectTimer = null;
  var controlled = false;
  var sessionId = null;

  // ── Element ref tracking ───────────────────────────────────────
  // Maps ref strings to DOM elements (populated during snapshot).
  // Reset on each snapshot to avoid stale references.
  var refToElement = {};

  // ── Connection ─────────────────────────────────────────────────

  function connect() {
    var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url = protocol + '//' + location.host + WS_PATH;

    try {
      ws = new WebSocket(url);
    } catch (e) {
      scheduleReconnect();
      return;
    }

    ws.onopen = function() {
      reconnectAttempts = 0;
      // Identify this tab to the server
      sendTabInfo();
    };

    ws.onmessage = function(event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      handleMessage(msg);
    };

    ws.onclose = function() {
      ws = null;
      scheduleReconnect();
    };

    ws.onerror = function() {
      // onclose will fire after this
    };
  }

  function sendTabInfo() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'tab-info',
      tabId: tabId,
      url: location.pathname + location.search,
      title: document.title || ''
    }));
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
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

  // ── URL change detection ───────────────────────────────────────
  var lastUrl = location.pathname + location.search;

  function checkUrlChange() {
    var currentUrl = location.pathname + location.search;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      sendTabInfo();
    }
  }

  window.addEventListener('popstate', checkUrlChange);
  // Poll for pushState changes (pushState doesn't fire any event)
  setInterval(checkUrlChange, 500);

  // ── Message Handling ───────────────────────────────────────────

  function handleMessage(msg) {
    if (msg.type === 'control') {
      if (msg.action === 'connect') {
        controlled = true;
        sessionId = msg.sessionId || null;
      } else if (msg.action === 'disconnect') {
        controlled = false;
        sessionId = null;
      }
      return;
    }

    if (msg.type === 'interact') {
      handleInteraction(msg);
      return;
    }
  }

  function handleInteraction(msg) {
    var action = msg.action;
    var requestId = msg.requestId;

    if (action !== 'snapshot' && !controlled) {
      sendResult(requestId, false, 'Not in a control session. Call vertz_browser_connect first.');
      return;
    }

    if (action === 'snapshot') {
      var snapshot = collectSnapshot(msg.maxElements);
      sendResult(requestId, true, { ok: true, snapshot: snapshot });
      return;
    }

    // Resolve target element for interaction actions
    var resolved = resolveTarget(msg.target);
    if (resolved.error) {
      sendResult(requestId, false, resolved.error);
      return;
    }
    var el = resolved.element;
    var preNavUrl = location.pathname + location.search;

    if (action === 'click') {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      settleAndSnapshot(requestId, msg.maxElements, preNavUrl);
      return;
    }

    if (action === 'type') {
      if (!isInputLike(el)) {
        sendResult(requestId, false, 'Target element is not an <input> or <textarea>.');
        return;
      }
      el.value = msg.text != null ? String(msg.text) : '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      settleAndSnapshot(requestId, msg.maxElements, preNavUrl);
      return;
    }

    if (action === 'select') {
      if (el.tagName.toLowerCase() !== 'select') {
        sendResult(requestId, false, 'Target element is not a <select>.');
        return;
      }
      el.value = msg.value != null ? String(msg.value) : '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      settleAndSnapshot(requestId, msg.maxElements, preNavUrl);
      return;
    }

    if (action === 'fill_form') {
      if (el.tagName.toLowerCase() !== 'form') {
        sendResult(requestId, false, 'Target is not a <form> element.');
        return;
      }
      var fillError = fillFormFields(el, msg.data || {});
      if (fillError) {
        sendResult(requestId, false, fillError);
        return;
      }
      settleAndSnapshot(requestId, msg.maxElements, preNavUrl);
      return;
    }

    if (action === 'submit') {
      if (el.tagName.toLowerCase() !== 'form') {
        sendResult(requestId, false, 'Target is not a <form> element.');
        return;
      }
      el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      settleAfterNavigation(requestId, msg.maxElements, preNavUrl);
      return;
    }

    if (action === 'press_key') {
      var target = document.activeElement || document.body;
      var key = msg.key || '';
      target.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }));
      target.dispatchEvent(new KeyboardEvent('keyup', { key: key, bubbles: true, cancelable: true }));
      settleAndSnapshot(requestId, msg.maxElements, preNavUrl);
      return;
    }

    if (action === 'wait') {
      var condition = msg.condition || {};
      var timeoutMs = msg.timeoutMs || 5000;
      waitForCondition(condition, timeoutMs, function(ok, elapsed) {
        if (ok) {
          var snap = collectSnapshot(msg.maxElements || 50);
          sendResult(requestId, true, { ok: true, elapsed: elapsed, snapshot: snap });
        } else {
          sendResult(requestId, false, 'Condition not met within ' + timeoutMs + 'ms.');
        }
      });
      return;
    }

    sendResult(requestId, false, 'Unknown action: ' + action);
  }

  // ── Result Sending ─────────────────────────────────────────────

  function sendResult(requestId, ok, data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    var result = { type: 'interact-result', requestId: requestId };
    if (ok) {
      result.ok = true;
      if (data && typeof data === 'object') {
        // Merge data into result (snapshot, navigation, elapsed)
        for (var key in data) {
          if (data.hasOwnProperty(key)) result[key] = data[key];
        }
      }
    } else {
      result.ok = false;
      result.error = typeof data === 'string' ? data : 'Unknown error';
    }
    ws.send(JSON.stringify(result));
  }

  // ── Target Resolution ──────────────────────────────────────────

  function resolveTarget(target) {
    if (!target) return { error: 'No target specified.' };

    // String: try as ref first, then as CSS selector
    if (typeof target === 'string') {
      var byRef = refToElement[target];
      if (byRef && byRef.isConnected) return { element: byRef };

      try {
        var bySel = document.querySelector(target);
        if (bySel) return { element: bySel };
      } catch (e) {
        // Invalid selector — fall through to error
      }

      return { error: "Element ref '" + target + "' not found. The page may have changed \u2014 call vertz_browser_snapshot to refresh." };
    }

    // Object: { text, name, label }
    if (typeof target === 'object') {
      if (target.text) {
        var byText = findByText(document.body, target.text);
        if (byText) return { element: byText };
        return { error: "No element found with text '" + target.text + "'." };
      }
      if (target.name) {
        var byName = document.querySelector('[name="' + cssEscape(target.name) + '"]');
        if (byName) return { element: byName };
        return { error: "No element found with name '" + target.name + "'." };
      }
      if (target.label) {
        var byLabel = findByLabel(target.label);
        if (byLabel) return { element: byLabel };
        return { error: "No element found with label '" + target.label + "'." };
      }
    }

    return { error: 'Invalid target format. Use a ref string, CSS selector, or { text, name, label } object.' };
  }

  function findByText(container, text) {
    // Find the deepest interactive element with matching text
    var candidates = container.querySelectorAll('button,a,[role="button"],[role="link"],label,span,div,p,h1,h2,h3,h4,h5,h6,li,td,th');
    var best = null;
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.textContent && el.textContent.trim() === text) {
        best = el; // Keep last match (deepest in DOM order from querySelectorAll)
      }
    }
    return best;
  }

  function findByLabel(labelText) {
    var labels = document.querySelectorAll('label');
    for (var i = 0; i < labels.length; i++) {
      var lbl = labels[i];
      if (lbl.textContent && lbl.textContent.trim() === labelText) {
        // Check 'for' attribute
        if (lbl.htmlFor) {
          var linked = document.getElementById(lbl.htmlFor);
          if (linked) return linked;
        }
        // Check nested input
        var nested = lbl.querySelector('input,select,textarea');
        if (nested) return nested;
      }
    }
    return null;
  }

  // ── Snapshot Collection ────────────────────────────────────────

  function collectSnapshot(maxElements) {
    maxElements = maxElements || 50;
    var snapshot = {
      url: location.pathname + location.search,
      title: document.title || '',
      focused: null,
      settled: true,
      pending: [],
      elements: [],
      customActions: [],
      forms: []
    };

    // Reset ref tracking
    refToElement = {};
    var refCounter = 0;
    var namesSeen = {};

    var selector = 'input,button,select,textarea,a,[role="button"],[role="link"],[role="checkbox"],[role="tab"]';
    var allElements = document.querySelectorAll(selector);
    var elementCount = 0;

    for (var i = 0; i < allElements.length && elementCount < maxElements; i++) {
      var el = allElements[i];
      if (!el.isConnected || isHiddenElement(el)) continue;

      var ref = assignRef(el, namesSeen, refCounter);
      if (typeof ref === 'number') refCounter = ref + 1;
      else refCounter++;

      var info = serializeElement(el, typeof ref === 'number' ? 'e' + ref : ref);
      if (info) {
        snapshot.elements.push(info);
        refToElement[info.ref] = el;
        elementCount++;
      }
    }

    // Focused element
    if (document.activeElement && document.activeElement !== document.body) {
      for (var r in refToElement) {
        if (refToElement[r] === document.activeElement) {
          snapshot.focused = r;
          break;
        }
      }
    }

    // Forms
    var forms = document.querySelectorAll('form');
    for (var f = 0; f < forms.length; f++) {
      var form = forms[f];
      var formRef = 'f' + (f + 1);
      refToElement[formRef] = form;

      var fieldRefs = [];
      var formFields = form.querySelectorAll('input,select,textarea');
      for (var j = 0; j < formFields.length; j++) {
        // Find the ref for this field
        for (var r2 in refToElement) {
          if (refToElement[r2] === formFields[j]) {
            fieldRefs.push(r2);
            break;
          }
        }
      }

      snapshot.forms.push({
        ref: formRef,
        action: form.getAttribute('action') || '',
        method: (form.getAttribute('method') || 'GET').toUpperCase(),
        fields: fieldRefs,
        errors: {}
      });
    }

    return snapshot;
  }

  function assignRef(el, namesSeen, counter) {
    // Deterministic ref: data-testid > id > name > positional
    var testId = el.getAttribute('data-testid');
    if (testId && !namesSeen[testId]) {
      namesSeen[testId] = true;
      return testId;
    }

    var id = el.id;
    if (id && !namesSeen[id]) {
      namesSeen[id] = true;
      return id;
    }

    var name = el.getAttribute('name');
    if (name && !namesSeen[name]) {
      namesSeen[name] = true;
      return name;
    }

    // Positional fallback
    return counter;
  }

  function serializeElement(el, ref) {
    var tag = el.tagName.toLowerCase();
    var info = { ref: ref, tag: tag };

    if (el instanceof HTMLInputElement) {
      info.type = el.type || 'text';
      if (el.name) info.name = el.name;
      if (el.type === 'password') {
        info.value = '********';
      } else if (el.type === 'checkbox' || el.type === 'radio') {
        info.checked = el.checked;
        if (el.value && el.value !== 'on') info.value = el.value;
      } else {
        info.value = el.value || '';
      }
      if (el.placeholder) info.placeholder = el.placeholder;
      if (el.disabled) info.disabled = true;
      if (el.readOnly) info.readonly = true;
      if (el.required) info.required = true;
    } else if (el instanceof HTMLSelectElement) {
      if (el.name) info.name = el.name;
      info.value = el.value || '';
      info.options = [];
      for (var o = 0; o < el.options.length; o++) {
        info.options.push({
          value: el.options[o].value,
          text: el.options[o].text
        });
      }
      if (el.disabled) info.disabled = true;
      if (el.required) info.required = true;
    } else if (el instanceof HTMLTextAreaElement) {
      if (el.name) info.name = el.name;
      info.value = el.value || '';
      if (el.placeholder) info.placeholder = el.placeholder;
      if (el.disabled) info.disabled = true;
      if (el.readOnly) info.readonly = true;
      if (el.required) info.required = true;
    } else if (tag === 'button') {
      info.text = (el.textContent || '').trim();
      info.type = el.getAttribute('type') || 'button';
      if (el.disabled) info.disabled = true;
    } else if (tag === 'a') {
      info.text = (el.textContent || '').trim();
      info.href = el.getAttribute('href') || '';
    } else {
      // role-based elements
      info.text = (el.textContent || '').trim();
      var role = el.getAttribute('role');
      if (role) info.role = role;
      if (el.getAttribute('aria-disabled') === 'true') info.disabled = true;
    }

    // Find associated label
    var label = findLabelFor(el);
    if (label) info.label = label;

    return info;
  }

  function findLabelFor(el) {
    // Check for label via 'for' attribute
    if (el.id) {
      var lbl = document.querySelector('label[for="' + cssEscape(el.id) + '"]');
      if (lbl) return lbl.textContent.trim();
    }
    // Check for wrapping label
    var parent = el.closest('label');
    if (parent) {
      // Get label text excluding the input's own text
      var clone = parent.cloneNode(true);
      var inputs = clone.querySelectorAll('input,select,textarea');
      for (var i = 0; i < inputs.length; i++) inputs[i].remove();
      var text = clone.textContent.trim();
      if (text) return text;
    }
    // Check aria-label
    var ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    return null;
  }

  function isHiddenElement(el) {
    if (!el.offsetParent && el.tagName.toLowerCase() !== 'body' && el.tagName.toLowerCase() !== 'html') {
      var style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
    }
    return false;
  }

  function isInputLike(el) {
    var tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea';
  }

  // ── Form Filling ───────────────────────────────────────────���───

  function fillFormFields(formEl, data) {
    for (var name in data) {
      if (!data.hasOwnProperty(name)) continue;
      var value = data[name];
      var elements = formEl.querySelectorAll('[name="' + cssEscape(name) + '"]');
      if (elements.length === 0) {
        return 'No field with name "' + name + '" found in the form.';
      }
      var first = elements[0];

      // Radio buttons
      if (first instanceof HTMLInputElement && first.type === 'radio') {
        var matched = false;
        for (var r = 0; r < elements.length; r++) {
          if (elements[r] instanceof HTMLInputElement && elements[r].value === String(value)) {
            elements[r].checked = true;
            elements[r].dispatchEvent(new Event('input', { bubbles: true }));
            elements[r].dispatchEvent(new Event('change', { bubbles: true }));
            matched = true;
          }
        }
        if (!matched) return 'No radio button "' + name + '" with value "' + value + '".';
        continue;
      }

      // Checkbox
      if (first instanceof HTMLInputElement && first.type === 'checkbox') {
        first.checked = (value === 'true' || value === true);
        first.dispatchEvent(new Event('input', { bubbles: true }));
        first.dispatchEvent(new Event('change', { bubbles: true }));
        continue;
      }

      // Select, input, textarea
      if (first instanceof HTMLSelectElement || first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement) {
        first.value = String(value);
        first.dispatchEvent(new Event('input', { bubbles: true }));
        first.dispatchEvent(new Event('change', { bubbles: true }));
        continue;
      }

      return 'Field "' + name + '" is not a supported form field type.';
    }
    return null;
  }

  // ── Settle and Snapshot ────────────────────────────────────────

  function settleAndSnapshot(requestId, maxElements, preNavUrl) {
    Promise.resolve().then(function() {
      requestAnimationFrame(function() {
        setTimeout(function() {
          var snapshot = collectSnapshot(maxElements || 50);
          var result = { ok: true, snapshot: snapshot };
          var currentUrl = location.pathname + location.search;
          if (preNavUrl && preNavUrl !== currentUrl) {
            result.navigation = { from: preNavUrl, to: currentUrl };
          }
          sendResult(requestId, true, result);
        }, 250);
      });
    });
  }

  function settleAfterNavigation(requestId, maxElements, preNavUrl) {
    var checkCount = 0;
    var maxChecks = 20; // 2 seconds total (100ms * 20)

    function check() {
      checkCount++;
      var currentUrl = location.pathname + location.search;
      var urlChanged = preNavUrl !== currentUrl;

      if (urlChanged || checkCount >= maxChecks) {
        Promise.resolve().then(function() {
          requestAnimationFrame(function() {
            setTimeout(function() {
              var snapshot = collectSnapshot(maxElements || 50);
              var result = { ok: true, snapshot: snapshot };
              var finalUrl = location.pathname + location.search;
              if (preNavUrl !== finalUrl) {
                result.navigation = { from: preNavUrl, to: finalUrl };
              }
              sendResult(requestId, true, result);
            }, 250);
          });
        });
        return;
      }

      setTimeout(check, 100);
    }

    Promise.resolve().then(function() {
      requestAnimationFrame(function() {
        check();
      });
    });
  }

  // ── Wait for Condition ─────────────────────────────────────────

  function waitForCondition(condition, timeoutMs, callback) {
    var startTime = Date.now();
    var intervalMs = 100;

    function check() {
      var elapsed = Date.now() - startTime;

      if (checkCondition(condition)) {
        callback(true, elapsed);
        return;
      }

      if (elapsed >= timeoutMs) {
        callback(false, elapsed);
        return;
      }

      setTimeout(check, intervalMs);
    }

    // Check immediately first
    check();
  }

  function checkCondition(condition) {
    if (condition.text) {
      return document.body && document.body.textContent &&
        document.body.textContent.indexOf(condition.text) !== -1;
    }
    if (condition.selector) {
      return document.querySelector(condition.selector) !== null;
    }
    if (condition.url) {
      var currentUrl = location.pathname + location.search;
      return currentUrl === condition.url || location.pathname === condition.url;
    }
    if (condition.absent) {
      return document.querySelector(condition.absent) === null;
    }
    return false;
  }

  // ── Utilities ──────────────────────────────────────────────────

  function cssEscape(str) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(str);
    // Basic fallback for environments without CSS.escape
    return str.replace(/([^\w-])/g, '\\$1');
  }

  // ── Expose for debugging ───────────────────────────────────────
  globalThis.__vertz_interact = {
    tabId: tabId,
    isControlled: function() { return controlled; },
    sessionId: function() { return sessionId; }
  };

  // ── Start ──────────────────────────────────────────────────────
  if (typeof document !== 'undefined') {
    connect();
  }
})();
