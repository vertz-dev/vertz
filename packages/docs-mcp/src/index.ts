export { buildIndex, search, tokenize } from './search';
export type { DocSource, DocsIndex, IndexedDoc, SearchHit } from './search';
export { getDoc, getExample, listGuides, searchDocs } from './tools';
export type {
  DocsBundle,
  GetDocInput,
  GetDocResult,
  GetExampleInput,
  GetExampleResult,
  GuideEntry,
  ListGuidesResult,
  SearchDocsInput,
  SearchDocsResult,
} from './tools';
export { createServer } from './server';
