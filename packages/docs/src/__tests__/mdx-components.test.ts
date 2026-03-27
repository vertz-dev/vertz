import { describe, expect, it } from 'bun:test';
import { Callout } from '../components/callout';
import { CardGroup } from '../components/card';
import { CodeGroup } from '../components/code-group';
import { Columns } from '../components/columns';
import { compileMdxToHtml } from '../dev/compile-mdx-html';

describe('Built-in MDX components', () => {
  describe('Callouts', () => {
    it('renders <Note> as a styled callout without import', async () => {
      const source = `
<Note>
This is a note.
</Note>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-callout="note"');
      expect(html).toContain('This is a note.');
    });

    it('renders <Tip> as a styled callout without import', async () => {
      const source = `
<Tip>
Helpful tip here.
</Tip>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-callout="tip"');
      expect(html).toContain('Helpful tip here.');
    });

    it('renders <Warning> as a styled callout without import', async () => {
      const source = `
<Warning>
Be careful!
</Warning>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-callout="warning"');
      expect(html).toContain('Be careful!');
    });

    it('renders <Info> as a styled callout without import', async () => {
      const source = `
<Info>
Additional context.
</Info>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-callout="info"');
      expect(html).toContain('Additional context.');
    });

    it('renders <Danger> as a styled callout without import', async () => {
      const source = `
<Danger>
Critical warning!
</Danger>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-callout="danger"');
      expect(html).toContain('Critical warning!');
    });

    it('renders <Check> as a styled callout without import', async () => {
      const source = `
<Check>
All good!
</Check>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-callout="check"');
      expect(html).toContain('All good!');
    });

    it('renders <Callout type="custom"> with custom title', async () => {
      const source = `
<Callout type="info" title="Custom Title">
Custom content.
</Callout>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-callout="info"');
      expect(html).toContain('Custom Title');
      expect(html).toContain('Custom content.');
    });
  });

  describe('CodeGroup', () => {
    it('renders tab headers from child code block titles', async () => {
      const source = `
<CodeGroup>

\`\`\`ts title="TypeScript"
const x = 1;
\`\`\`

\`\`\`js title="JavaScript"
const x = 1;
\`\`\`

</CodeGroup>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-code-group');
      expect(html).toContain('data-code-group-tabs');
      expect(html).toContain('data-code-group-tab');
      expect(html).toContain('TypeScript');
      expect(html).toContain('JavaScript');
    });

    it('first tab is active by default', async () => {
      const source = `
<CodeGroup>

\`\`\`ts title="TypeScript"
const x = 1;
\`\`\`

\`\`\`js title="JavaScript"
const x = 1;
\`\`\`

</CodeGroup>
`;
      const html = await compileMdxToHtml(source);
      // First tab should have aria-selected="true"
      const tabMatches = html.match(/<button[^>]*data-code-group-tab[^>]*>/g) ?? [];
      expect(tabMatches.length).toBe(2);
      expect(tabMatches[0]).toContain('aria-selected="true"');
      expect(tabMatches[1]).toContain('aria-selected="false"');
    });

    it('only first panel is visible by default', async () => {
      const source = `
<CodeGroup>

\`\`\`ts title="TypeScript"
const x = 1;
\`\`\`

\`\`\`js title="JavaScript"
const x = 1;
\`\`\`

</CodeGroup>
`;
      const html = await compileMdxToHtml(source);
      const panelMatches = html.match(/<div role="tabpanel" data-code-group-panel[^>]*>/g) ?? [];
      expect(panelMatches.length).toBe(2);
      // First panel visible, second hidden
      expect(panelMatches[0]).not.toContain('display:none');
      expect(panelMatches[1]).toContain('display:none');
    });

    it('tab bar has tablist role', async () => {
      const source = `
<CodeGroup>

\`\`\`ts title="schema.ts"
const schema = {};
\`\`\`

</CodeGroup>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('role="tablist"');
    });

    it('includes inline JS for tab switching', async () => {
      const source = `
<CodeGroup>

\`\`\`ts title="TypeScript"
const x = 1;
\`\`\`

\`\`\`js title="JavaScript"
const x = 1;
\`\`\`

</CodeGroup>
`;
      const html = await compileMdxToHtml(source);
      // Should have onclick handlers for switching
      expect(html).toContain('onclick=');
    });

    it('falls back to wrapper div when no code blocks are found', () => {
      const html = CodeGroup({ children: '<p>No code here</p>' });
      expect(html).toContain('data-code-group');
      expect(html).toContain('<p>No code here</p>');
      expect(html).not.toContain('data-code-group-tabs');
    });

    it('falls back to language class when no title is present', () => {
      const block =
        '<div data-code-block style="position:relative;overflow:hidden"><pre><code class="language-python"><span>x = 1</span></code></pre></div>';
      const html = CodeGroup({ children: block });
      expect(html).toContain('data-code-group-tabs');
      expect(html).toContain('>python</button>');
    });

    it('falls back to "Code" when no title and no language', () => {
      const block =
        '<div data-code-block style="position:relative;overflow:hidden"><pre><code>plain</code></pre></div>';
      const html = CodeGroup({ children: block });
      expect(html).toContain('>Code</button>');
    });

    it('strips data-code-title from panels (shown in tab bar instead)', async () => {
      const source = `
<CodeGroup>

\`\`\`ts title="schema.ts"
const schema = {};
\`\`\`

\`\`\`js title="config.js"
const config = {};
\`\`\`

</CodeGroup>
`;
      const html = await compileMdxToHtml(source);
      // Titles should appear in the tab bar buttons
      const tabSection = html.match(/<div data-code-group-tabs[^>]*>[\s\S]*?<\/div>/)?.[0] ?? '';
      expect(tabSection).toContain('schema.ts');
      expect(tabSection).toContain('config.js');
      // But NOT in the panel content (stripped)
      const panels = html.match(/<div data-code-group-panel[\s\S]*$/)?.[0] ?? '';
      expect(panels).not.toContain('data-code-title');
    });
  });

  describe('Steps', () => {
    it('renders numbered steps', async () => {
      const source = `
<Steps>
  <Step title="Install">
    Run the install command.
  </Step>
  <Step title="Configure">
    Edit the config file.
  </Step>
</Steps>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-steps');
      expect(html).toContain('Install');
      expect(html).toContain('Configure');
    });

    it('renders step with icon when icon prop is provided', async () => {
      const source = `
<Steps>
  <Step title="Set up database" icon="database">
    Configure your database connection.
  </Step>
</Steps>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-step');
      expect(html).toContain('data-icon="database"');
      expect(html).toContain('Set up database');
    });

    it('renders step without icon when icon prop is omitted', async () => {
      const source = `
<Steps>
  <Step title="Install">
    Run the install command.
  </Step>
</Steps>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-step');
      expect(html).not.toContain('data-icon');
    });
  });

  describe('Tabs', () => {
    it('renders switchable content tabs', async () => {
      const source = `
<Tabs>
  <Tab title="npm">
    npm install vertz
  </Tab>
  <Tab title="bun">
    bun add vertz
  </Tab>
</Tabs>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-tabs');
      expect(html).toContain('npm');
      expect(html).toContain('bun');
    });
  });

  describe('Card and CardGroup', () => {
    it('renders a card with title and icon', async () => {
      const source = `
<Card title="Getting Started" icon="rocket" href="/quickstart">
  Start building with Vertz.
</Card>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-card');
      expect(html).toContain('Getting Started');
      expect(html).toContain('Start building with Vertz.');
      expect(html).toContain('data-icon="rocket"');
    });

    it('renders a card without icon when icon prop is omitted', async () => {
      const source = `
<Card title="No Icon" href="/page">
  Content here.
</Card>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-card');
      expect(html).toContain('No Icon');
      expect(html).not.toContain('data-icon');
    });

    it('renders a responsive card grid', async () => {
      const source = `
<CardGroup cols={2}>
  <Card title="One">First</Card>
  <Card title="Two">Second</Card>
</CardGroup>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-card-group');
    });
  });

  describe('Accordion', () => {
    it('renders collapsible sections', async () => {
      const source = `
<Accordion title="FAQ Item">
  Answer to the question.
</Accordion>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-accordion');
      expect(html).toContain('FAQ Item');
      expect(html).toContain('Answer to the question.');
    });

    it('renders AccordionGroup', async () => {
      const source = `
<AccordionGroup>
  <Accordion title="Q1">Answer 1</Accordion>
  <Accordion title="Q2">Answer 2</Accordion>
</AccordionGroup>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-accordion-group');
    });
  });

  describe('Frame', () => {
    it('renders a frame container', async () => {
      const source = `
<Frame caption="Screenshot of the dashboard">
  <img src="/screenshot.png" alt="Dashboard" />
</Frame>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-frame');
      expect(html).toContain('Screenshot of the dashboard');
    });
  });

  describe('Columns', () => {
    it('renders a multi-column layout', async () => {
      const source = `
<Columns>
  <Column>
    Left side content.
  </Column>
  <Column>
    Right side content.
  </Column>
</Columns>
`;
      const html = await compileMdxToHtml(source);
      expect(html).toContain('data-columns');
      expect(html).toContain('Left side content.');
      expect(html).toContain('Right side content.');
    });

    it('respects cols prop', () => {
      const html = Columns({ cols: 3, children: 'content' });
      expect(html).toContain('repeat(3,1fr)');
    });

    it('defaults to 2 columns when cols is not provided', () => {
      const html = Columns({ children: 'content' });
      expect(html).toContain('repeat(2,1fr)');
    });
  });

  describe('Component edge cases', () => {
    it('Callout falls back to note style for unknown type', () => {
      const html = Callout({ type: 'unknown', children: 'test' });
      expect(html).toContain('data-callout="note"');
    });

    it('CardGroup defaults cols to 2 for invalid input', () => {
      const html = CardGroup({ cols: 'abc', children: 'content' });
      expect(html).toContain('repeat(2,1fr)');
    });
  });
});
