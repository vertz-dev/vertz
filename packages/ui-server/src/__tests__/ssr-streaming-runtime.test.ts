import { describe, expect, it } from 'vitest';
import {
  createSSRDataChunk,
  getStreamingRuntimeScript,
  safeSerialize,
} from '../ssr-streaming-runtime';

describe('safeSerialize', () => {
  it('escapes </script> in string values', () => {
    const result = safeSerialize({ html: '</script><script>alert(1)</script>' });
    expect(result).not.toContain('</script>');
    expect(result).toContain('\\u003c');
    // Should still be valid JSON when unescaped
    expect(JSON.parse(result.replace(/\\u003c/g, '<'))).toEqual({
      html: '</script><script>alert(1)</script>',
    });
  });

  it('handles null, nested objects, arrays', () => {
    expect(safeSerialize(null)).toBe('null');
    expect(safeSerialize({ a: { b: [1, 2] } })).toBe('{"a":{"b":[1,2]}}');
    expect(safeSerialize([1, 'two', null])).toBe('[1,"two",null]');
  });
});

describe('getStreamingRuntimeScript', () => {
  it('returns script tag without nonce when no nonce provided', () => {
    const script = getStreamingRuntimeScript();
    expect(script).toContain('<script>');
    expect(script).not.toContain('nonce');
    expect(script).toContain('__VERTZ_SSR_DATA__');
    expect(script).toContain('__VERTZ_SSR_PUSH__');
    expect(script).toContain('</script>');
  });

  it('includes nonce attribute when nonce provided', () => {
    const script = getStreamingRuntimeScript('abc123');
    expect(script).toContain('nonce="abc123"');
    expect(script).toContain('__VERTZ_SSR_DATA__');
    expect(script).toContain('__VERTZ_SSR_PUSH__');
  });

  it('escapes nonce value to prevent attribute breakout', () => {
    const script = getStreamingRuntimeScript('a"b&c');
    expect(script).toContain('nonce="a&quot;b&amp;c"');
  });
});

describe('createSSRDataChunk', () => {
  it('produces valid script with safe-serialized data', () => {
    const chunk = createSSRDataChunk('my-key', { items: ['a', 'b'] });
    expect(chunk).toContain('<script>');
    expect(chunk).toContain('__VERTZ_SSR_PUSH__');
    expect(chunk).toContain('"my-key"');
    expect(chunk).toContain('{"items":["a","b"]}');
    expect(chunk).toContain('</script>');
  });

  it('includes nonce when provided', () => {
    const chunk = createSSRDataChunk('key', 'data', 'nonce123');
    expect(chunk).toContain('nonce="nonce123"');
  });

  it('escapes dangerous content in key', () => {
    const chunk = createSSRDataChunk('key</script><script>alert(1)', 'data');
    // The key should be escaped — no raw </script> breakout from key
    const scriptContent = chunk.slice(chunk.indexOf('>') + 1, chunk.lastIndexOf('</script>'));
    expect(scriptContent).not.toContain('</script>');
  });

  it('escapes dangerous content in data', () => {
    const chunk = createSSRDataChunk('key', { xss: '</script>' });
    expect(chunk).not.toContain('</script></script>');
    // The inner </script> in data should be escaped
    const scriptContent = chunk.slice(chunk.indexOf('>') + 1, chunk.lastIndexOf('</script>'));
    expect(scriptContent).not.toContain('</script>');
  });
});
