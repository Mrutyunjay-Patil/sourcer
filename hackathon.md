# Hackathon log

- **Project:** Sourcer
- **Event:** Convex All Gas Hackathon (sponsored by OpenAI, Firecrawl, AgentMail)
- **What it does:** Supplier sourcing and reorder agent for restaurants and small shops: discovers suppliers, runs the RFQ email thread, parses and ranks quotes, and sends the purchase order.
- **Live app:** https://careful-capybara-546.convex.site
- **Repo:** https://github.com/Mrutyunjay-Patil/sourcer
- **Frontend:** Convex static hosting
- **Convex deployment:** https://careful-capybara-546.convex.cloud
- **Components:** @convex-dev/static-hosting, @agentmail/convex, @firecrawl/firecrawl-convex, @convex-dev/workflow
- **Convex features:** schema, indexes, queries, mutations, actions, Node actions, scheduled functions, crons, file storage, HTTP actions, components, durable workflows
- **AI models:** openai/gpt-oss-120b (OpenAI open-weight model served through Cloudflare Workers AI via the OpenAI SDK; base URL and model are env vars so api.openai.com is a one-line switch)
- **Auth:** Convex Auth
- **Started:** 2026-09-19T14:59:33Z
- **Last updated:** 2026-09-19T17:05:00Z

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
