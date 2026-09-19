import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { agentmail } from "./email";

const http = httpRouter();

// Auth discovery routes (/.well-known/*) must live at the site root.
auth.addHttpRoutes(http);

// AgentMail inbound webhook: Svix signature verified and deduplicated by
// event id inside the component before our callbacks run.
http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) =>
    agentmail.handleWebhook(ctx as unknown as Parameters<typeof agentmail.handleWebhook>[0], req),
  ),
});

// Static site catch-all goes last; exact routes above always win.
registerStaticRoutes(http, components.staticHosting);

export default http;
