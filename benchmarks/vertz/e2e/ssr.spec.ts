import { test, expect } from '@playwright/test';

test.describe('SSR content verification', () => {
  test('Home page HTML contains pre-rendered content', async ({ request }) => {
    const response = await request.get('/', {
      headers: { accept: 'text/html' },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');

    const html = await response.text();
    expect(html).toContain('Benchmark App');
    expect(html).toContain('<h1');
  });

  test('Dashboard HTML contains pre-rendered stat labels and values', async ({ request }) => {
    const response = await request.get('/dashboard', {
      headers: { accept: 'text/html' },
    });

    const html = await response.text();
    expect(html).toContain('Total Users');
    expect(html).toContain('12,345');
    expect(html).toContain('Revenue');
    expect(html).toContain('$98,765');
  });

  test('Blog HTML contains post titles and search placeholder', async ({ request }) => {
    const response = await request.get('/blog', {
      headers: { accept: 'text/html' },
    });

    const html = await response.text();
    expect(html).toContain('Blog Post 1');
    expect(html).toContain('Search posts...');
  });

  test('Theme CSS is present in HTML', async ({ request }) => {
    const response = await request.get('/', {
      headers: { accept: 'text/html' },
    });

    const html = await response.text();
    expect(html).toContain('data-vertz-css');
  });
});
