---
'@vertz/ui': patch
---

Add type-safe router: `navigate()`, `useParams()`, and Link `href` are validated
against defined route paths at compile time. New exports: `useParams<TPath>()`,
`useRouter<T>()`, `InferRouteMap<T>`, `TypedRoutes<T>`, `TypedRouter<T>`,
`RoutePaths<T>`, `PathWithParams<T>`, `LinkProps<T>`. Fully backward-compatible —
existing code compiles unchanged.
