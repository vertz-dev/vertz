import { describe, expect, it } from '@vertz/test';
import { parseFrontmatter } from '../mdx/frontmatter';

describe('parseFrontmatter', () => {
  it('extracts title and description from frontmatter', () => {
    const content = `---
title: Getting Started
description: Learn how to set up the framework
---

# Getting Started

Some content.
`;
    const result = parseFrontmatter(content);
    expect(result.data.title).toBe('Getting Started');
    expect(result.data.description).toBe('Learn how to set up the framework');
  });

  it('returns content without frontmatter block', () => {
    const content = `---
title: Test
---

# Content

Body text.
`;
    const result = parseFrontmatter(content);
    expect(result.content).toBe('# Content\n\nBody text.\n');
  });

  it('handles content with no frontmatter', () => {
    const content = `# No Frontmatter

Just content.
`;
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({});
    expect(result.content).toBe(content);
  });

  it('handles empty frontmatter', () => {
    const content = `---
---

# Content
`;
    const result = parseFrontmatter(content);
    expect(result.data).toEqual({});
    expect(result.content).toBe('# Content\n');
  });

  it('extracts custom frontmatter fields', () => {
    const content = `---
title: Page
icon: settings
sidebarTitle: Custom Title
---

Content.
`;
    const result = parseFrontmatter(content);
    expect(result.data.title).toBe('Page');
    expect(result.data.icon).toBe('settings');
    expect(result.data.sidebarTitle).toBe('Custom Title');
  });

  it('handles multiline description', () => {
    const content = `---
title: Page
description: >
  A long description
  that spans multiple lines
---

Content.
`;
    const result = parseFrontmatter(content);
    expect(result.data.description).toBe('A long description that spans multiple lines');
  });
});
