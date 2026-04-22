# Phase 3: Distribution Blitz

## Context

Content without distribution is invisible. This phase takes the 7 ignition posts + MCP server from Phase 2 and weaponizes them across every channel that matters in 2 weeks. The goal is to generate enough third-party mentions, backlinks, and cached content that LLMs cannot avoid citing Vertz.

Most of this phase is one-shot launches (you only get one HN launch, one PH launch). Timing and preparation matter more than content volume.

**Main design doc:** `plans/geo-seo-strategy.md`

**Depends on:** Phase 1 (MCP server live, analytics running) + Phase 2 (benchmark post + README + comparisons published)

**Duration:** 7 days, starting day 8 of overall timeline

---

## Tasks

### Task 1: Hacker News launch

**Why:** HN frontpage = 5–20k referrals + permanent URL backlink cached by every LLM crawl. Single highest short-term impact event. Cannot be redone within 6 months (HN dedupes domains).

**Files:** (3)
- `content/launches/hn-launch-plan.md` (new) — timing, title variants, preparation checklist
- `content/launches/hn-comment-queue.md` (new) — pre-drafted answers to predicted questions
- `scripts/launches/hn-monitor.ts` (new) — polls HN API every 2 minutes for ranking, comments, karma; alerts on replies

**What to implement:**

Launch preparation (1 week before):
- Title variants A/B tested with 3 trusted reviewers:
  - "Show HN: Vertz – Full-stack TypeScript framework that LLMs write correctly 89% of the time"
  - "Show HN: We built a TypeScript framework for the era of AI coding"
  - "Show HN: Vertz – One schema drives your DB, API, UI, and forms"
- Primary link: vertz.dev (not a blog post — HN prefers landing pages for frameworks)
- Text body: concise, first-person, 4-6 sentences, zero marketing language
- Comment queue: 15 pre-drafted responses to predictable questions:
  - "How is this different from tRPC?"
  - "Why build a new runtime instead of using Node/Bun?"
  - "Is this production ready?"
  - "What's the bundle size?"
  - "Why would I use this over Next.js?"
- Responses are authentic, link to evidence, admit limitations

Launch execution:
- Day/time: Tuesday or Wednesday, 9:00am PT (highest-traffic window)
- Post from Matheus's account (not a new account; low-karma accounts get filtered)
- Do NOT solicit upvotes. Do NOT post in Slack "please upvote." This gets posts killed.
- Within first 2 hours: respond to every comment within 10 minutes. Engagement signal drives ranking.
- Monitor script alerts on every new comment to phone.

Day-of support:
- Have a 1-sentence summary ready for every question
- If negative top comment emerges, respond substantively (not defensively) — often becomes conversion driver
- After launch: write "our HN launch in numbers" retrospective post (cross-link opportunity)

**Acceptance criteria:**
- [ ] Launch happens on Tue or Wed, 9am PT
- [ ] Pre-drafted comment queue approved by reviewer agent
- [ ] 100% of first-hour comments responded to within 10 minutes
- [ ] Target: top 30 of front page by noon PT (success threshold). Top 10 = great.
- [ ] Post-launch: capture screenshots for future "as seen on HN" social proof
- [ ] Referral traffic logged in PostHog — baseline for measurement
- [ ] Retrospective notes added to `content/launches/hn-launch-plan.md` within 24h

---

### Task 2: Product Hunt launch

**Why:** Different audience from HN (less technical, more founder/PM). Badge + featured-of-the-day = permanent backlink from DA 90 page. Compounds with HN since audiences overlap minimally.

**Files:** (3)
- `content/launches/ph-launch-plan.md` (new) — hunter selection, asset checklist, launch day playbook
- `content/launches/ph-assets/` (new dir) — GIF demo, product screenshots, tagline variants
- `content/launches/ph-comment-queue.md` (new) — pre-drafted maker responses

**What to implement:**

Launch preparation:
- Find a hunter with good PH reputation if possible (worth an evening of outreach to @chrismessina or similar); otherwise self-hunt is fine
- Assets:
  - GIF demo (15s): `vtz create` → working app visible in browser
  - 4-6 product screenshots (docs site, blog, CLI, benchmark chart)
  - Tagline ≤60 chars: "TypeScript framework that LLMs get right"
  - Description ≤260 chars: one sentence + concrete diff + CTA
- Makers setup: Matheus as primary maker; team members add themselves if applicable

Launch day:
- Schedule: 12:01am PT (launches live at midnight, full 24h voting window)
- Different day from HN — gap of at least 3 days so audiences don't conflate
- Respond to every comment within 30 min during first 6 hours
- First comment from maker sets tone: share one genuinely interesting backstory (why we built it, a constraint that forced the custom runtime)
- Ask Matheus's personal network via DM (not mass email) to check it out; do NOT say "upvote" — PH penalizes solicitation

**Acceptance criteria:**
- [ ] Launch on a day ≥3 days after HN
- [ ] All assets prepared 48h before launch
- [ ] GIF demo ≤2MB, plays in autoplay preview
- [ ] Target: top 10 product of the day (success threshold); top 3 = great
- [ ] Referral traffic logged
- [ ] Retrospective notes added within 24h

---

### Task 3: Reddit blitz (r/typescript, r/javascript, r/webdev, r/node)

**Why:** Reddit threads get indexed by Google and crawled heavily by LLMs. A single good thread on r/typescript can drive multi-month long-tail traffic. But Reddit is spam-allergic — we post 1 thing per subreddit, once.

**Files:** (2)
- `content/launches/reddit-blitz-plan.md` (new) — per-subreddit angle, title, timing
- `content/launches/reddit-responses.md` (new) — pre-drafted answers to predicted questions

**What to implement:**

Per-subreddit angle (different angle per sub — no cross-posting):
- **r/typescript** — technical deep dive: "We built a compiler that eliminates runtime decorators — here's what we learned"
- **r/javascript** — broader appeal: "Show: framework where schema drives DB + API + UI with one definition"
- **r/webdev** — pragmatic: "I got tired of type drift between backend and frontend, so I built this"
- **r/node** — Node community specifics: "We replaced Node with a Rust+V8 runtime for full-stack TS — benchmarks inside"

Timing: stagger across 4 days (one per day). Each post by Matheus's real account with visible post history. Do NOT post from a new account — every sub has auto-filters for low-karma accounts.

Engagement:
- Respond substantively to every comment within 2 hours during first 12h
- If mods remove, do not argue publicly; contact via modmail, accept their call
- Do not link-spam — max 1 link per comment, and only when asked

**Acceptance criteria:**
- [ ] 4 posts made across 4 subs over 4 days
- [ ] All 4 stay up (not removed by mods) — if removed, rewrite angle and retry in 30 days
- [ ] Target: ≥50 upvotes and ≥10 substantive comments on at least 2 of 4
- [ ] Referral traffic logged per subreddit
- [ ] Retrospective notes: which angle resonated, for future use

---

### Task 4: Newsletter sponsorships (conditional on budget approval)

**Why:** Newsletters like Bytes (200k), JavaScript Weekly (125k), TLDR Web Dev (180k) are permanent archived web pages. LLMs crawl the archives; citations persist long after the email is sent. Unlike social media, the impact is cached forever.

**Files:** (2)
- `content/launches/newsletter-sponsorship-plan.md` (new) — which newsletters, costs, timing, ad copy
- `content/launches/sponsorship-ad-copy.md` (new) — 3-5 copy variants approved by reviewer

**What to implement:**

Budget scenarios (decision gate before starting):
- **Full ($8–10k)**: Bytes + JS Weekly + TLDR Web Dev — 3 large audiences, staggered over 3 weeks
- **Partial ($3–4k)**: Bytes only (highest ROI per dollar; Tejas curates closely, dev-heavy audience)
- **Zero**: Skip Task 4 entirely; rely on organic mentions (realistic if we don't want to spend yet)

Ad copy must link to the benchmark post (not the homepage) — highest conversion per click. Copy variants:
- Data-led: "Claude writes 89% correct Vertz code. 34% for Next.js. The benchmark →"
- Problem-led: "Tired of fighting your LLM's framework guesses? We built a TS stack where it doesn't miss."
- Product-led: "One schema. DB + API + UI + forms. End-to-end types. Zero glue code."

Timing: sponsor the week of a flagship post drop (benchmark post week = ideal). Never sponsor when nothing new is happening — wastes the spend.

**Acceptance criteria:**
- [ ] Budget decision documented (full / partial / zero) in the plan doc
- [ ] If funded: at least 1 newsletter sponsorship scheduled and paid
- [ ] Ad copy approved by reviewer agent before submission
- [ ] UTM parameters on all links so conversion is measurable in PostHog
- [ ] Post-campaign: actual clicks + conversions captured, ROI calculated
- [ ] If zero-budget path chosen: pitch the benchmark post to the same newsletters as *editorial* (they often feature notable launches for free)

---

### Task 5: Influencer outreach + Stack Overflow + GitHub Discussions seeding

**Why:** Third-party mentions are the hardest signal to fake and the most heavily-weighted by LLMs for authority. One Theo reaction video, one ThePrimeagen stream, or one Syntax episode = permanent canonical mention cached everywhere. Stack Overflow answers rank for years. GitHub Discussions seed long-tail SEO from inside the highest-DA source Vertz controls.

**Files:** (3)
- `content/launches/influencer-outreach.md` (new) — target list, message templates, response tracking
- `content/launches/stack-overflow-seeding.md` (new) — questions to answer, questions to ask, [vertz] tag creation plan
- `content/launches/github-discussions-seed.md` (new) — first 20 discussions to start with

**What to implement:**

Influencer outreach (personal message, not blast):
- **Target list**:
  - Theo (t3.gg) — if he reacts, benchmark post goes viral; hook: comparison to t3-stack + his typical takes on full-stack TS
  - ThePrimeagen — strong Rust appetite; angle: custom Rust runtime
  - Fireship (Jeff) — covers new frameworks; angle: "full-stack TS you haven't heard of"
  - Syntax (Wes + Scott) — podcast appearance opportunity
  - JS Party — podcast appearance
  - Traversy Media — tutorial audience
  - Web Dev Simplified — pragmatic tutorial angle
- **Message template** (NOT a template-looking message):
  - Max 3 sentences. Specific, personalized.
  - Include the benchmark post link (the one asset that sells itself)
  - Offer: free pilot, early access, or on-call for a video/stream
- **Follow-up**: 1 polite follow-up after 7 days. Then stop.

Stack Overflow strategy:
- **Week 1**: answer 5 questions per day on TS / full-stack / ORM topics. Each answer is genuinely helpful first; Vertz is mentioned only when it actually fits the question. No keyword stuffing.
- **Tag creation**: once there are 5+ questions with "vertz" in body or title, request tag creation via mod. Need 150+ rep to create tag; if we don't have it yet, cultivate via answers first.
- **Seed Q's**: ask 3 legitimate questions about Vertz edge cases from a secondary account — NOT from Matheus's main account. These create the foundation for the `[vertz]` tag.

GitHub Discussions seeding:
- Convert 20 genuine FAQ/gotcha items into Discussions on `vertz-dev/vertz` repo
- Each has a clear question title and a thorough self-answer
- Categories: "Q&A", "Show and Tell", "Ideas"
- Cross-link to docs/blog where relevant
- These pages are indexed by Google within 48h — zero-effort long-tail SEO

**Acceptance criteria:**
- [ ] Outreach messages sent to 7 named influencers with personalized content
- [ ] ≥2 responses received (even if "maybe later") — response rate <30% means messages need work
- [ ] 25 Stack Overflow answers posted over 5 days; ≥5 receive upvotes
- [ ] `[vertz]` tag created on Stack Overflow OR cultivation plan documented if rep insufficient
- [ ] 20 GitHub Discussions published with self-answers
- [ ] All discussions linked from relevant docs pages (bidirectional)

---

## Dependencies

```
Task 1 (HN launch)            ─── blocked by Phase 1 complete + Phase 2 benchmark post published
Task 2 (PH launch)            ─── schedule ≥3 days after HN
Task 3 (Reddit blitz)          ─── can run day 1 of this phase, 1 post per day
Task 4 (Newsletters)          ─── scheduled week of benchmark post drop; decoupled from launches
Task 5 (Outreach + SO + GH)   ─── starts day 1, runs throughout phase
```

## Done when

- [ ] All 5 tasks' acceptance criteria checked
- [ ] HN launch reached top 30 (success) or top 10 (great)
- [ ] PH launch reached top 10 product of the day
- [ ] 4 Reddit posts live, ≥2 hit engagement threshold
- [ ] If budget approved: ≥1 newsletter sponsorship live
- [ ] 7 influencer DMs sent with ≥2 responses
- [ ] ≥25 Stack Overflow answers published
- [ ] ≥20 GitHub Discussions seeded
- [ ] Analytics show visible spike in unique visitors, GitHub stars, npm downloads vs pre-phase baseline
- [ ] Phase review file written at `reviews/geo-seo-strategy/phase-03-distribution-blitz.md` by a different agent
