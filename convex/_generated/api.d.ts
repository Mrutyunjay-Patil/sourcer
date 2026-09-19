/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as businesses from "../businesses.js";
import type * as crons from "../crons.js";
import type * as demo from "../demo.js";
import type * as demoData from "../demoData.js";
import type * as discovery from "../discovery.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_llm from "../lib/llm.js";
import type * as notify from "../notify.js";
import type * as pricing from "../pricing.js";
import type * as purchaseOrders from "../purchaseOrders.js";
import type * as quotes from "../quotes.js";
import type * as rfqs from "../rfqs.js";
import type * as staticHosting from "../staticHosting.js";
import type * as suppliers from "../suppliers.js";
import type * as usage from "../usage.js";
import type * as workflow from "../workflow.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  attachments: typeof attachments;
  auth: typeof auth;
  businesses: typeof businesses;
  crons: typeof crons;
  demo: typeof demo;
  demoData: typeof demoData;
  discovery: typeof discovery;
  email: typeof email;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/llm": typeof lib_llm;
  notify: typeof notify;
  pricing: typeof pricing;
  purchaseOrders: typeof purchaseOrders;
  quotes: typeof quotes;
  rfqs: typeof rfqs;
  staticHosting: typeof staticHosting;
  suppliers: typeof suppliers;
  usage: typeof usage;
  workflow: typeof workflow;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
  agentmail: import("@agentmail/convex/_generated/component.js").ComponentApi<"agentmail">;
  firecrawl: import("@firecrawl/firecrawl-convex/_generated/component.js").ComponentApi<"firecrawl">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
