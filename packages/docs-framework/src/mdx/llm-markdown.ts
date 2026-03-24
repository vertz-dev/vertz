/**
 * Convert MDX content to plain markdown for LLM consumption.
 * Strips JSX components, import/export statements, and converts
 * built-in components to their markdown equivalents.
 */
export function mdxToMarkdown(content: string): string {
  let result = content;

  // Strip import statements (including multi-line)
  result = result.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  result = result.replace(/^import\s+['"][^'"]+['"];?\s*$/gm, '');

  // Strip export statements (but not export default with content)
  result = result.replace(
    /^export\s+(?:const|let|var|function|class|type|interface)\s+[\s\S]*?;\s*$/gm,
    '',
  );

  // Convert callout components: <Note>, <Warning>, <Tip>, <Info>
  result = convertCallout(result, 'Note');
  result = convertCallout(result, 'Warning');
  result = convertCallout(result, 'Tip');
  result = convertCallout(result, 'Info');

  // Convert <Steps>/<Step> to numbered list
  result = convertSteps(result);

  // Convert <Tabs>/<Tab> to labeled sections
  result = convertTabs(result);

  // Convert <Card> to bold title + content
  result = convertCards(result);

  // Strip <CodeGroup> wrapper, keep inner code blocks
  result = result.replace(/<\/?CodeGroup>/g, '');

  // Clean up excess blank lines
  result = result.replace(/\n{3,}/g, '\n\n');
  result = `${result.trim()}\n`;

  return result;
}

function convertCallout(content: string, tag: string): string {
  // Match both multi-line and single-line callouts
  const multiLineRe = new RegExp(`<${tag}>\\s*\\n([\\s\\S]*?)\\n</${tag}>`, 'g');
  const singleLineRe = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g');

  // Multi-line first — prefix each line with `>`
  let result = content.replace(multiLineRe, (_match, inner: string) => {
    const text = inner.trim();
    const lines = text.split('\n');
    return lines.map((line, i) => (i === 0 ? `> **${tag}:** ${line}` : `> ${line}`)).join('\n');
  });

  // Single-line callouts
  result = result.replace(singleLineRe, (_match, inner: string) => {
    return `> **${tag}:** ${inner.trim()}`;
  });

  return result;
}

function convertSteps(content: string): string {
  // Process each <Steps> block separately to reset numbering
  return content.replace(/<Steps>([\s\S]*?)<\/Steps>/g, (_match, block: string) => {
    let stepIndex = 0;
    return block.replace(
      /<Step\s+title="([^"]+)">\s*\n([\s\S]*?)\n<\/Step>/g,
      (_m, title: string, inner: string) => {
        stepIndex++;
        return `${stepIndex}. **${title}**\n\n   ${inner.trim()}`;
      },
    );
  });
}

function convertTabs(content: string): string {
  // Convert <Tab title="..."> to labeled sections
  const withTabs = content.replace(
    /<Tab\s+title="([^"]+)">\s*\n([\s\S]*?)\n<\/Tab>/g,
    (_match, title: string, inner: string) => {
      return `**${title}:**\n\n${inner.trim()}`;
    },
  );
  // Strip <Tabs> wrapper
  return withTabs.replace(/<\/?Tabs>/g, '');
}

function convertCards(content: string): string {
  return content.replace(
    /<Card\s+title="([^"]*)"[^>]*>\s*\n([\s\S]*?)\n<\/Card>/g,
    (_match, title: string, inner: string) => {
      return `**${title}**\n\n${inner.trim()}`;
    },
  );
}
