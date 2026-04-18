// Type-level tests for generated service SDK types.
// Verifies compile-time guarantees that invalid usage is rejected.
// These interfaces mirror what ServiceTypesGenerator + ServiceSdkGenerator emit.

// ── Sample generated types ──

interface ParseAiInput {
  projectId: string;
  message: string;
}

interface ParseAiOutput {
  parsed: boolean;
  tokens?: number;
}

interface StatusAiOutput {
  status: string;
  updatedAt: string;
}

// ── Simulate SDK method signatures ──

declare function parse(body: ParseAiInput): { data: ParseAiOutput };
declare function statusAction(requestId: string): { data: StatusAiOutput };

// ── Positive cases (must compile) ──

const parsed = parse({ projectId: 'p1', message: 'hi' });
const _parsedFlag: boolean = parsed.data.parsed;
const _tokens: number | undefined = parsed.data.tokens;

const st = statusAction('req-123');
const _statusStr: string = st.data.status;

// ── Negative cases (must fail) ──

// @ts-expect-error — missing `message`
parse({ projectId: 'p1' });
// @ts-expect-error — wrong type for projectId
parse({ projectId: 42, message: 'hi' });
// @ts-expect-error — unknown key on input
parse({ projectId: 'p1', message: 'hi', extra: true });
// @ts-expect-error — missing path param
statusAction();
// @ts-expect-error — path param must be string
statusAction(123);
// @ts-expect-error — tokens is typed as number | undefined
const _bad: string = parsed.data.tokens;
