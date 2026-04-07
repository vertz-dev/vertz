/**
 * Highlight template variables ({{varName}}) in a prompt string.
 * Returns an array of segments: plain text and variable names.
 */
export interface PromptSegment {
  readonly type: 'text' | 'variable';
  readonly value: string;
}

const VARIABLE_RE = /\{\{(\w+)\}\}/g;

export function parsePromptSegments(text: string): readonly PromptSegment[] {
  const segments: PromptSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(VARIABLE_RE)) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'variable', value: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * Extract all template variable names from a prompt string.
 */
export function extractVariables(text: string): readonly string[] {
  const vars: string[] = [];
  for (const match of text.matchAll(VARIABLE_RE)) {
    if (!vars.includes(match[1])) {
      vars.push(match[1]);
    }
  }
  return vars;
}

export interface PromptEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly variables?: readonly string[];
}

export interface PromptInspectorProps {
  readonly value: string;
  readonly variables?: readonly string[];
}
