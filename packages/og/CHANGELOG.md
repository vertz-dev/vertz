# @vertz/og

## 0.1.1

### Patch Changes

- [#1100](https://github.com/vertz-dev/vertz/pull/1100) [`9c3e166`](https://github.com/vertz-dev/vertz/commit/9c3e166d368c920730d51b5c70e5e66427d2ed04) Thanks [@viniciusdacal](https://github.com/viniciusdacal)! - feat(og): add @vertz/og package for framework-level OG image generation

  Provides `generateOGImage()` to render Satori-compatible element trees to PNG via Satori + resvg, `loadGoogleFont()` for font loading, `loadImage()` for embedding images as data URIs, pre-built templates (`OGTemplate.Card`, `OGTemplate.Hero`, `OGTemplate.Minimal`), and `OGResponse()` for returning PNG images as HTTP responses with proper headers. Includes an `@vertz/og/edge` entry point for edge runtime compatibility.
