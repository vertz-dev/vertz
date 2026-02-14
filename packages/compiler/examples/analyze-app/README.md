# Compiler Analysis Example

Demonstrates programmatic usage of `@vertz/compiler` to analyze a vertz application, extract routes, run validators, and generate artifacts.

## Features

- ✅ Analyze application structure
- ✅ Extract modules, routes, services
- ✅ Run validators (naming, placement, completeness)
- ✅ Generate artifacts (boot.ts, manifest.json, routes)
- ✅ Display diagnostics

## Running the Example

```bash
# From workspace root
bun install

# Run the analysis
cd packages/compiler/examples/analyze-app
bun run dev
```

## What You'll See

The example will:

1. **Analyze** the sample app (`sample-app/`)
2. **Extract** modules, routes, and services
3. **Validate** the application structure
4. **Generate** runtime artifacts

Output includes:
- Number of modules, middleware, schemas, routes
- List of all routes with their HTTP methods and paths
- Diagnostics (errors/warnings/info)
- Generated artifacts in `.vertz/` directory

## Sample App Structure

```
sample-app/
  ├── app.ts              # App configuration
  └── users.module.ts     # Users module with routes and service
```

## Generated Artifacts

After running, check `.vertz/` directory for:
- `boot.ts` — Module registration code
- `manifest.json` — JSON representation of the app
- `routes.ts` — Runtime route table

## Next Steps

Try these exercises:

1. **Add another module** to `sample-app/` and see it analyzed
2. **Add validators** to check custom conventions
3. **Create a custom generator** to emit additional artifacts
4. **Integrate with CI** to validate app structure on every commit
