# @vertz/runtime

> **Internal package** — This is the platform-specific binary selector for the Vertz runtime. Do not install or use it directly.

This package detects your platform (OS + architecture) and resolves the correct native binary for the `vtz` CLI. It is installed automatically as a dependency of `@vertz/cli`.

## For Vertz Development

Use the `vtz` CLI to develop Vertz applications:

```bash
# Create a new project
npx create-vertz my-app

# Start the dev server
vtz dev

# Run tests
vtz test

# Build for production
vtz build
```

## Links

- [Vertz documentation](https://vertz.dev)
- [`vtz` CLI](https://www.npmjs.com/package/@vertz/cli)
- [`create-vertz`](https://www.npmjs.com/package/create-vertz)

## License

MIT
