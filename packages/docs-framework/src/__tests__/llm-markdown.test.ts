import { describe, expect, it } from 'bun:test';
import { mdxToMarkdown } from '../mdx/llm-markdown';

describe('mdxToMarkdown', () => {
  it('passes through plain markdown unchanged', () => {
    const md = `# Hello World

This is a paragraph.

- Item 1
- Item 2
`;
    expect(mdxToMarkdown(md)).toBe(md);
  });

  it('converts <Note> component to blockquote', () => {
    const input = `<Note>
This is important.
</Note>`;
    const output = mdxToMarkdown(input);
    expect(output).toBe('> **Note:** This is important.\n');
  });

  it('converts <Warning> component to blockquote', () => {
    const input = `<Warning>
Be careful here.
</Warning>`;
    const output = mdxToMarkdown(input);
    expect(output).toBe('> **Warning:** Be careful here.\n');
  });

  it('converts <Tip> component to blockquote', () => {
    const input = `<Tip>
A helpful tip.
</Tip>`;
    const output = mdxToMarkdown(input);
    expect(output).toBe('> **Tip:** A helpful tip.\n');
  });

  it('converts <Info> component to blockquote', () => {
    const input = `<Info>
Some information.
</Info>`;
    const output = mdxToMarkdown(input);
    expect(output).toBe('> **Info:** Some information.\n');
  });

  it('converts <CodeGroup> with labeled code blocks', () => {
    const input = `<CodeGroup>
\`\`\`ts title="TypeScript"
const x = 1;
\`\`\`

\`\`\`js title="JavaScript"
const x = 1;
\`\`\`
</CodeGroup>`;
    const output = mdxToMarkdown(input);
    expect(output).toContain('```ts');
    expect(output).toContain('```js');
    expect(output).not.toContain('<CodeGroup>');
  });

  it('strips import statements', () => {
    const input = `import { Note } from '@vertz/docs/components';

# Title

Content here.
`;
    const output = mdxToMarkdown(input);
    expect(output).not.toContain('import');
    expect(output).toContain('# Title');
    expect(output).toContain('Content here.');
  });

  it('strips export statements', () => {
    const input = `export const metadata = { title: 'Test' };

# Title
`;
    const output = mdxToMarkdown(input);
    expect(output).not.toContain('export');
    expect(output).toContain('# Title');
  });

  it('converts <Steps> with numbered steps', () => {
    const input = `<Steps>
<Step title="Install">
Run \`bun add @vertz/docs\`.
</Step>
<Step title="Configure">
Create a config file.
</Step>
</Steps>`;
    const output = mdxToMarkdown(input);
    expect(output).toContain('1. **Install**');
    expect(output).toContain('2. **Configure**');
    expect(output).not.toContain('<Steps>');
  });

  it('converts <Tabs> to labeled sections', () => {
    const input = `<Tabs>
<Tab title="npm">
\`\`\`bash
npm install
\`\`\`
</Tab>
<Tab title="bun">
\`\`\`bash
bun install
\`\`\`
</Tab>
</Tabs>`;
    const output = mdxToMarkdown(input);
    expect(output).toContain('**npm:**');
    expect(output).toContain('**bun:**');
    expect(output).not.toContain('<Tabs>');
  });

  it('strips <Card> wrappers but keeps content', () => {
    const input = `<Card title="Getting Started" href="/quickstart">
Learn how to get started.
</Card>`;
    const output = mdxToMarkdown(input);
    expect(output).toContain('**Getting Started**');
    expect(output).toContain('Learn how to get started.');
    expect(output).not.toContain('<Card');
  });

  it('converts single-line callouts', () => {
    const input = '<Note>Quick note.</Note>';
    const output = mdxToMarkdown(input);
    expect(output).toBe('> **Note:** Quick note.\n');
  });

  it('handles multi-paragraph callouts with proper blockquote', () => {
    const input = `<Note>
First paragraph.

Second paragraph.
</Note>`;
    const output = mdxToMarkdown(input);
    expect(output).toContain('> **Note:** First paragraph.');
    expect(output).toContain('> ');
    expect(output).toContain('> Second paragraph.');
  });

  it('resets step numbering between separate Steps blocks', () => {
    const input = `<Steps>
<Step title="A">
First block step A.
</Step>
<Step title="B">
First block step B.
</Step>
</Steps>

<Steps>
<Step title="X">
Second block step X.
</Step>
</Steps>`;
    const output = mdxToMarkdown(input);
    expect(output).toContain('1. **A**');
    expect(output).toContain('2. **B**');
    expect(output).toContain('1. **X**');
  });

  it('converts <Danger> component to blockquote', () => {
    const input = `<Danger>
Critical issue!
</Danger>`;
    const output = mdxToMarkdown(input);
    expect(output).toBe('> **Danger:** Critical issue!\n');
  });

  it('converts <Check> component to blockquote', () => {
    const input = `<Check>
All good!
</Check>`;
    const output = mdxToMarkdown(input);
    expect(output).toBe('> **Check:** All good!\n');
  });

  it('converts <Accordion> to bold title + content', () => {
    const input = `<Accordion title="FAQ Item">
Answer to the question.
</Accordion>`;
    const output = mdxToMarkdown(input);
    expect(output).toContain('**FAQ Item**');
    expect(output).toContain('Answer to the question.');
    expect(output).not.toContain('<Accordion');
  });

  it('strips AccordionGroup wrapper', () => {
    const input = `<AccordionGroup>
<Accordion title="Q1">
Answer 1
</Accordion>
</AccordionGroup>`;
    const output = mdxToMarkdown(input);
    expect(output).not.toContain('<AccordionGroup');
    expect(output).toContain('**Q1**');
  });

  it('converts <Frame> to content + caption', () => {
    const input = `<Frame caption="Screenshot">
![Dashboard](/screenshot.png)
</Frame>`;
    const output = mdxToMarkdown(input);
    expect(output).toContain('![Dashboard](/screenshot.png)');
    expect(output).toContain('*Screenshot*');
    expect(output).not.toContain('<Frame');
  });

  it('strips CardGroup wrapper', () => {
    const input = `<CardGroup cols={2}>
<Card title="One">
First
</Card>
</CardGroup>`;
    const output = mdxToMarkdown(input);
    expect(output).not.toContain('<CardGroup');
    expect(output).toContain('**One**');
  });

  it('strips Columns/Column wrappers', () => {
    const input = `<Columns>
<Column>
Left content.
</Column>
<Column>
Right content.
</Column>
</Columns>`;
    const output = mdxToMarkdown(input);
    expect(output).not.toContain('<Columns');
    expect(output).not.toContain('<Column');
    expect(output).toContain('Left content.');
    expect(output).toContain('Right content.');
  });

  it('handles multiple conversions in one document', () => {
    const input = `import { Note, Warning } from '@vertz/docs/components';

# Guide

<Note>
Read this first.
</Note>

Some content.

<Warning>
Be careful.
</Warning>
`;
    const output = mdxToMarkdown(input);
    expect(output).toContain('# Guide');
    expect(output).toContain('> **Note:** Read this first.');
    expect(output).toContain('Some content.');
    expect(output).toContain('> **Warning:** Be careful.');
  });
});
