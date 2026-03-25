/**
 * Search palette inline script for Cmd+K palette.
 * Loaded lazily with Pagefind only when the palette opens.
 *
 * This is a const template string — testable separately from page renderer.
 */
export const SEARCH_PALETTE_SCRIPT = `<script>
(function() {
  var palette = document.querySelector('[data-search-palette]');
  var input = palette.querySelector('[data-search-input]');
  var results = palette.querySelector('[data-search-results]');
  var pagefindLoaded = false;
  var pagefind = null;
  var debounceTimer = null;
  var activeIndex = -1;

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function open() {
    palette.removeAttribute('hidden');
    palette.setAttribute('aria-hidden', 'false');
    input.value = '';
    results.innerHTML = '';
    activeIndex = -1;
    input.focus();
    loadPagefind();
  }

  function close() {
    palette.setAttribute('hidden', '');
    palette.setAttribute('aria-hidden', 'true');
    activeIndex = -1;
  }

  function loadPagefind() {
    if (pagefindLoaded) return;
    pagefindLoaded = true;
    import('/_pagefind/pagefind.js').then(function(pf) {
      pagefind = pf;
      pagefind.init();
    }).catch(function() {
      pagefindLoaded = false;
    });
  }

  async function doSearch(query) {
    if (!pagefind || !query.trim()) {
      results.innerHTML = '';
      activeIndex = -1;
      return;
    }
    var searchResult = await pagefind.search(query);
    if (!searchResult.results.length) {
      results.innerHTML = '<div data-search-empty style="padding:16px;text-align:center;color:var(--docs-muted,#6b7280)">No results found</div>';
      activeIndex = -1;
      return;
    }
    var items = await Promise.all(searchResult.results.slice(0, 10).map(function(r) { return r.data(); }));
    results.innerHTML = items.map(function(item, i) {
      var safeUrl = esc(item.url || '');
      var safeTitle = esc(item.meta?.title || item.url || '');
      var safeExcerpt = esc(item.excerpt || '');
      return '<a href="' + safeUrl + '" role="option" data-search-result="' + i + '" style="display:block;padding:12px 16px;text-decoration:none;color:var(--docs-text,#111827);border-bottom:1px solid var(--docs-border,#e5e7eb)">' +
        '<div style="font-weight:500;font-size:14px">' + safeTitle + '</div>' +
        '<div style="font-size:13px;color:var(--docs-muted,#6b7280);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + safeExcerpt + '</div>' +
        '</a>';
    }).join('');
    activeIndex = -1;
    updateActiveResult();
  }

  function updateActiveResult() {
    var items = results.querySelectorAll('[data-search-result]');
    for (var i = 0; i < items.length; i++) {
      items[i].style.background = i === activeIndex ? 'var(--docs-primary-bg,#eff6ff)' : '';
      if (i === activeIndex) items[i].setAttribute('aria-selected', 'true');
      else items[i].removeAttribute('aria-selected');
    }
  }

  // Keyboard listener for Cmd+K / Ctrl+K
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if (palette.hasAttribute('hidden')) open();
      else close();
    }
    if (e.key === 'Escape' && !palette.hasAttribute('hidden')) {
      e.preventDefault();
      close();
    }
  });

  // Search button click
  var searchBtn = document.querySelector('[data-search]');
  if (searchBtn) searchBtn.addEventListener('click', open);

  // Backdrop click closes palette
  palette.addEventListener('click', function(e) {
    if (e.target === palette) close();
  });

  // Input with debounce
  input.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      doSearch(input.value);
    }, 150);
  });

  // Keyboard navigation within palette
  input.addEventListener('keydown', function(e) {
    var items = results.querySelectorAll('[data-search-result]');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      updateActiveResult();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, -1);
      updateActiveResult();
    } else if (e.key === 'Enter' && activeIndex >= 0 && items[activeIndex]) {
      e.preventDefault();
      window.location.href = items[activeIndex].getAttribute('href');
    }
  });
})();
</script>`;

/**
 * Styles for the search palette.
 */
export const SEARCH_PALETTE_STYLES = `<style>
[data-search-palette] {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  background: rgba(0,0,0,0.5);
}
[data-search-palette][hidden] {
  display: none;
}
[data-search-palette-inner] {
  width: 100%;
  max-width: 560px;
  background: var(--docs-bg, #ffffff);
  border-radius: 12px;
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
  overflow: hidden;
}
[data-search-input] {
  width: 100%;
  padding: 16px;
  border: none;
  border-bottom: 1px solid var(--docs-border, #e5e7eb);
  font-size: 16px;
  background: transparent;
  color: var(--docs-text, #111827);
  outline: none;
}
[data-search-results] {
  max-height: 400px;
  overflow-y: auto;
}
[data-search-result]:hover {
  background: var(--docs-primary-bg, #eff6ff);
}
</style>`;

/**
 * HTML markup for the search palette modal (injected into the page).
 */
export const SEARCH_PALETTE_HTML = `<div data-search-palette role="dialog" aria-modal="true" aria-label="Search documentation" hidden aria-hidden="true">
<div data-search-palette-inner>
<input data-search-input type="search" placeholder="Search docs..." aria-label="Search" autocomplete="off" />
<div data-search-results role="listbox" aria-label="Search results"></div>
</div>
</div>`;
