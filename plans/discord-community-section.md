# Discord Community Section — Landing Page

## Description

Add a dedicated Discord community section to the landing page and activate the existing commented-out Discord links in nav and footer. The section uses a distinct visual treatment with a blurple-tinted palette that complements the existing warm/dark aesthetic while signaling "community."

Discord invite: `https://discord.gg/C7JkeBhH5`

## API Surface

No framework API changes — this is a landing page UI addition. The deliverables are:

### New Component: `CommunityDiscord`

```tsx
// packages/landing/src/components/community-discord.tsx
import { css } from '@vertz/ui';

export function CommunityDiscord() {
  // Full-width section with blurple accent palette
  // Centered layout, max-w:4xl like other sections
  return (
    <section className={s.section}>
      <div className={s.container}>
        <div className={s.badge}>
          {/* Discord icon + "Community" label */}
        </div>
        <h2>Build this with us.</h2>
        <p>
          Join the Discord. Talk to the founders, preview breaking changes,
          and help shape the APIs before v1.
        </p>
        <a href="https://discord.gg/C7JkeBhH5" target="_blank" rel="noopener">
          Join Discord →
        </a>
      </div>
    </section>
  );
}
```

### Updated Files

1. **`nav.tsx`** — Uncomment Discord link, replace `INVITE_CODE` with `C7JkeBhH5`
2. **`footer.tsx`** — Uncomment Discord link, replace `INVITE_CODE` with `C7JkeBhH5`
3. **`home.tsx`** — Add `<Divider />` + `<CommunityDiscord />` inside `<main>` after `<Founders />`, before `</main>`

### Color Palette — Discord Section

The section introduces a blurple accent to differentiate from the orange (#C8451B) used elsewhere:

| Token | Value | Usage |
|-------|-------|-------|
| Blurple accent | `#5865F2` | CTA button background, badge dot, section glow |
| Blurple hover | `#4752C4` | CTA hover state |
| Blurple soft | `rgba(88,101,242,0.04)` | Subtle section background tint |
| Blurple glow | `rgba(88,101,242,0.15)` | Radial gradient glow behind section |
| Text primary | `#E8E4DC` | Heading (existing palette) |
| Text secondary | `#9C9690` | Description (existing palette) |
| Border | `#2A2826` | Section border (existing palette) |
| Background | `#0F0F0E` | Section background (existing palette) |

The blurple accent is Discord's brand color, creating an immediate visual association. The rest of the section uses the existing landing page palette for cohesion.

### Section Layout

```
┌──────────────────────────────────────────────┐
│                   ● Community                │  badge (blurple dot)
│                                              │
│           Build this with us.                │  h2 (display font, #E8E4DC)
│                                              │
│  Join the Discord. Talk to the founders,     │  p (body font, #9C9690)
│  preview breaking changes, and help shape    │
│  the APIs before v1.                         │
│                                              │
│          [ Join Discord → ]                  │  CTA button (blurple bg, white text)
│                                              │
└──────────────────────────────────────────────┘
```

## Manifesto Alignment

- **Build in public** — Inviting people into the community is the embodiment of building in public. The Discord section signals openness and invites co-creation.
- **One way to do things** — Single community hub (Discord), not scattered across Slack + Discord + forums.
- **AI agents are first-class users** — The section copy doesn't exclude AI-focused contributors; the community welcomes all builders.

## Non-Goals

- **No email newsletter signup** — Discord is the community hub, not a mailing list.
- **No Discord member count widget** — Avoids external API dependency and stale data on SSR. Can be added later as an Island if desired.
- **No animated/interactive elements** — The section is static. The blurple glow is CSS-only, no JS.
- **No full site palette change** — Only the Discord section gets blurple accents. The rest of the site keeps the warm orange palette.
- **No Discord embed/widget iframe** — No live chat embed or server preview. Avoids third-party dependencies, page load impact, and privacy concerns.

## Unknowns

- **Discord icon SVG** — Need a simple Discord logo SVG for the badge and/or CTA button. Resolution: use a standard Discord logomark SVG inline (no external dependency). ✅ Resolved.

## POC Results

N/A — This is a presentational landing page section with no technical risk.

## Type Flow Map

N/A — No generics or type-level features involved. Pure presentational component.

## E2E Acceptance Test

```
Given the landing page at vertz.dev
When a visitor scrolls to the bottom of the page
Then they see the Discord community section between Founders and Footer

Given the Discord section is visible
When the visitor clicks "Join Discord →"
Then a new tab opens to https://discord.gg/C7JkeBhH5

Given the nav bar
When the visitor looks at the navigation links
Then "Discord" appears between "GitHub" and "Docs"
And clicking it opens https://discord.gg/C7JkeBhH5 in a new tab

Given the footer
When the visitor reads the footer links
Then "Discord" appears with a separator alongside GitHub and X handles
And clicking it opens https://discord.gg/C7JkeBhH5 in a new tab
```

## Implementation Plan

### Phase 1: Discord section component + nav/footer activation

**Scope:**
1. Create `packages/landing/src/components/community-discord.tsx`
2. Uncomment and update Discord links in `nav.tsx` and `footer.tsx`
3. Add `<CommunityDiscord />` to `home.tsx` between `<Founders />` and `<Footer />`

**Acceptance criteria:**
- Discord section renders with blurple accent palette
- Nav shows Discord link pointing to correct URL
- Footer shows Discord link pointing to correct URL
- All links open in new tab with `rel="noopener"`
- Section follows existing layout patterns (max-w:4xl container, max-w:2xl inner text, centered, responsive)
- Section has `id="community"` for anchor linking
- Discord SVG icon uses `aria-hidden="true"` (decorative)
- All inline styles use camelCase objects (no string syntax)
- CTA button uses `var(--font-mono)` with uppercase tracking (matching nav/footer link style)
- Section renders correctly at narrow viewports (mobile responsive)
- Quality gates pass (test, typecheck, lint)
