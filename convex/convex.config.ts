import { defineApp } from "convex/server";
import { v } from "convex/values";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import agentmail from "@agentmail/convex/convex.config";
import firecrawl from "@firecrawl/firecrawl-convex/convex.config";
import workflow from "@convex-dev/workflow/convex.config";

// App-owned root routing: convex/http.ts keeps auth discovery routes and the
// sponsor webhooks at the root of the convex.site domain, and registers the
// static site catch-all last.
const app = defineApp({
  env: {
    FIRECRAWL_API_KEY: v.string(),
    FIRECRAWL_WEBHOOK_SECRET: v.optional(v.string()),
  },
});

app.use(staticHosting);
app.use(agentmail);
app.use(firecrawl, {
  httpPrefix: "/firecrawl/",
  env: {
    FIRECRAWL_API_KEY: app.env.FIRECRAWL_API_KEY,
    FIRECRAWL_WEBHOOK_SECRET: app.env.FIRECRAWL_WEBHOOK_SECRET,
  },
});
app.use(workflow);

export default app;
