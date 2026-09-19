import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";

// App-owned HTTP routes (AgentMail + Firecrawl webhooks) live under /api so the
// static site can own the root of the convex.site domain.
const app = defineApp({ httpPrefix: "/api" });
app.use(staticHosting, { httpPrefix: "/" });

export default app;
