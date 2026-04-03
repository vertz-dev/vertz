---
'@vertz/openapi': patch
---

Support SSE and NDJSON streaming endpoints in generated SDKs.

Endpoints with `text/event-stream` or `application/x-ndjson` response content types now generate
`AsyncGenerator<T>` methods using `client.requestStream()`. Dual content-type responses (JSON +
streaming) generate both a standard method and a `Stream`-suffixed streaming variant. All streaming
methods include `AbortSignal` support and `@throws` JSDoc annotations.

Closes #2212, closes #2220.
