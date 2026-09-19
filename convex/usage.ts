import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireBusiness } from "./lib/access";

// SRC-15: per-business daily ceiling on model calls. Limits are deployment
// env vars so they can be tuned without a code push.

function limits() {
  return {
    requests: Number(process.env.AI_DAILY_REQUEST_LIMIT ?? 300),
    tokens: Number(process.env.AI_DAILY_TOKEN_LIMIT ?? 600_000),
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const reserve = internalMutation({
  args: { businessId: v.id("businesses"), purpose: v.string() },
  handler: async (ctx, { businessId, purpose }) => {
    const day = today();
    const row = await ctx.db
      .query("aiUsage")
      .withIndex("by_business_day", (q) => q.eq("businessId", businessId).eq("day", day))
      .unique();
    const { requests, tokens } = limits();
    const used = row ?? { requests: 0, inputTokens: 0, outputTokens: 0 };
    if (used.requests >= requests || used.inputTokens + used.outputTokens >= tokens) {
      throw new ConvexError(
        `Daily AI budget reached for today (${used.requests}/${requests} requests). ${purpose} will resume tomorrow.`,
      );
    }
    if (row) {
      await ctx.db.patch(row._id, { requests: row.requests + 1 });
    } else {
      await ctx.db.insert("aiUsage", { businessId, day, requests: 1, inputTokens: 0, outputTokens: 0 });
    }
  },
});

export const record = internalMutation({
  args: { businessId: v.id("businesses"), inputTokens: v.number(), outputTokens: v.number() },
  handler: async (ctx, { businessId, inputTokens, outputTokens }) => {
    const day = today();
    const row = await ctx.db
      .query("aiUsage")
      .withIndex("by_business_day", (q) => q.eq("businessId", businessId).eq("day", day))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, {
        inputTokens: row.inputTokens + inputTokens,
        outputTokens: row.outputTokens + outputTokens,
      });
    } else {
      await ctx.db.insert("aiUsage", { businessId, day, requests: 1, inputTokens, outputTokens });
    }
  },
});

export const businessForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    ctx.db
      .query("businesses")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .unique(),
});

export const today_ = query({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    const row = await ctx.db
      .query("aiUsage")
      .withIndex("by_business_day", (q) => q.eq("businessId", business._id).eq("day", today()))
      .unique();
    const { requests, tokens } = limits();
    return {
      requests: row?.requests ?? 0,
      requestLimit: requests,
      tokens: (row?.inputTokens ?? 0) + (row?.outputTokens ?? 0),
      tokenLimit: tokens,
    };
  },
});
