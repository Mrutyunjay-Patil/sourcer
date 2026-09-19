# Sourcer

Supplier sourcing and reorder agent for restaurants and small shops.

Type what the kitchen needs. Sourcer finds suppliers with Firecrawl, emails them for quotes from a dedicated AgentMail inbox, reads the replies with OpenAI the moment they land, ranks them, and sends the purchase order in the same email thread. Convex runs all of it live: reactive queries, durable workflows, crons, file storage, and static hosting.

Built for the Convex All Gas Hackathon. Build log: [hackathon.md](./hackathon.md).

Live app: https://careful-capybara-546.convex.site (demo sign-in: `judge@sourcer.demo` / `SourcerJudge2026`)

## How the sponsors do real work

- **Firecrawl** searches the web for wholesale suppliers near the business, scrapes candidate pages, and re-crawls tracked price pages weekly so the price watch shows week-over-week movement.
- **AgentMail** gives every business its own inbox. RFQs, follow-up nudges, and purchase orders go out through it, and supplier replies arrive through a Svix-signed webhook straight into the quote board.
- **OpenAI** turns a shopping note into line items (asking about ambiguous ones), drafts the RFQ email in the owner's voice, parses messy prose and PDF price sheets into structured quotes with confidence scores, and writes the ranking rationale.

## Run locally

1. `npm install` (also applies the AgentMail component patch in `patches/`)
2. `npx convex dev` and follow the prompts to create a dev deployment; this writes `.env.local`
3. Set the deployment env vars (see below)
4. `npm run dev` and open http://localhost:5173

## Environment variables (on the Convex deployment)

| Name | Purpose |
| --- | --- |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | OpenAI SDK target. Point at api.openai.com or any OpenAI-compatible gateway. |
| `FIRECRAWL_API_KEY` | Firecrawl component |
| `AGENTMAIL_API_KEY` | Organization-scoped AgentMail key (needed to create inboxes) |
| `AGENTMAIL_WEBHOOK_SECRET` | Signing secret of the webhook pointed at `https://<deployment>.convex.site/agentmail/webhook` |
| `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` | Convex Auth |
| `AI_DAILY_REQUEST_LIMIT`, `AI_DAILY_TOKEN_LIMIT` | Optional per-business daily AI spend ceiling |

Set them with `npx convex env set NAME value` (use `--prod` for production).

## Deploy

```bash
npx convex deploy -y && npx @convex-dev/static-hosting deploy --skip-convex
```

## Layout

- `convex/schema.ts` tables, every business-scoped table indexed on `businessId`
- `convex/email.ts` AgentMail inbox, sends, inbound webhook handler, follow-ups
- `convex/ai.ts` OpenAI parsing, drafting, quote extraction, ranking
- `convex/workflow.ts` durable RFQ lifecycle
- `convex/discovery.ts`, `convex/pricing.ts` Firecrawl discovery and price tracking
- `convex/purchaseOrders.ts` PO approval and send
- `src/` Vite + React client
