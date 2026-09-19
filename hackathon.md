# Hackathon log

- **Project:** Sourcer
- **Event:** Convex All Gas Hackathon (sponsored by OpenAI, Firecrawl, AgentMail)
- **What it does:** Supplier sourcing and reorder agent for restaurants and small shops: discovers suppliers, runs the RFQ email thread, parses and ranks quotes, and sends the purchase order.
- **Live app:** https://careful-capybara-546.convex.site
- **Repo:** https://github.com/Mrutyunjay-Patil/sourcer
- **Frontend:** Convex static hosting
- **Convex deployment:** https://careful-capybara-546.convex.cloud
- **Components:** @convex-dev/static-hosting
- **Convex features:** query
- **Auth:** none
- **AI models:** none
- **Started:** 2026-09-19T14:50:00Z
- **Last updated:** 2026-09-19T15:00:00Z

## Log

### 2026-09-19 - working tree
Scaffolded Vite + React + TypeScript with a Convex backend. Registered the
static hosting component with app HTTP routes moved under `/api` so the site
owns the root of the convex.site domain (`convex/convex.config.ts`). Added an
empty schema and a health query the client subscribes to (`convex/schema.ts`,
`convex/health.ts`, `src/App.tsx`). Deployed backend and static site to
production; the live URL opens without a login wall. Convex features: query.
