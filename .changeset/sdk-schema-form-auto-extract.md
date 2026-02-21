---
'@vertz/ui': patch
---

validate() now handles @vertz/schema ParseError.issues, converting them to field-level errors via duck-typing (no import from @vertz/schema). form() auto-extracts validation schema from SdkMethod.meta.bodySchema — schema option is now optional when the SDK method carries embedded schema metadata.
