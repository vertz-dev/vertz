import { describe, expect, it } from '@vertz/test';
import { Expandable } from '../components/expandable';
import { Icon } from '../components/icon';
import { ParamField } from '../components/param-field';
import { ResponseField } from '../components/response-field';
import { Tooltip } from '../components/tooltip';
import { compileMdxToHtml } from '../dev/compile-mdx-html';
import { mdxToMarkdown } from '../mdx/llm-markdown';

describe('API docs components', () => {
  describe('ParamField', () => {
    it('renders name, type, and required badge', () => {
      const html = ParamField({
        name: 'userId',
        type: 'string',
        required: true,
        children: 'The user ID',
      });
      expect(html).toContain('data-param-field');
      expect(html).toContain('userId');
      expect(html).toContain('string');
      expect(html).toContain('Required');
      expect(html).toContain('The user ID');
    });

    it('renders optional param without required badge', () => {
      const html = ParamField({ name: 'limit', type: 'number', children: 'Max results' });
      expect(html).not.toContain('Required');
      expect(html).toContain('limit');
      expect(html).toContain('number');
    });

    it('renders location badge (path, body, query, header)', () => {
      const html = ParamField({
        name: 'id',
        type: 'string',
        location: 'path',
        children: 'Resource ID',
      });
      expect(html).toContain('path');
    });

    it('renders via MDX without import', async () => {
      const source = `
<ParamField name="token" type="string" required>
  Auth token.
</ParamField>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-param-field');
      expect(html).toContain('token');
    });
  });

  describe('ResponseField', () => {
    it('renders name and type', () => {
      const html = ResponseField({ name: 'data', type: 'object', children: 'Response body' });
      expect(html).toContain('data-response-field');
      expect(html).toContain('data');
      expect(html).toContain('object');
      expect(html).toContain('Response body');
    });

    it('renders nested structure', async () => {
      const source = `
<ResponseField name="user" type="object">
  The user object.
  <ResponseField name="id" type="string">
    User ID.
  </ResponseField>
</ResponseField>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-response-field');
      // Should have nested fields
      const matches = html.match(/data-response-field/g);
      expect(matches?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Expandable', () => {
    it('renders collapsible section', () => {
      const html = Expandable({ title: 'Advanced', children: 'Hidden content' });
      expect(html).toContain('data-expandable');
      expect(html).toContain('Advanced');
      expect(html).toContain('Hidden content');
    });
  });

  describe('Tooltip', () => {
    it('renders tooltip with tip text', () => {
      const html = Tooltip({ tip: 'More info here', children: 'Hover me' });
      expect(html).toContain('data-tooltip');
      expect(html).toContain('More info here');
      expect(html).toContain('Hover me');
    });

    it('exports CSS for hover show/hide', async () => {
      const { TOOLTIP_STYLES } = await import('../components/tooltip');
      expect(TOOLTIP_STYLES).toContain('[data-tooltip]:hover');
      expect(TOOLTIP_STYLES).toContain('[data-tooltip-text]');
      expect(TOOLTIP_STYLES).toContain('display: block');
    });
  });

  describe('Icon', () => {
    it('renders SVG by name', () => {
      const html = Icon({ name: 'rocket' });
      expect(html).toContain('data-icon');
      // Should contain an SVG or icon indicator
      expect(html).toContain('rocket');
    });

    it('sanitizes size prop to prevent XSS', () => {
      const html = Icon({ name: 'test', size: '16px" onmouseover="alert(1)' });
      // Should parse to a number, not inject the raw string
      expect(html).not.toContain('onmouseover');
      expect(html).not.toContain('alert(1)');
      // NaN from parseInt falls back to 16
      expect(html).toContain('16px');
    });
  });

  describe('LLM markdown conversion', () => {
    it('converts ParamField to readable format', () => {
      const md = mdxToMarkdown(`<ParamField name="userId" type="string" required>
The user ID.
</ParamField>`);
      expect(md).toContain('userId');
      expect(md).toContain('string');
      expect(md).toContain('required');
    });

    it('converts ResponseField to readable format', () => {
      const md = mdxToMarkdown(`<ResponseField name="data" type="object">
Response body.
</ResponseField>`);
      expect(md).toContain('data');
      expect(md).toContain('object');
    });

    it('converts Tooltip to plain text', () => {
      const md = mdxToMarkdown('<Tooltip tip="More info">Hover me</Tooltip>');
      expect(md).toContain('Hover me');
    });

    it('strips Expandable wrapper, keeps content', () => {
      const md = mdxToMarkdown(`<Expandable title="Details">
Content inside.
</Expandable>`);
      expect(md).toContain('Details');
      expect(md).toContain('Content inside.');
    });
  });
});
