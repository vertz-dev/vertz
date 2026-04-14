# Phase 2: Raw Tailwind Palette Colors (#2641)

## Context

The Vertz CSS token system resolves color tokens like `bg:primary.700` to CSS custom properties. All 22 Tailwind color palettes are shipped in `@vertz/ui/css/palettes` but `css()` rejects raw palette names like `bg:green.100`. This phase wires palette names into the color resolver, resolving them directly to oklch values (no CSS variables).

Design doc: `plans/css-token-enhancements.md`

## Tasks

### Task 1: Add palette data lookup to TypeScript resolver

**Files:**
- `packages/ui/src/css/token-tables.ts` (modified — add RAW_PALETTE_NAMES set)
- `packages/ui/src/css/token-resolver.ts` (modified — palette fallback in resolveColorToken)
- `packages/ui/src/css/__tests__/token-resolver.test.ts` (modified — palette color tests)

**What to implement:**

1. **RAW_PALETTE_NAMES** — new `ReadonlySet<string>` in token-tables.ts with 21 palette names (all except `gray` which is already a semantic namespace):
   ```ts
   export const RAW_PALETTE_NAMES: ReadonlySet<string> = new Set([
     'slate', 'zinc', 'neutral', 'stone',
     'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
     'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple',
     'fuchsia', 'pink', 'rose',
   ]);
   ```

2. **PALETTE_SHADES** — valid shade names set for validation:
   ```ts
   export const PALETTE_SHADES: ReadonlySet<string> = new Set([
     '50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950',
   ]);
   ```

3. **resolveColorToken()** — after the `COLOR_NAMESPACES` check for dotted notation fails, add a new branch:
   ```ts
   if (RAW_PALETTE_NAMES.has(namespace)) {
     if (!PALETTE_SHADES.has(shade)) {
       throw new TokenResolveError(
         `Unknown palette shade '${shade}' for '${namespace}'. Use: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950.`,
         `${property}:${fullValue}`,
       );
     }
     const palette = palettes[namespace as keyof typeof palettes];
     return palette[Number(shade) as keyof ColorPalette];
   }
   ```
   Import `palettes` from `../css/palettes` (re-export) or `./palettes`.

4. **isValidColorToken()** — update to also check `RAW_PALETTE_NAMES`.

**Acceptance criteria:**
- [ ] `resolveToken({ property: 'bg', value: 'green.100', pseudo: null })` → `[{ property: 'background-color', value: 'oklch(...)' }]`
- [ ] `resolveToken({ property: 'text', value: 'red.700', pseudo: null })` → `[{ property: 'color', value: 'oklch(...)' }]`
- [ ] `resolveToken({ property: 'border', value: 'blue.300', pseudo: null })` → `[{ property: 'border-color', value: 'oklch(...)' }]`
- [ ] `resolveToken({ property: 'bg', value: 'green.100/50', pseudo: null })` → `color-mix(in oklch, oklch(...) 50%, transparent)`
- [ ] `resolveToken({ property: 'bg', value: 'gray.500', pseudo: null })` → `var(--color-gray-500)` (semantic precedence)
- [ ] `resolveToken({ property: 'bg', value: 'green.42', pseudo: null })` → throws with shade-specific error
- [ ] `resolveToken({ property: 'bg', value: 'chartreuse.100', pseudo: null })` → throws generic error
- [ ] `isValidColorToken('green.500')` returns `true`
- [ ] `isValidColorToken('green.42')` returns `false`
- [ ] All quality gates pass: `vtz test packages/ui && vtz run typecheck`

---

### Task 2: Add palette data to Rust compiler

**Files:**
- `native/vertz-compiler-core/src/css_token_tables.rs` (modified)

**What to implement:**

1. **is_raw_palette()** — 21-arm match function:
   ```rust
   pub fn is_raw_palette(name: &str) -> bool {
       matches!(name, "slate" | "zinc" | "neutral" | "stone" | "red" | "orange" | "amber" | "yellow" | "lime" | "green" | "emerald" | "teal" | "cyan" | "sky" | "blue" | "indigo" | "violet" | "purple" | "fuchsia" | "pink" | "rose")
   }
   ```

2. **palette_shades()** — two-level lookup for efficiency:
   ```rust
   fn palette_shades(palette: &str) -> Option<&'static [&'static str; 11]> {
       match palette {
           "slate" => Some(&["oklch(0.984 0.003 247.858)", ...]),
           "red" => Some(&["oklch(0.971 0.013 17.38)", ...]),
           // ... 22 palettes total
       }
   }

   fn shade_index(shade: &str) -> Option<usize> {
       match shade {
           "50" => Some(0), "100" => Some(1), "200" => Some(2), "300" => Some(3),
           "400" => Some(4), "500" => Some(5), "600" => Some(6), "700" => Some(7),
           "800" => Some(8), "900" => Some(9), "950" => Some(10), _ => None,
       }
   }

   pub fn resolve_palette_shade(palette: &str, shade: &str) -> Option<String> {
       let shades = palette_shades(palette)?;
       let idx = shade_index(shade)?;
       Some(shades[idx].to_string())
   }
   ```

3. **resolve_color_token()** — after `is_color_namespace()` check fails for dotted notation, add palette fallback:
   ```rust
   if is_raw_palette(namespace) {
       return resolve_palette_shade(namespace, shade);
   }
   ```

**Acceptance criteria:**
- [ ] `cargo test --all` passes with tests for palette resolution
- [ ] `cargo clippy --all-targets --release -- -D warnings` clean
- [ ] `cargo fmt --all -- --check` clean
- [ ] `resolve_palette_shade("green", "100")` returns `Some("oklch(...")`
- [ ] `resolve_palette_shade("green", "42")` returns `None`
- [ ] `resolve_color("green.100")` returns the oklch value
- [ ] `resolve_color("gray.500")` returns `var(--color-gray-500)` (semantic precedence)
- [ ] `resolve_color("green.100/50")` returns color-mix with oklch
