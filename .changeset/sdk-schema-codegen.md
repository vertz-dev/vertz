---
'@vertz/compiler': patch
'@vertz/codegen': patch
---

EntityAnalyzer now extracts structured field info (name, type, optionality) from resolved schema types. EntitySchemaGenerator produces @vertz/schema validation code from resolved entity field info. EntitySdkGenerator embeds .meta with bodySchema on create SDK methods.
