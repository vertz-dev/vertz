// Client-side entry point.
// If HMR works, editing this file should hot-reload in the browser
// without a full page refresh.

const root = document.getElementById('app');
if (root) {
  root.innerHTML = '<h1>Hello from client.tsx</h1><p>Counter: 0</p>';
}

// Simple counter to verify interactivity after hydration
let count = 0;
document.addEventListener('click', () => {
  count++;
  const p = document.querySelector('p');
  if (p) p.textContent = `Counter: ${count}`;
});

console.log('[client] loaded — if you see this after editing, HMR is NOT working (full reload)');

// Bun injects `import.meta.hot` when HMR is active
if (import.meta.hot) {
  console.log('[client] ✅ import.meta.hot is available — HMR is active!');
  import.meta.hot.accept(() => {
    console.log('[client] ✅ HMR update accepted');
  });
} else {
  console.log('[client] ❌ import.meta.hot is undefined — HMR is NOT active');
}
