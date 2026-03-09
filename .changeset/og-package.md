---
'@vertz/og': patch
---

feat(og): add @vertz/og package for framework-level OG image generation

Provides `generateOGImage()` to render Satori-compatible element trees to PNG via Satori + resvg, `loadGoogleFont()` for font loading, `loadImage()` for embedding images as data URIs, pre-built templates (`OGTemplate.Card`, `OGTemplate.Hero`, `OGTemplate.Minimal`), and `OGResponse()` for returning PNG images as HTTP responses with proper headers. Includes an `@vertz/og/edge` entry point for edge runtime compatibility.
