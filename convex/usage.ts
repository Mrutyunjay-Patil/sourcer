import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireBusiness } from "./lib/access";
import { rateLimiter } from "./lib/limits";

// SRC-15: per-business daily ceiling on model calls. The rate-limiter
// component enforces it transactionally; the aiUsage table keeps a readable
// daily tally for the UI.

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Admit one model call or throw a message the owner can act on. */
export const reserve = internalMutation({
  args: { businessId: v.id("businesses"), purpose: v.string() },
  handler: async (ctx, { businessId, purpose }) => {
    const key = businessId;
    const requests = await rateLimiter.limit(ctx, "aiRequests", { key });
    if (!requests.ok) {
      throw new ConvexError(
        `Daily AI request budget reached. ${purpose} will resume in about ${Math.ceil(requests.retryAfter / 60_000)} minutes.`,
      );
    }
    const tokens = await rateLimiter.check(ctx, "aiTokens", { key });
    if (!tokens.ok) {
      throw new ConvexError(
        `Daily AI token budget reached. ${purpose} will resume in about ${Math.ceil(tokens.retryAfter / 60_000)} minutes.`,
      );
    }
    const day = today();
    const row = await ctx.db
      .query("aiUsage")
      .withIndex("by_business_day", (q) => q.eq("businessId", businessId).eq("day", day))
      .unique();
    if (row) await ctx.db.patch(row._id, { requests: row.requests + 1 });
    else await ctx.db.insert("aiUsage", { businessId, day, requests: 1, inputTokens: 0, outputTokens: 0 });
  },
});

/** Settle the tokens a call actually used against the daily token budget. */
export const record = internalMutation({
  args: { businessId: v.id("businesses"), inputTokens: v.number(), outputTokens: v.number() },
  handler: async (ctx, { businessId, inputTokens, outputTokens }) => {
    const used = Math.max(0, Math.round(inputTokens + outputTokens));
    if (used > 0) {
      // reserve:true lets the balance go negative for this call; the next
      // reserve() then sees an exhausted token bucket.
      await rateLimiter.limit(ctx, "aiTokens", { key: businessId, count: used, reserve: true });
    }
    const day = today();
    const row = await ctx.db
      .query("aiUsage")
      .withIndex("by_business_day", (q) => q.eq("businessId", businessId).eq("day", day))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { inputTokens: row.inputTokens + inputTokens, outputTokens: row.outputTokens + outputTokens });
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

/** Reactive budget readout for the shell: what is used and what is left. */
export const today_ = query({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    const row = await ctx.db
      .query("aiUsage")
      .withIndex("by_business_day", (q) => q.eq("businessId", business._id).eq("day", today()))
      .unique();
    const [req, tok] = await Promise.all([
      rateLimiter.getValue(ctx, "aiRequests", { key: business._id }),
      rateLimiter.getValue(ctx, "aiTokens", { key: business._id }),
    ]);
    return {
      requests: row?.requests ?? 0,
      requestLimit: req.config.rate,
      requestsLeft: Math.max(0, Math.floor(req.value)),
      tokens: (row?.inputTokens ?? 0) + (row?.outputTokens ?? 0),
      tokenLimit: tok.config.rate,
      tokensLeft: Math.max(0, Math.floor(tok.value)),
    };
  },
});
