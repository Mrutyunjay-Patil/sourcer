# Hackathon log

- **Project:** Sourcer
- **Event:** Convex All Gas Hackathon (sponsored by OpenAI, Firecrawl, AgentMail)
- **What it does:** Supplier sourcing and reorder agent for restaurants and small shops: discovers suppliers, runs the RFQ email thread, parses and ranks quotes, and sends the purchase order.
- **Live app:** https://careful-capybara-546.convex.site
- **Repo:** https://github.com/Mrutyunjay-Patil/sourcer
- **Frontend:** Convex static hosting
- **Convex deployment:** https://careful-capybara-546.convex.cloud
- **Components:** @convex-dev/static-hosting, @agentmail/convex, @firecrawl/firecrawl-convex, @convex-dev/workflow, @convex-dev/rate-limiter
- **Convex features:** schema, indexes, queries, mutations, actions, Node actions, scheduled functions, crons, file storage, HTTP actions, components, durable workflows
- **AI models:** openai/gpt-oss-120b (OpenAI open-weight model served through Cloudflare Workers AI via the OpenAI SDK; base URL and model are env vars so api.openai.com is a one-line switch)
- **Auth:** Convex Auth
- **Started:** 2026-09-19T14:59:33Z
- **Last updated:** 2026-09-19T21:00:00Z

## The pitch

A restaurant owner in Bengaluru re-orders the same twenty things every
Thursday and loses the morning to WhatsApp and email chasing quotes. Sourcer
takes the note ("20 kg paneer, 10 L sunflower oil, 5 kg tomatoes, and some
eggs"), finds suppliers, runs the quote thread by email, reads every reply
the moment it lands, ranks the quotes with a written reason, and sends the
purchase order back in the same thread.

- Live app: https://careful-capybara-546.convex.site
- Demo video: `docs/demo/sourcer-demo.mp4` in this repo (2:56, owner's narration; animated intro on the family shop, then one fresh live run on production cut sentence by sentence to the narration); YouTube link added at submission
- Repo: https://github.com/Mrutyunjay-Patil/sourcer

### Judge access

- Sign in at https://careful-capybara-546.convex.site with
  `judge@sourcer.demo` / `SourcerJudge2026` (seeded demo kitchen, Chai
  Corner Cafe, Bengaluru). Or create your own account; onboarding takes a
  minute and has a "load the seeded demo kitchen" shortcut.
- On any sent request, the "Demo suppliers" buttons make a real supplier
  inbox on AgentMail reply to its RFQ email. The reply travels through
  AgentMail, hits the signed webhook, and lands on the board live. Nothing
  is simulated inside the app.
- The free AgentMail plan allows three inboxes, so the demo runs with one
  sourcing inbox and two supplier inboxes.

### How each sponsor does real work

- **Firecrawl** runs the supplier discovery search and scrapes candidate
  pages so OpenAI can keep only real wholesalers; it scrapes tracked price
  pages on a weekly cron; and its durable crawl walks a supplier's whole
  site with pages streaming into Convex and progress shown live, every
  priced page becoming a tracked page (`convex/discovery.ts`,
  `convex/pricing.ts`).
- **AgentMail** gives each business its own inbox; RFQs, follow-up nudges
  and purchase orders go out through the component's durable sender, and
  supplier replies come back through the Svix-signed webhook into the quote
  board without polling (`convex/email.ts`, `convex/http.ts`).
- **OpenAI** parses the owner's note into line items and asks about
  ambiguity, drafts the RFQ in the owner's voice, extracts structured
  quotes from prose and PDF price sheets with confidence scores, and writes
  the ranking rationale (`convex/ai.ts`).

### Convex primitives and why

- Reactive queries: the quote board, supplier statuses, ranking and crawl
  progress update the instant a mutation commits.
- Rate-limiter component: the per-business daily AI request and token
  budgets, discovery and site-crawl throttles are transactional limits, not
  a hand-rolled counter (`convex/lib/limits.ts`, `convex/usage.ts`).
- Mutations with tenant scoping resolved from auth, never from client input
  (`convex/lib/access.ts`).
- Convex Auth (password) for sign in and the judge demo account.
- Workflow component: one durable job per RFQ for fan-out, send
  confirmation, follow-up, close and rank; survives deploys and retries
  without double sends (`convex/workflow.ts`).
- Scheduled functions and crons: AI drafting and parsing off the request
  path, RFQ auto-close every 5 minutes, weekly price re-crawl.
- File storage for reply attachments with PDF text extraction in a Node
  action (`convex/attachments.ts`).
- HTTP actions for the AgentMail webhook and auth discovery, static hosting
  for the app on convex.site.

## Log

### 2026-09-19 - 23d3012
Scaffolded Vite + React + TypeScript with a Convex backend. Registered the
static hosting component and deployed the empty site to production so the
live URL existed from the first commit (`convex/convex.config.ts`,
`package.json` deploy script). Convex features: query, components.

### 2026-09-19 - 31f5783
Shipped the whole backend in one pass.
- Schema with 14 business-scoped tables, every one indexed on `businessId`
  so tenant isolation happens in queries, never in the client
  (`convex/schema.ts`, `convex/lib/access.ts`).
- Convex Auth with password sign-in; auth discovery routes kept at the site
  root by moving static hosting to app-owned root routing
  (`convex/auth.ts`, `convex/http.ts`).
- AgentMail spine: inbox per business, durable RFQ sends through the
  component's workpool, Svix-verified inbound webhook, `onMessageReceived`
  matching replies to RFQ threads, quarantine for unmatched mail, bounce and
  reject handling, follow-up nudges that reply in the original thread
  (`convex/email.ts`, `convex/http.ts`).
- Attachments downloaded from AgentMail into Convex file storage with PDF
  text extraction in a Node action, size limit surfaced to the owner
  (`convex/attachments.ts`).
- OpenAI reasoning behind a per-business daily spend guard: plain-language
  item parsing, RFQ drafting in the owner's voice, messy and PDF quote
  parsing into validated line items with low-confidence review, deterministic
  ranking on landed price, coverage and lead time with model-written
  rationale, catalog price extraction, supplier candidate filtering
  (`convex/ai.ts`, `convex/lib/llm.ts`, `convex/usage.ts`).
- Durable RFQ lifecycle as one Workflow component job: fan out, confirm each
  send, open, follow up silent suppliers, close at reply-by, rank
  (`convex/workflow.ts`).
- Crons: close expired RFQs every 5 minutes, weekly supplier price re-crawl
  (`convex/crons.ts`).
- Firecrawl discovery from an item request with domain dedupe and owner
  review, tracked supplier pages with catalog price extraction and
  week-over-week diff (`convex/discovery.ts`, `convex/pricing.ts`).
- Purchase orders approved per line, sent through AgentMail in the existing
  thread, locked against double send (`convex/purchaseOrders.ts`).
Convex features: schema, indexes, queries, mutations, actions, Node actions,
scheduled functions, crons, file storage, HTTP actions, workflows.

### 2026-09-19 - 1be4be4
Found that Convex isolates component env vars and the published AgentMail
component declares none, so it could never read its API key. Patched the
component to declare `AGENTMAIL_API_KEY`, `AGENTMAIL_BASE_URL` and
`AGENTMAIL_WEBHOOK_SECRET` and bound them from the app definition, kept as a
committed patch-package patch so a fresh clone gets the fix
(`patches/@agentmail+convex+0.1.0.patch`, `convex/convex.config.ts`).
Inbox provisioning now calls the AgentMail REST API directly because the
component's inbox functions are internal to the component
(`convex/email.ts`). Verified on the dev deployment: the model drafted a
real RFQ email, Firecrawl search and scrape returned live pages through the
component, and the AgentMail component listed inboxes with the bound key.

### 2026-09-19 - 0c8b600
Built the whole owner-facing product on top of reactive queries: sign in
and sign up with Convex Auth, one-minute onboarding with a skippable seeded
demo, a plain-language request composer where OpenAI turns a note into
editable line-item chips and asks about ambiguous items instead of guessing,
the request page with the AI-drafted email the owner can edit before send,
and the live quote board with a durable-workflow progress strip, per-supplier
send status, per-item price comparison, ranked quote cards with rationale,
attachments, low-confidence review, and purchase-order approval per line
(`src/pages/*.tsx`, `src/components/*.tsx`, `src/index.css`). Supplier book
with Firecrawl discovery and owner accept or reject, price watch with
week-over-week direction and a trend sparkline, order history, and the
quarantine inbox round it out. Verified in the browser on the dev
deployment: sign up, onboarding, OpenAI item parsing (eggs flagged with a
question), AI draft, and a real RFQ send through the AgentMail component.
Deployed backend and static site to production.

### 2026-09-19 - 432849e, 0c67c9b
Relative times now tick, every non-submit button is typed, README documents
setup in under ten steps, and the demo script and social copy live in
`docs/`. Repo readiness pass: a fresh clone installs, applies the
component patch and typechecks clean; a secret scan of tracked files found
nothing. Verified on the dev deployment: the durable workflow closed an
open RFQ one second after its reply-by time and the owner notification
went out; Firecrawl discovery returned three Bengaluru wholesalers for
owner review; a tracked IndiaMART page yielded eight catalog paneer prices
through Firecrawl scrape plus OpenAI extraction, now visible in the price
watch with a trend sparkline (`convex/pricing.ts`, `src/pages/Prices.tsx`).

### 2026-09-20 - 3e638fd and working tree
End-to-end run of the email loop on the dev deployment with real AgentMail
inboxes: an RFQ went to two supplier inboxes, each replied through the
AgentMail API, the signed webhook landed each reply on the quote board
within seconds, OpenAI parsed the clean prose reply (99% confidence), the
messy one ("out of stock till next week" became a 7 day lead time, 96%)
and a PDF price sheet (attachment stored in file storage, text extracted,
97%), the ranking recomputed after every reply with a written rationale,
the purchase order generated per line and sent, an unrelated email was
quarantined, and a reply after close was flagged late.
Bugs found and fixed by that run:
- The AgentMail attachment endpoint returns metadata with a signed CDN URL,
  not bytes; ingestion now follows it and falls back to AgentMail's own
  text extraction (`convex/attachments.ts`).
- pdf.js detaches the buffer it parses, so the stored size read as 0; a
  copy is parsed now.
- Replying to our own outbound message made AgentMail address follow-ups
  and purchase orders back to the sourcing inbox; both now reply to the
  supplier's message with an explicit recipient (`convex/email.ts`,
  `convex/purchaseOrders.ts`).
- The model spent its output budget on hidden reasoning; the JSON helper
  now requests low reasoning effort, gives a larger budget and widens it
  on retry (`convex/lib/llm.ts`).
- Auto-suggested PO suppliers were treated as owner choices; owner
  overrides are tracked separately so the recommendation keeps updating.
- Free AgentMail plans cap inboxes at 3; provisioning now surfaces a
  retryable message and the demo seed reuses existing inboxes.
Production: judge account created, demo kitchen seeded, sourcing inbox
attached, dev webhook removed so production owns inbox events.

### 2026-09-20 - working tree
Production verification with the judge account: the full flow ran under
Playwright against the live site in 93 seconds (note to line items, eggs
question, AI draft, send to two real supplier inboxes, two replies landing
through the webhook, parse, rank, purchase order sent) and the recording is
the demo video (`docs/demo/sourcer-demo.mp4`, recorder in
`docs/demo/record.mjs`). Separately verified on production: the purchase
order now arrives in the supplier's inbox, and a silent supplier received
exactly one follow-up nudge two minutes after the RFQ while the supplier
who had replied received none. Added a one-click demo reset for demo
accounts (`src/components/Shell.tsx`, `convex/demoData.ts`). Deployed
build shows no console errors on the request, prices and orders screens.

### 2026-09-20 - working tree
Re-made the demo video: a 40 second Remotion (React) intro that tells the
problem through the family provision shop, followed by a slower live
walkthrough on production with a visible cursor and no subtitles, cut to
2:54 total (`docs/demo/intro/`, `docs/demo/record.mjs`,
`docs/demo/sourcer-demo.mp4`). Voice-over script with timestamps for the
owner to record is in `docs/demo/voiceover.md`.

### 2026-09-20 - working tree (video, second pass)
Added a Firecrawl segment to the video: supplier discovery returning three
Bengaluru wholesalers with reasons, and the price watch showing a tracked
IndiaMART page scraped into eight catalog prices (`docs/demo/record-firecrawl.mjs`,
`docs/demo/splice.py`). Fixed the intro artwork and re-timed the voice-over.

### 2026-09-20 - working tree (video, final)
The owner recorded the narration. Cleaned it (noise reduction, de-ess,
compression, EQ, loudness to -16 LUFS), transcribed it with word timestamps
(Whisper on Workers AI), re-timed the Remotion intro scenes to the spoken
lines, recorded one complete fresh run on production after a demo reset
(Firecrawl discovery, a tracked price page crawled live, request, two real
replies, ranking, purchase order), and cut each screen change to the line
that describes it (`docs/demo/assemble.py`, `docs/demo/beats.json`). Fixed
the Supplier book layout where the add-supplier card overlapped the tables
at wide viewports (`src/index.css`, `src/pages/Suppliers.tsx`).

### 2026-09-20 - working tree (video, narration rewrite)
Rewrote the narration in the owner's own words (the shop is his mother's,
the problem is the repeated chasing every restock), re-timed the Remotion
intro and added an outro title card to the new audio, and re-cut the fresh
production run so each sentence has its own screen for exactly as long as
it is spoken, with cut points placed from the actual footage rather than
script marks (`docs/demo/assemble.py`, `docs/demo/beats.json`,
`docs/demo/voiceover.md`).

### 2026-09-20 - working tree (responsive pass and tests)
Every page now collapses to one column below 900px, tables scroll inside
their card on phones, and spacing tightens below 480px (`src/index.css`).
Added a test suite: Vitest with Testing Library for the formatting and
error helpers, sign-in, the request composer, dashboard and shell (mocked
Convex hooks), and convex-test for tenant isolation, validation, ranking
and purchase-order override rules against the real schema (38 tests,
`npm test`). A Playwright smoke test signs in to the deployed app and checks
every page at phone, tablet and desktop widths for overflow and console
errors (`npm run test:e2e`), passing on production.

### 2026-09-20 - working tree (lean on components)
Audit of what was custom where a component exists. Replaced the hand-rolled
AI spend counter with the rate-limiter component (fixed-window request and
token budgets per business, plus token-bucket throttles for discovery and
site crawls). Added Firecrawl's durable crawl: "Crawl site" on a supplier
starts a component-tracked crawl, pages land in Convex as they arrive,
progress and credits used are a reactive query, and OpenAI extracts prices
only from pages that mention a price; every priced page becomes a tracked
page for the weekly cron. The quote card now shows the actual email
conversation from the AgentMail component's stored inbound messages.
The AI Budget component was evaluated and skipped for now: its published
alpha has no metering hook for direct provider calls.
