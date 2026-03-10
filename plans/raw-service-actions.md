# Design: Content Descriptors — Flexible Content Types for service() Actions

## Context

Customer feedback: a developer trying to build a SAML IdP mock server couldn't use Vertz because `service()` actions are locked to JSON-in/JSON-out. They need to serve XML metadata, return HTML auto-submit forms, and handle non-JSON flows.

The **primitives already exist** — `service()` with `actions` is the right abstraction. The gap is that `body` and `response` only accept JSON schemas (`s.object()`, `s.string()`, etc.), so all actions are JSON-in/JSON-out.

### Design principle

**JSON endpoints must always have schemas** — no untyped JSON. We don't make schemas optional. Instead, we introduce `content.*` descriptors — a parallel to `s.*` schemas that describe non-JSON content types. Same `body`/`response` properties, smarter values.

- `s.*` = data schemas (JSON, validated, fully typed)
- `content.*` = HTTP content type descriptors (XML, HTML, text, binary — typed but content-type-aware)

Both implement `SchemaLike`, both flow through the same pipeline. Content descriptors also carry HTTP metadata (content type, parsing strategy) for the route generator and SDK codegen.

This parallels `rules.*` for access — declarative, inspectable descriptors the framework can analyze.

### Where the JSON lock-in lives

1. **`ServiceActionDef.body` only accepts `SchemaLike`** — assumes JSON-parseable input
2. **`ServiceActionDef.response` only accepts `SchemaLike`** — assumes JSON output
3. **Service route generator always calls `jsonResponse()`** — wraps every handler result in JSON
4. **`parseBody()` in core doesn't handle `application/xml`** — returns `undefined`
5. **Service handlers have no access to request metadata** — can't read raw headers, URL, etc.

---

## API Surface

### Current: JSON-only actions (unchanged)

```typescript
service('auth', {
  actions: {
    login: {
      method: 'POST',
      body: s.object({ email: s.email(), password: s.string() }),
      response: s.object({ token: s.string() }),
      handler: async (input, ctx) => {
        // input: { email: string; password: string } — validated
        return { token: generateToken(input.email) };
      },
    },
  },
  access: { login: rules.public },
});
```

### Proposed: `content.*` descriptors for non-JSON

#### Example 1: XML GET endpoint (SAML IdP metadata)

```typescript
import { content } from '@vertz/server';

service('saml', {
  actions: {
    metadata: {
      method: 'GET',
      // No body — GET request
      response: content.xml(),  // output is XML string, content-type: application/xml
      handler: async (_input, ctx) => {
        // return type: string (inferred from content.xml())
        return generateSamlMetadata(ctx.tenantId);
        // Framework wraps in Response with content-type: application/xml
      },
    },
  },
  access: { metadata: rules.public },
});
// Route: GET /api/saml/metadata → Response(xml, { content-type: application/xml })
```

#### Example 2: HTML response (SAML IdP SSO — auto-submit form)

A SAML IdP's SSO endpoint receives an AuthnRequest via query params (HTTP-Redirect binding) and returns an HTML auto-submit form that POSTs the SAMLResponse to the SP's ACS URL.

```typescript
service('saml', {
  actions: {
    sso: {
      method: 'GET',
      // No body — AuthnRequest arrives as query params (SAMLRequest, RelayState)
      response: content.html(),  // output is HTML auto-submit form
      handler: async (_input, ctx) => {
        const samlRequest = ctx.request.headers.get('x-query-samlrequest') ?? '';
        const samlResponse = buildSamlResponse(samlRequest);
        return `
          <html><body onload="document.forms[0].submit()">
            <form method="POST" action="${spAcsUrl}">
              <input type="hidden" name="SAMLResponse" value="${samlResponse}" />
            </form>
          </body></html>
        `;
      },
    },
  },
  access: { sso: rules.public },
});
```

#### Example 3: Mixed content types — form-urlencoded in, JSON out

Note: core's `parseBody()` already handles `application/x-www-form-urlencoded` as an object. Regular `s.object()` schemas work for form-urlencoded input — no content descriptor needed.

```typescript
service('saml', {
  actions: {
    // SP's ACS endpoint: receives form-urlencoded SAMLResponse, returns JSON
    processAssertion: {
      method: 'POST',
      body: s.object({ SAMLResponse: s.string(), RelayState: s.string().optional() }),
      response: s.object({ userId: s.string(), attributes: s.record(s.string()) }),
      handler: async (input, ctx) => {
        const xml = Buffer.from(input.SAMLResponse, 'base64').toString();
        const parsed = parseSamlAssertion(xml);
        return { userId: parsed.nameId, attributes: parsed.attributes };
      },
    },
  },
  access: { processAssertion: rules.public },
});
```

#### Example 4: XML POST — XML in, XML out

```typescript
service('import', {
  actions: {
    spreadsheet: {
      method: 'POST',
      body: content.xml(),  // accepts XML string
      response: s.object({ imported: s.number() }),  // returns JSON
      handler: async (input, ctx) => {
        const rows = parseSpreadsheetXml(input);  // input: string
        return { imported: rows.length };
      },
    },
  },
  access: { spreadsheet: rules.authenticated() },
});
```

#### Example 5: Plain text

```typescript
service('health', {
  actions: {
    check: {
      method: 'GET',
      response: content.text(),
      handler: async () => 'OK',
    },
  },
  access: { check: rules.public },
});
```

### Content descriptor API (initial implementation)

```typescript
// String-typed content descriptors
content.xml()    // application/xml → string
content.html()   // text/html → string
content.text()   // text/plain → string

// Binary content descriptor
content.binary()                     // application/octet-stream → Uint8Array
content.binary({ maxSize: 10_000 })  // with size limit in bytes
```

### ContentDescriptor type

```typescript
/**
 * A content type descriptor that implements SchemaLike.
 * Carries HTTP metadata alongside parse/validate behavior.
 */
interface ContentDescriptor<T> extends SchemaLike<T> {
  /** Discriminator — distinguishes from plain SchemaLike */
  readonly _kind: 'content';
  /** MIME type for HTTP headers */
  readonly _contentType: string;
}

// Runtime check helper
function isContentDescriptor(value: SchemaLike<unknown>): value is ContentDescriptor<unknown> {
  return '_kind' in value && value._kind === 'content';
}
```

### Parse behavior per descriptor

| Descriptor | `parse(value)` accepts | `parse(value)` rejects | Output type |
|---|---|---|---|
| `content.xml()` | `string` | non-string | `string` |
| `content.html()` | `string` | non-string | `string` |
| `content.text()` | `string` | non-string | `string` |
| `content.binary()` | `Uint8Array` | non-Uint8Array | `Uint8Array` |

All return `{ ok: true, data: T }` on accept, `{ ok: false, error: Error }` on reject.

### Updated ServiceActionDef

```typescript
interface ServiceActionDef<
  TInput = unknown,
  TOutput = unknown,
  TCtx extends ServiceContext = ServiceContext,
> {
  readonly method?: string;
  readonly path?: string;
  readonly body?: SchemaLike<TInput>;     // optional (GET/DELETE have no body)
  readonly response: SchemaLike<TOutput>; // always required — you always define your output
  readonly handler: (input: TInput, ctx: TCtx) => Promise<TOutput>;
}
```

`body` becomes optional — not for "raw mode," but because GET/DELETE requests legitimately have no body. When omitted, `TInput` defaults to `unknown` (the TypeScript default). This is safe: `unknown` prevents property access without narrowing — developers can't accidentally use it as a typed body.

`response` stays required — you always declare what you're sending back. For JSON it's `s.object(...)`. For XML it's `content.xml()`. For HTML it's `content.html()`. No untyped responses.

**Ordering constraint:** Making `body` optional in types MUST include a guard in the route generator (`if (handlerDef.body)`) to avoid `undefined.parse()` crashes. Phase 3 includes both the type change and the route generator guard.

### ServiceContext additions

```typescript
interface ServiceContext<TInject> extends BaseContext {
  readonly entities: InjectToOperations<TInject>;
  /** Raw request metadata — URL, method, headers, pre-parsed body */
  readonly request: {
    readonly url: string;
    readonly method: string;
    readonly headers: Headers;
    readonly body: unknown;  // pre-parsed body from core
  };
}
```

**Data flow for `ctx.request`:** Core's `app-runner.ts` builds a `ctx` record with `raw: { request, method, url, headers }` and `body` (pre-parsed). The service route handler (lambda in `generateServiceRoutes`) receives this `ctx: Record<string, unknown>`. It extracts `ctx.raw` and `ctx.body`, then passes them to `createServiceContext()` as a new `requestInfo` parameter. `createServiceContext` populates `ctx.request` from this data.

---

## Content-type mismatch behavior

When a content descriptor declares an expected content type but the request arrives with a different one:

| Scenario | Behavior |
|---|---|
| `body: content.xml()` + request `content-type: application/json` | 415 Unsupported Media Type |
| `body: content.xml()` + request `content-type: text/xml` | Accept (both XML MIME types) |
| `body: content.xml()` + request `content-type: application/xml` | Accept |
| `body: s.object()` + request `content-type: text/xml` | Core parses as string, schema validation fails → 400 |

The content-type check happens before `parse()`. The route generator reads the request's `content-type` header and compares against the descriptor's `_contentType`. For XML, both `application/xml` and `text/xml` are accepted.

---

## Route generator behavior

The service route generator checks `isContentDescriptor()` on `body` and `response`:

### Request parsing

| `body` value | Behavior |
|---|---|
| `s.object(...)` (JSON schema) | Parse as JSON, validate against schema |
| `content.xml()` | Check content-type is XML, pass body as string, validate via `parse()` |
| `content.html()` | Check content-type is HTML, pass body as string |
| `content.text()` | Check content-type is text, pass body as string |
| `content.binary()` | Pass body as `Uint8Array` |
| omitted | Skip body parsing, `input` is `undefined` |

### Response serialization

| `response` value | Behavior |
|---|---|
| `s.object(...)` (JSON schema) | Validate via `parse()`, wrap in `jsonResponse()` |
| `content.xml()` | Validate via `parse()` (checks string type), wrap in `new Response(result, { content-type: application/xml })` |
| `content.html()` | Validate via `parse()`, wrap in `new Response(result, { content-type: text/html })` |
| `content.text()` | Validate via `parse()`, wrap in `new Response(result, { content-type: text/plain })` |
| `content.binary()` | Validate via `parse()` (checks Uint8Array type), pass bytes directly to `new Response(result, { content-type: application/octet-stream })` |

**Response validation is always performed** — content descriptors' `parse()` verifies the handler returned the correct type (e.g., `string` for XML, `Uint8Array` for binary). This catches handler bugs at the framework level. For content descriptors, the `parse()` check is a type guard (is it a string?), not a structural validation (is the XML well-formed?).

The handler never constructs `new Response()` manually — the framework handles wrapping based on the descriptor's `_contentType`.

---

## Type behavior

```typescript
// JSON — fully typed (unchanged)
body: s.object({ email: s.email() })
// → TInput = { email: string }

response: s.object({ token: s.string() })
// → TOutput = { token: string }

// content.xml() — typed as string
body: content.xml()
// → TInput = string (ContentDescriptor<string> extends SchemaLike<string>)

response: content.xml()
// → TOutput = string

// content.binary() — typed as Uint8Array
body: content.binary()
// → TInput = Uint8Array

// No body (GET request)
// body omitted → TInput = unknown (TypeScript default)
// This is safe: unknown prevents property access without narrowing
```

---

## Manifesto Alignment

### Principles honored

- **One way to do things** — `service()` with `actions` remains the only way to define custom endpoints. No new primitive. `body`/`response` are the same properties — just accepting richer values.
- **Explicit over implicit** — The content type is declared, not inferred. `content.xml()` is explicit. No guessing from `content-type` headers.
- **If it builds, it works** — JSON endpoints require JSON schemas. Non-JSON endpoints require content descriptors. Both are typed. No untyped endpoints.
- **No ceilings** — Developers can build SAML, webhooks, file uploads, or anything else using the same `service()` pattern.
- **AI agents are first-class** — One pattern to learn. `body` is always a descriptor (either `s.*` or `content.*`). An LLM can use this correctly on the first try.
- **Compile-time > runtime** — Content descriptors carry type information. `content.xml()` → `TInput = string`. TypeScript catches mismatches.

### Tradeoffs accepted

- **No XML schema validation** — `content.xml()` types the input as `string` but doesn't validate the XML structure. XML schema validation could be added later (`content.xml(xmlSchema)`) but is out of scope.
- **Framework handles Response wrapping** — Handlers return the content (`string`, `object`, `Uint8Array`), not `Response` objects. This is more opinionated but keeps handlers focused on business logic.

### Rejected alternatives

- **Making `body`/`response` optional for "raw mode"** — Violates "JSON must have schemas." The gate should be the content type, not the absence of a schema.
- **New `accepts`/`returns` properties** — Adds new properties when `body`/`response` already exist. More surface area, less convergence.
- **`raw: true` flag** — Modal. Creates two kinds of actions. The content descriptor approach is structural — the value determines behavior.
- **New `rawHandler()` or router primitive** — Violates "one way to do things."

---

## Non-Goals

- **XML schema validation** — `content.xml()` types as `string`. Structured XML validation is a future extension.
- **Streaming responses (SSE)** — Requires holding the connection open. Different pattern.
- **WebSocket endpoints** — Fundamentally different from request/response.
- **Entity action support** — Entity actions are CRUD-bound. Content descriptors apply to service actions. Can be extended later if needed.
- **SDK codegen changes** — The descriptors carry the metadata the codegen will need, but codegen changes are a separate feature.
- **`content.formData()` and `content.file()`** — Form data and file uploads require `multipart/form-data` parsing, which is a larger effort. The initial implementation covers string-typed descriptors (`xml`, `html`, `text`) and `binary`. Form data is a follow-up.
- **`application/x-www-form-urlencoded` descriptor** — Core's `parseBody()` already handles form-urlencoded as an object. Regular `s.object()` schemas work for form-urlencoded input naturally — no special content descriptor needed.

---

## Unknowns

### Resolved

1. **Can handlers already return `Response`?** — Yes, core's `app-runner.ts:278-284` handles `instanceof Response`. But the service route generator wraps everything in `jsonResponse()` first, so `Response` pass-through never reaches core. We fix this at the service route generator level — but with content descriptors, handlers return plain values (`string`, `Uint8Array`) and the framework wraps them.

2. **Is the raw `Request` body stream consumed?** — Yes, by core's `parseBody()`. We don't expose the raw `Request` — we expose the pre-parsed body via `ctx.request.body`.

3. **Does `path` override work for custom routes?** — Yes. `handlerDef.path` is used as-is: `path: '/.well-known/saml-metadata'` works.

4. **Where do `content.*` builders live?** — In `@vertz/server`, exported alongside `entity`, `service`, `rules`. Not in `@vertz/db` (content types are HTTP-specific, not DB-related).

5. **What type does `TInput` default to when `body` is omitted?** — `unknown` (TypeScript's default for unresolved generics). This is safe because TypeScript prevents property access on `unknown` — developers can't accidentally treat it as a typed body.

6. **Does the SAML ACS endpoint use XML POST?** — No. Real SAML ACS endpoints receive `application/x-www-form-urlencoded` (browser form POST with `SAMLResponse` field), not `application/xml`. Form-urlencoded is already handled by core's `parseBody()` as an object, so `s.object({ SAMLResponse: s.string() })` works with no changes needed.

### Open

None identified.

---

## POC Results

No POC needed — `ContentDescriptor` extends `SchemaLike`, which is the type already accepted by `body`/`response`. The extension is structural.

---

## Type Flow Map

```
content.xml() → ContentDescriptor<string> extends SchemaLike<string>
                  │
                  ├── _kind: 'content'
                  ├── _contentType: 'application/xml'
                  └── parse(raw: unknown) → { ok: true, data: string } | { ok: false, error: Error }

ServiceActionDef<TInput, TOutput, TCtx>
  │
  ├── body?: SchemaLike<TInput>
  │     ├── s.object({...}) → TInput = { ... }   (JSON, validated)
  │     ├── content.xml()   → TInput = string     (XML, typed)
  │     ├── content.binary()→ TInput = Uint8Array (binary, typed)
  │     └── omitted         → TInput = unknown    (no body, safe default)
  │
  ├── response: SchemaLike<TOutput>
  │     ├── s.object({...}) → TOutput = { ... }   (JSON, validated)
  │     ├── content.xml()   → TOutput = string    (XML, typed)
  │     └── content.html()  → TOutput = string    (HTML, typed)
  │
  └── handler: (input: TInput, ctx: TCtx) => Promise<TOutput>
        │
        └── TInput flows from body descriptor
            TOutput flows to response descriptor

Route generator wraps return based on response descriptor:
  isContentDescriptor(response)
    → validates via parse() (type guard)
    → new Response(result, { content-type: response._contentType })
  else (JSON schema)
    → validates via parse() (structural)
    → jsonResponse(result)

ctx.request data flow:
  core app-runner builds ctx: { raw: { request, method, url, headers }, body }
    → service route handler (lambda) extracts ctx.raw + ctx.body
      → createServiceContext(requestInfo, registryProxy, rawRequestInfo)
        → ctx.request = { url, method, headers, body }
```

---

## E2E Acceptance Test

```typescript
describe('Feature: Content descriptors for service actions', () => {
  const testService = service('test', {
    actions: {
      // XML GET — no body, returns XML
      xmlGet: {
        method: 'GET',
        response: content.xml(),
        handler: async () => '<EntityDescriptor/>',
      },
      // XML POST — XML in, XML out
      xmlPost: {
        method: 'POST',
        body: content.xml(),
        response: content.xml(),
        handler: async (input) => `<Response>${input}</Response>`,
      },
      // HTML GET — returns HTML
      htmlGet: {
        method: 'GET',
        response: content.html(),
        handler: async () => '<html><body>Hello</body></html>',
      },
      // JSON POST — unchanged, schemas required
      jsonPost: {
        method: 'POST',
        body: s.object({ email: s.email() }),
        response: s.object({ ok: s.boolean() }),
        handler: async () => ({ ok: true }),
      },
      // Mixed — XML in, JSON out
      xmlToJson: {
        method: 'POST',
        body: content.xml(),
        response: s.object({ count: s.number() }),
        handler: async (input) => ({ count: input.length }),
      },
      // Plain text GET
      textGet: {
        method: 'GET',
        response: content.text(),
        handler: async () => 'OK',
      },
    },
    access: {
      xmlGet: rules.public,
      xmlPost: rules.public,
      htmlGet: rules.public,
      jsonPost: rules.public,
      xmlToJson: rules.public,
      textGet: rules.public,
    },
  });

  describe('Given a service with content descriptor actions', () => {
    describe('When GET /api/test/xmlGet is called', () => {
      it('Then returns body "<EntityDescriptor/>"', () => {});
      it('Then content-type is application/xml', () => {});
    });

    describe('When POST /api/test/xmlPost is called with application/xml body', () => {
      it('Then handler receives the XML as string input', () => {});
      it('Then returns XML response', () => {});
      it('Then content-type is application/xml', () => {});
    });

    describe('When POST /api/test/xmlPost is called with application/json content-type', () => {
      it('Then returns 415 Unsupported Media Type', () => {});
    });

    describe('When GET /api/test/htmlGet is called', () => {
      it('Then returns HTML body', () => {});
      it('Then content-type is text/html', () => {});
    });

    describe('When POST /api/test/jsonPost is called with valid JSON', () => {
      it('Then validates input and returns JSON (unchanged)', () => {});
      it('Then content-type is application/json', () => {});
    });

    describe('When POST /api/test/jsonPost is called with invalid JSON', () => {
      it('Then returns 400 BadRequest (unchanged)', () => {});
    });

    describe('When POST /api/test/xmlToJson is called with XML body', () => {
      it('Then handler receives XML string as input', () => {});
      it('Then returns JSON response', () => {});
      it('Then content-type is application/json', () => {});
    });

    describe('When GET /api/test/textGet is called', () => {
      it('Then returns "OK" as plain text', () => {});
      it('Then content-type is text/plain', () => {});
    });
  });

  // Type-level tests (.test-d.ts)
  describe('Type flow', () => {
    it('handler input is TInput when body is s.object()', () => {
      // expectTypeOf(jsonPostHandler).parameter(0).toEqualTypeOf<{ email: string }>()
    });

    it('handler input is string when body is content.xml()', () => {
      // expectTypeOf(xmlPostHandler).parameter(0).toEqualTypeOf<string>()
    });

    it('handler output is string when response is content.xml()', () => {
      // expectTypeOf(xmlGetHandler).returns.resolves.toEqualTypeOf<string>()
    });

    it('handler input is unknown when body is omitted', () => {
      // expectTypeOf(xmlGetHandler).parameter(0).toEqualTypeOf<unknown>()
    });

    // @ts-expect-error — returning number when response is content.xml() (expects string)
    it('rejects wrong return type for content descriptor', () => {});
  });
});
```

---

## Implementation Plan

### Phase 1: `ContentDescriptor` type and `content.*` builders

**Files:**
- `packages/server/src/content/content-descriptor.ts` — `ContentDescriptor<T>` type, `isContentDescriptor()` helper
- `packages/server/src/content/builders.ts` — `content.xml()`, `content.html()`, `content.text()`, `content.binary()`
- `packages/server/src/content/index.ts` — barrel export
- `packages/server/src/content/__tests__/builders.test.ts` — unit tests
- `packages/server/src/content/__tests__/builders.test-d.ts` — type tests

**Acceptance criteria:**
```typescript
describe('Given content.xml()', () => {
  it('Then returns a ContentDescriptor<string>', () => {});
  it('Then _contentType is "application/xml"', () => {});
  it('Then _kind is "content"', () => {});
  it('Then parse(string) returns { ok: true, data: string }', () => {});
  it('Then parse(non-string) returns { ok: false }', () => {});
});

describe('Given content.html()', () => {
  it('Then _contentType is "text/html"', () => {});
  it('Then parse(string) returns { ok: true, data: string }', () => {});
});

describe('Given content.text()', () => {
  it('Then _contentType is "text/plain"', () => {});
});

describe('Given content.binary()', () => {
  it('Then _contentType is "application/octet-stream"', () => {});
  it('Then parse(Uint8Array) returns { ok: true, data: Uint8Array }', () => {});
  it('Then parse(string) returns { ok: false }', () => {});
  it('Then parse(ArrayBuffer) returns { ok: false }', () => {});
});

describe('Given isContentDescriptor()', () => {
  it('Then returns true for content.xml()', () => {});
  it('Then returns false for s.object({})', () => {});
});
```

### Phase 2: Core `parseBody` — handle `application/xml`

**Files:**
- `packages/core/src/server/request-utils.ts` — add `application/xml` content-type branch
- `packages/core/src/server/__tests__/request-utils.test.ts` — tests

**Acceptance criteria:**
```typescript
describe('Given a request with content-type application/xml', () => {
  describe('When parseBody() is called', () => {
    it('Then returns the XML body as a string', () => {});
  });
});

describe('Given a request with content-type text/xml', () => {
  describe('When parseBody() is called', () => {
    it('Then returns the XML body as a string (existing text/* branch)', () => {});
  });
});
```

### Phase 3: Service types — `body` optional, content descriptors accepted

This phase includes BOTH the type change AND the route generator guard to prevent crashes.

**Files:**
- `packages/server/src/service/types.ts` — make `body` optional in `ServiceActionDef`
- `packages/server/src/service/route-generator.ts` — add `if (handlerDef.body)` guard around body validation
- `packages/server/src/service/__tests__/types.test-d.ts` — type flow tests
- `packages/server/src/service/__tests__/route-generator.test.ts` — test body-less actions

**Acceptance criteria:**
```typescript
describe('Given a ServiceActionDef with body: content.xml()', () => {
  it('Then TInput is string', () => {});
});

describe('Given a ServiceActionDef with response: content.xml()', () => {
  it('Then TOutput is string', () => {});
});

describe('Given a ServiceActionDef with no body', () => {
  it('Then TInput defaults to unknown', () => {});
  it('Then compiles without error', () => {});
});

describe('Given a ServiceActionDef with both s.object() schemas', () => {
  it('Then types are unchanged from current behavior', () => {});
});

describe('Given a GET action with no body (route generator)', () => {
  describe('When the action is called', () => {
    it('Then handler receives undefined as input', () => {});
    it('Then no body validation occurs', () => {});
    it('Then no crash from undefined.parse()', () => {});
  });
});
```

### Phase 4: Service route generator — content-type aware parsing and response wrapping

**Files:**
- `packages/server/src/service/route-generator.ts` — content-type aware handler wiring
- `packages/server/src/service/__tests__/route-generator.test.ts` — integration tests

**Acceptance criteria:**
```typescript
describe('Given an action with response: content.xml()', () => {
  describe('When the handler returns a string', () => {
    it('Then response has content-type application/xml', () => {});
    it('Then response body is the string', () => {});
    it('Then response validation via parse() passes (string type check)', () => {});
  });
});

describe('Given an action with response: content.binary()', () => {
  describe('When the handler returns a Uint8Array', () => {
    it('Then response has content-type application/octet-stream', () => {});
    it('Then response body is the raw bytes', () => {});
  });
});

describe('Given an action with body: content.xml()', () => {
  describe('When called with application/xml body', () => {
    it('Then handler receives the body as string input', () => {});
  });
  describe('When called with application/json content-type', () => {
    it('Then returns 415 Unsupported Media Type', () => {});
  });
  describe('When called with text/xml content-type', () => {
    it('Then accepts (both XML MIME types)', () => {});
  });
});

describe('Given an action with s.object() body and response (JSON)', () => {
  it('Then behavior is unchanged from current implementation', () => {});
});

describe('Given an action with body: content.xml() and response: s.object()', () => {
  describe('When called with XML body', () => {
    it('Then handler receives string input', () => {});
    it('Then response is JSON', () => {});
  });
});
```

### Phase 5: Add `ctx.request` to `ServiceContext`

**Files:**
- `packages/server/src/service/types.ts` — add `request` to `ServiceContext`
- `packages/server/src/service/context.ts` — accept raw request info, populate `ctx.request`
- `packages/server/src/service/route-generator.ts` — extract `ctx.raw` and `ctx.body`, pass to `createServiceContext`
- `packages/server/src/service/__tests__/route-generator.test.ts` — tests

**Data flow:** `ctx.raw` (from core app-runner) → route handler extracts `{ url: ctx.raw.url, method: ctx.raw.method, headers: ctx.raw.headers, body: ctx.body }` → passes to `createServiceContext()` as new parameter → `ServiceContext.request` populated.

**Acceptance criteria:**
```typescript
describe('Given a service action handler', () => {
  describe('When the handler accesses ctx.request', () => {
    it('Then ctx.request.url is the full request URL', () => {});
    it('Then ctx.request.method is the HTTP method', () => {});
    it('Then ctx.request.headers contains request headers', () => {});
    it('Then ctx.request.body is the pre-parsed body', () => {});
  });
});
```

### Phase 6: Export `content` from `@vertz/server` + E2E walkthrough

**Files:**
- `packages/server/src/index.ts` — export `content`
- `packages/integration-tests/src/__tests__/content-descriptors-walkthrough.test.ts` — full E2E test

**Acceptance criteria:**
The full E2E acceptance test from the design doc (all scenarios including 415 content-type mismatch).

---

## Future Work (not in this PR)

- **`content.formData()` and `content.file()`** — Multipart form data parsing with typed fields and file streaming. Example:
  ```typescript
  body: content.formData({
    file: content.file({ maxSize: '5mb', types: ['image/png'] }),
    description: s.string().optional(),
  })
  // → TInput = { file: File; description: string | undefined }
  ```
- **SDK codegen integration** — The codegen reads `_contentType` from descriptors to generate typed client methods (e.g., `string` return for XML endpoints, `FormData` input for uploads).
- **Entity action content descriptors** — Same pattern for entity custom actions, if use cases emerge.
- **XML schema validation** — `content.xml(xmlSchema)` with structured validation.
- **Content negotiation** — Multiple `response` descriptors for `Accept` header negotiation.

---

## Migration

No migration needed. All changes are backward-compatible:
- Existing JSON actions with `s.*` schemas work identically
- `content.*` is additive — new descriptors for new use cases
- `ctx.request` is additive — no existing code accesses it
- `body` becoming optional for GET/DELETE is a relaxation, not a restriction
