import { describe, expect, it } from 'vitest';
import { createTemplateChunk } from '../template-chunk';

describe('createTemplateChunk', () => {
  it('creates a template element with v-tmpl-N id', () => {
    const html = createTemplateChunk(0, '<p>resolved</p>');
    expect(html).toContain('<template id="v-tmpl-0">');
    expect(html).toContain('<p>resolved</p>');
    expect(html).toContain('</template>');
  });

  it('includes a replacement script', () => {
    const html = createTemplateChunk(3, '<div>content</div>');
    expect(html).toContain('<script>');
    expect(html).toContain('v-slot-3');
    expect(html).toContain('v-tmpl-3');
    expect(html).toContain('</script>');
  });

  it('replacement script swaps placeholder with template content', () => {
    const html = createTemplateChunk(0, '<span>done</span>');
    // The script should reference the slot placeholder and template
    expect(html).toContain('document.getElementById("v-slot-0")');
    expect(html).toContain('document.getElementById("v-tmpl-0")');
    expect(html).toContain('replaceWith');
  });

  describe('CSP nonce support', () => {
    it('includes nonce attribute on script tag when provided', () => {
      const html = createTemplateChunk(0, '<p>resolved</p>', 'abc123');
      expect(html).toContain('<script nonce="abc123">');
      expect(html).not.toContain('<script>');
    });

    it('does not include nonce attribute when not provided', () => {
      const html = createTemplateChunk(0, '<p>resolved</p>');
      expect(html).toContain('<script>');
      expect(html).not.toContain('nonce=');
    });

    it('does not include nonce attribute when undefined', () => {
      const html = createTemplateChunk(0, '<p>resolved</p>', undefined);
      expect(html).toContain('<script>');
      expect(html).not.toContain('nonce=');
    });
  });
});
