import { __append, __element, __staticText } from '../internals';
import { colors, symbols } from '../theme';
import type { TuiElement } from '../tui-element';

export interface SourceLine {
  number: number;
  text: string;
}

export interface DiagnosticItem {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  sourceLines?: SourceLine[];
  highlightStart?: number;
  highlightLength?: number;
  suggestion?: string;
}

export interface DiagnosticViewProps {
  diagnostics: DiagnosticItem[];
  showSource?: boolean;
  showSuggestions?: boolean;
}

export function DiagnosticView({
  diagnostics,
  showSource = true,
  showSuggestions = true,
}: DiagnosticViewProps): TuiElement {
  const box = __element('Box', 'direction', 'column', 'gap', 1);

  for (const diag of diagnostics) {
    const section = __element('Box', 'direction', 'column');

    const isError = diag.severity === 'error';
    const isWarning = diag.severity === 'warning';
    const icon = isError ? symbols.error : isWarning ? symbols.warning : symbols.info;
    const color = isError ? colors.error : isWarning ? colors.warning : colors.info;

    // Header
    const headerEl = __element('Text', 'color', color);
    __append(headerEl, __staticText(`${icon} ${diag.code}`));
    __append(section, headerEl);

    // Message
    const messageEl = __element('Text');
    __append(messageEl, __staticText(`  ${diag.message}`));
    __append(section, messageEl);

    // Location
    if (diag.file) {
      const location = `${diag.file}:${diag.line ?? 0}:${diag.column ?? 0}`;
      const locEl = __element('Text', 'dim', true);
      __append(locEl, __staticText(`  at ${location}`));
      __append(section, locEl);
    }

    // Source context
    if (showSource && diag.sourceLines && diag.sourceLines.length > 0) {
      const maxLineNum = Math.max(...diag.sourceLines.map((l) => l.number));
      const gutterWidth = String(maxLineNum).length;

      for (const line of diag.sourceLines) {
        const lineNum = String(line.number).padStart(gutterWidth);
        const srcEl = __element('Text');
        __append(srcEl, __staticText(`  ${lineNum} ${line.text}`));
        __append(section, srcEl);
      }

      if (
        diag.highlightStart !== undefined &&
        diag.highlightLength !== undefined &&
        diag.highlightLength > 0
      ) {
        const padding = ' '.repeat(diag.highlightStart + gutterWidth + 3);
        const underline = '^'.repeat(diag.highlightLength);
        const underlineEl = __element('Text', 'color', color);
        __append(underlineEl, __staticText(padding + underline));
        __append(section, underlineEl);
      }
    }

    // Suggestion
    if (showSuggestions && diag.suggestion) {
      const sugEl = __element('Text', 'color', colors.info);
      __append(sugEl, __staticText(`  ${symbols.info} ${diag.suggestion}`));
      __append(section, sugEl);
    }

    __append(box, section);
  }

  return box;
}
