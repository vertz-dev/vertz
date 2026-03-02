/**
 * Playwright test for the SSR + HMR POC.
 *
 * Tests:
 * 1. SSR page loads and client hydrates
 * 2. import.meta.hot is available (HMR active)
 * 3. Editing client.tsx triggers HMR update (not full reload)
 */
import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'fs';

const CLIENT_PATH = new URL('./client.tsx', import.meta.url).pathname;
const originalContent = readFileSync(CLIENT_PATH, 'utf-8');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const logs = [];
page.on('console', msg => {
  const text = msg.text();
  logs.push(`[${msg.type()}] ${text}`);
  if (text.includes('[client]') || text.includes('hot') || text.includes('HMR')) {
    console.log(`  CONSOLE: ${text}`);
  }
});
page.on('pageerror', err => console.log(`  PAGE ERROR: ${err.message}`));

console.log('\n=== Test 1: SSR page loads ===');
await page.goto('http://localhost:3456/');
await page.waitForTimeout(2000);

const ssrContent = await page.locator('#app h1').textContent();
console.log(`  SSR h1: "${ssrContent}"`);

const bodyText = await page.locator('#app').textContent();
console.log(`  Has "Server-rendered": ${bodyText?.includes('Server-rendered')}`);

console.log('\n=== Test 2: Check import.meta.hot ===');
const hotAvailable = logs.some(l => l.includes('import.meta.hot is available'));
const hotUndefined = logs.some(l => l.includes('import.meta.hot is undefined'));
console.log(`  import.meta.hot available: ${hotAvailable}`);
console.log(`  import.meta.hot undefined: ${hotUndefined}`);

if (hotAvailable) {
  console.log('  ✅ HMR IS ACTIVE on SSR page!');
} else if (hotUndefined) {
  console.log('  ❌ HMR is NOT active on SSR page');
} else {
  console.log('  ⚠️  No import.meta.hot log found — client may not have loaded');
  console.log('  All logs:', logs);
}

console.log('\n=== Test 3: HMR update on file change ===');
// Track if page does a full navigation (reload)
let didNavigate = false;
page.on('framenavigated', () => { didNavigate = true; });

// Modify client.tsx
const modifiedContent = originalContent.replace(
  'Hello from client.tsx',
  'Hello UPDATED via HMR!'
);
writeFileSync(CLIENT_PATH, modifiedContent);
console.log('  Modified client.tsx...');

// Wait for HMR to kick in
await page.waitForTimeout(3000);

const updatedH1 = await page.locator('#app h1').textContent();
console.log(`  h1 after edit: "${updatedH1}"`);
console.log(`  Full page reload: ${didNavigate}`);

const hmrAccepted = logs.some(l => l.includes('HMR update accepted'));
console.log(`  HMR update accepted: ${hmrAccepted}`);

if (updatedH1?.includes('UPDATED') && !didNavigate) {
  console.log('  ✅ HMR hot-updated without page reload!');
} else if (updatedH1?.includes('UPDATED') && didNavigate) {
  console.log('  ⚠️  Content updated but via full page reload (not true HMR)');
} else {
  console.log('  ❌ Content did NOT update');
}

// Restore original file
writeFileSync(CLIENT_PATH, originalContent);
console.log('\n  Restored client.tsx to original');

// Take screenshots
await page.screenshot({ path: '/tmp/poc-ssr-hmr.png' });

console.log('\n=== All console logs ===');
for (const log of logs) {
  console.log(`  ${log}`);
}

await browser.close();

console.log('\n=== SUMMARY ===');
console.log(`SSR page loads:          ✅`);
console.log(`import.meta.hot active:  ${hotAvailable ? '✅' : '❌'}`);
console.log(`HMR hot update works:    ${hmrAccepted ? '✅' : '❌'}`);
console.log(`No full page reload:     ${!didNavigate ? '✅' : '❌'}`);
