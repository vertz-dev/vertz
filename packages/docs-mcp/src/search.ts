export interface DocSource {
  id: string;
  title: string;
  path: string;
  body: string;
}

export interface IndexedDoc {
  id: string;
  title: string;
  path: string;
  length: number;
  termFreq: Record<string, number>;
}

export interface DocsIndex {
  docs: IndexedDoc[];
  docFreq: Record<string, number>;
  avgLength: number;
}

export interface SearchHit {
  id: string;
  title: string;
  path: string;
  score: number;
}

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'with',
]);

export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/g);
  if (!matches) return [];
  return matches.filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function buildIndex(sources: readonly DocSource[]): DocsIndex {
  const docs: IndexedDoc[] = [];
  const docFreq: Record<string, number> = {};
  let totalLength = 0;

  for (const source of sources) {
    const tokens = tokenize(`${source.title} ${source.body}`);
    const termFreq: Record<string, number> = {};
    for (const token of tokens) {
      termFreq[token] = (termFreq[token] ?? 0) + 1;
    }
    for (const term of Object.keys(termFreq)) {
      docFreq[term] = (docFreq[term] ?? 0) + 1;
    }
    docs.push({
      id: source.id,
      title: source.title,
      path: source.path,
      length: tokens.length,
      termFreq,
    });
    totalLength += tokens.length;
  }

  return {
    docs,
    docFreq,
    avgLength: docs.length === 0 ? 0 : totalLength / docs.length,
  };
}

const K1 = 1.5;
const B = 0.75;

export function search(index: DocsIndex, query: string, limit: number = 5): SearchHit[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0 || index.docs.length === 0) return [];

  const N = index.docs.length;
  const hits: SearchHit[] = [];

  for (const doc of index.docs) {
    let score = 0;
    for (const term of queryTerms) {
      const tf = doc.termFreq[term] ?? 0;
      if (tf === 0) continue;
      const df = index.docFreq[term] ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const denom = tf + K1 * (1 - B + (B * doc.length) / Math.max(1, index.avgLength));
      score += (idf * (tf * (K1 + 1))) / denom;
    }
    if (score > 0) {
      hits.push({ id: doc.id, title: doc.title, path: doc.path, score });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
