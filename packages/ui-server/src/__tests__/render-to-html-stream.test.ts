/**
 * Tests for renderToHTMLStream() — the streaming SSR API.
 */
import { describe, expect, it } from 'vitest';
import { query } from '../../../ui/src/query/query';
import { installDomShim, removeDomShim } from '../dom-shim';
import type { RenderToHTMLStreamOptions } from '../render-to-html';
import { renderToHTML, renderToHTMLStream } from '../render-to-html';
import { collectStreamChunks } from '../streaming';
import type { VNode } from '../types';

/**
 * Create a deferred promise that can be resolved externally.
 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('renderToHTMLStream', () => {
  it('returns a Response with streaming body', async () => {
    function App(): VNode {
      return { tag: 'div', attrs: { id: 'app' }, children: ['Hello'] };
    }

    const response = await renderToHTMLStream({
      app: App,
      url: '/',
    });

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const text = await response.text();
    expect(text).toContain('Hello');
  });

  it('fast query produces data in initial HTML with no streaming scripts', async () => {
    function App(): VNode {
      const items = query(() => Promise.resolve(['Task 1', 'Task 2']), {
        key: 'stream-fast',
        ssrTimeout: 500,
      });
      const data = items.data as unknown as { value: string[] | undefined };
      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [data.value ? data.value.join(', ') : 'Loading...'],
      };
    }

    const response = await renderToHTMLStream({ app: App, url: '/' });
    const text = await response.text();

    expect(text).toContain('Task 1, Task 2');
    expect(text).not.toContain('__VERTZ_SSR_PUSH__');
  });

  it('slow query produces loading in initial HTML, data script streamed after', async () => {
    const slow = deferred<string[]>();

    function App(): VNode {
      const items = query(() => slow.promise, {
        key: 'stream-slow',
        ssrTimeout: 10,
      });
      const data = items.data as unknown as { value: string[] | undefined };
      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [data.value ? data.value.join(', ') : 'Loading...'],
      };
    }

    const response = await renderToHTMLStream({ app: App, url: '/' });

    // Resolve the slow query after initial HTML is sent
    slow.resolve(['Streamed A', 'Streamed B']);

    const text = await response.text();

    // Initial HTML should have loading state
    expect(text).toContain('Loading...');
    // Streamed data should appear as a push script
    expect(text).toContain('__VERTZ_SSR_PUSH__');
    expect(text).toContain('Streamed A');
    expect(text).toContain('Streamed B');
  });

  it('includes nonce in streaming scripts when provided', async () => {
    const slow = deferred<string>();

    function App(): VNode {
      const item = query(() => slow.promise, {
        key: 'stream-nonce',
        ssrTimeout: 10,
      });
      const data = item.data as unknown as { value: string | undefined };
      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [data.value ?? 'Loading...'],
      };
    }

    const response = await renderToHTMLStream({
      app: App,
      url: '/',
      nonce: 'test-nonce-123',
    });

    slow.resolve('nonce data');
    const text = await response.text();

    expect(text).toContain('nonce="test-nonce-123"');
    expect(text).toContain('__VERTZ_SSR_PUSH__');
  });

  it('renderToHTML() still returns Promise<string> (backward compat)', async () => {
    function App(): VNode {
      return { tag: 'div', attrs: { id: 'app' }, children: ['Compat'] };
    }

    const html = await renderToHTML({ app: App, url: '/' });

    expect(typeof html).toBe('string');
    expect(html).toContain('Compat');
  });

  it('hard timeout closes stream, remaining queries abandoned', async () => {
    const neverResolves = deferred<string>();

    function App(): VNode {
      const item = query(() => neverResolves.promise, {
        key: 'stream-timeout',
        ssrTimeout: 10,
      });
      const data = item.data as unknown as { value: string | undefined };
      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [data.value ?? 'Loading...'],
      };
    }

    const response = await renderToHTMLStream({
      app: App,
      url: '/',
      streamTimeout: 50,
    });

    const text = await response.text();

    // Initial HTML should have loading state
    expect(text).toContain('Loading...');
    // Runtime script is injected (it defines __VERTZ_SSR_PUSH__),
    // but no actual push CALL should appear because the query never resolved
    expect(text).toContain('__VERTZ_SSR_PUSH__=function');
    expect(text).not.toContain('__VERTZ_SSR_PUSH__(');
  });

  it('ssrTimeout: 0 produces no registration and no streaming', async () => {
    function App(): VNode {
      const items = query(() => Promise.resolve(['Fetched']), {
        key: 'stream-disabled',
        ssrTimeout: 0,
      });
      const data = items.data as unknown as { value: string[] | undefined };
      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [data.value ? data.value.join(', ') : 'Loading...'],
      };
    }

    const response = await renderToHTMLStream({ app: App, url: '/' });
    const text = await response.text();

    expect(text).toContain('Loading...');
    expect(text).not.toContain('__VERTZ_SSR_PUSH__');
    expect(text).not.toContain('Fetched');
  });

  it('global ssrTimeout override applies to queries without per-query timeout', async () => {
    const slow = deferred<string>();

    function App(): VNode {
      // No per-query ssrTimeout — should use global default
      const item = query(() => slow.promise, { key: 'stream-global-timeout' });
      const data = item.data as unknown as { value: string | undefined };
      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [data.value ?? 'Loading...'],
      };
    }

    // Set global ssrTimeout to 10ms — slow enough that our deferred won't resolve
    const response = await renderToHTMLStream({
      app: App,
      url: '/',
      ssrTimeout: 10,
    });

    // Resolve after the global ssrTimeout (10ms) has passed
    slow.resolve('Global Timeout Data');
    const text = await response.text();

    // With a 10ms global timeout, the query timed out during pass 1
    // so it shows Loading... in the initial HTML and data is streamed
    expect(text).toContain('Loading...');
    expect(text).toContain('Global Timeout Data');
    expect(text).toContain('__VERTZ_SSR_PUSH__');
  });

  it('data containing </script> is properly escaped (XSS prevention)', async () => {
    const slow = deferred<{ html: string }>();

    function App(): VNode {
      const item = query(() => slow.promise, {
        key: 'stream-xss',
        ssrTimeout: 10,
      });
      const data = item.data as unknown as { value: { html: string } | undefined };
      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [data.value ? data.value.html : 'Loading...'],
      };
    }

    const response = await renderToHTMLStream({ app: App, url: '/' });

    slow.resolve({ html: '</script><script>alert("xss")</script>' });
    const text = await response.text();

    // The data should be escaped — no raw </script> inside the data chunk
    // Count the </script> tags — should only be the closing tags of actual scripts
    const pushScriptMatch = text.match(/__VERTZ_SSR_PUSH__\(/);
    expect(pushScriptMatch).not.toBeNull();

    // The escaped data should use \u003c not <
    expect(text).toContain('\\u003c');
    // There should be no </script> breakout in the serialized data
    expect(text).not.toContain('</script><script>alert');
  });

  it('mixed fast + slow: fast data in initial chunk, slow data streamed', async () => {
    const slow = deferred<string>();

    function App(): VNode {
      const fast = query(() => Promise.resolve('Fast Result'), {
        key: 'stream-mixed-fast',
        ssrTimeout: 500,
      });
      const slowItem = query(() => slow.promise, {
        key: 'stream-mixed-slow',
        ssrTimeout: 10,
      });
      const fastData = fast.data as unknown as { value: string | undefined };
      const slowData = slowItem.data as unknown as { value: string | undefined };
      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [
          { tag: 'div', attrs: { id: 'fast' }, children: [fastData.value ?? 'Fast Loading...'] },
          { tag: 'div', attrs: { id: 'slow' }, children: [slowData.value ?? 'Slow Loading...'] },
        ],
      };
    }

    const response = await renderToHTMLStream({ app: App, url: '/' });

    slow.resolve('Slow Streamed');
    const text = await response.text();

    // Fast data should be in the initial HTML
    expect(text).toContain('Fast Result');
    expect(text).not.toContain('Fast Loading...');
    // Slow data should be streamed
    expect(text).toContain('Slow Loading...');
    expect(text).toContain('Slow Streamed');
    expect(text).toContain('__VERTZ_SSR_PUSH__');
  });

  it('cleanup runs after stream is fully consumed, not before', async () => {
    const slow = deferred<string>();

    function App(): VNode {
      const item = query(() => slow.promise, {
        key: 'stream-cleanup-timing',
        ssrTimeout: 10,
      });
      const data = item.data as unknown as { value: string | undefined };
      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [data.value ?? 'Loading...'],
      };
    }

    const response = await renderToHTMLStream({ app: App, url: '/', ssrTimeout: 10 });

    // At this point, the Response has been returned but the stream is NOT consumed yet.
    // The global ssrTimeout should NOT have been cleared yet (because the stream is still open).
    // Resolve the slow query — this should succeed because cleanup hasn't run yet.
    slow.resolve('Cleanup Test Data');

    const text = await response.text();

    // The stream should have completed successfully
    expect(text).toContain('Loading...');
    expect(text).toContain('Cleanup Test Data');
  });

  it('failed slow query does not crash, remaining queries still stream', async () => {
    const failing = deferred<string>();
    const succeeding = deferred<string>();

    function App(): VNode {
      const fail = query(() => failing.promise, {
        key: 'stream-fail',
        ssrTimeout: 10,
      });
      const ok = query(() => succeeding.promise, {
        key: 'stream-ok',
        ssrTimeout: 10,
      });
      const failData = fail.data as unknown as { value: string | undefined };
      const okData = ok.data as unknown as { value: string | undefined };
      return {
        tag: 'div',
        attrs: { id: 'app' },
        children: [failData.value ?? 'Fail Loading', okData.value ?? 'OK Loading'],
      };
    }

    const response = await renderToHTMLStream({ app: App, url: '/' });

    // Reject one, resolve the other
    failing.reject(new Error('network error'));
    succeeding.resolve('Success Data');

    const text = await response.text();

    // The successful query should have been streamed
    expect(text).toContain('Success Data');
    // The failed one should not have a push script
    expect(text).not.toContain('stream-fail');
  });
});
