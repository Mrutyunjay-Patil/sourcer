# Sourcer

Supplier sourcing and reorder agent for restaurants and small shops.
Built for the Convex All Gas Hackathon. Build log: [hackathon.md](./hackathon.md).

Live: https://careful-capybara-546.convex.site

## Run locally

1. `npm install`
2. `npx convex dev` (creates `.env.local` with your dev deployment)
3. `npm run dev`

## Deploy

`npx convex deploy -y && npx @convex-dev/static-hosting deploy --skip-convex`
