import type { BundledLanguage, BundledTheme, HighlighterGeneric } from 'shiki';

type Highlighter = HighlighterGeneric<BundledLanguage, BundledTheme>;
type SupportedLang = 'tsx' | 'ts' | 'bash' | 'json';

let highlighter: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Initialize the Shiki highlighter singleton.
 * Safe to call multiple times — subsequent calls return the existing promise.
 */
export async function initHighlighter(): Promise<void> {
  if (highlighterPromise) {
    await highlighterPromise;
    return;
  }

  highlighterPromise = (async () => {
    const { createHighlighter } = await import('shiki');
    const instance = await createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: ['tsx', 'ts', 'bash', 'json'],
    });
    highlighter = instance;
    notifyReady();
    return instance;
  })();

  await highlighterPromise;
}

/** Returns true if the highlighter is ready for synchronous use. */
export function isHighlighterReady(): boolean {
  return highlighter !== null;
}

/** Returns the initialization promise, or null if not started. */
export function getHighlighterPromise(): Promise<Highlighter> | null {
  return highlighterPromise;
}

/** Register a callback to fire when the highlighter becomes ready. */
const readyCallbacks: Array<() => void> = [];

export function onHighlighterReady(callback: () => void): void {
  if (highlighter) {
    callback();
  } else {
    readyCallbacks.push(callback);
  }
}

function notifyReady(): void {
  for (const cb of readyCallbacks) cb();
  readyCallbacks.length = 0;
}

/** Reset highlighter state. For testing only. */
export function __resetHighlighter(): void {
  highlighter = null;
  highlighterPromise = null;
  readyCallbacks.length = 0;
}

/**
 * Highlight code synchronously. Returns HTML string or null if not initialized.
 * Uses `github-dark` theme by default.
 */
export function highlightCode(
  code: string,
  lang: SupportedLang,
  theme: string = 'github-dark',
): string | null {
  if (!highlighter) return null;
  return highlighter.codeToHtml(code, { lang, theme });
}
