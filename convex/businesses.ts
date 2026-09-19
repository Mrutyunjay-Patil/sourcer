import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { currentBusiness, requireBusiness, requireUserId } from "./lib/access";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const business = await currentBusiness(ctx);
    if (!business) return null;
    return {
      _id: business._id,
      name: business.name,
      category: business.category,
      city: business.city,
      deliveryPreferences: business.deliveryPreferences,
      currency: business.currency,
      agentInboxId: business.agentInboxId ?? null,
      inboxError: business.inboxError ?? null,
      onboardingComplete: business.onboardingComplete,
      isDemo: business.isDemo,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    city: v.string(),
    deliveryPreferences: v.string(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await currentBusiness(ctx);
    if (existing) {
      throw new ConvexError("You already have a business.");
    }
    const name = args.name.trim();
    if (name.length < 2) {
      throw new ConvexError("Business name is too short.");
    }
    const businessId = await ctx.db.insert("businesses", {
      ownerUserId: userId,
      name,
      category: args.category.trim() || "restaurant",
      city: args.city.trim(),
      deliveryPreferences: args.deliveryPreferences.trim(),
      currency: args.currency.trim().toUpperCase() || "INR",
      onboardingComplete: false,
      isDemo: false,
    });
    // Provision the dedicated AgentMail inbox for this business.
    await ctx.scheduler.runAfter(0, internal.email.provisionInbox, { businessId });
    return businessId;
  },
});

export const update = mutation({
  args: {
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    city: v.optional(v.string()),
    deliveryPreferences: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const business = await requireBusiness(ctx);
    const patch: Record<string, string> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === "string" && value.trim()) patch[key] = value.trim();
    }
    await ctx.db.patch(business._id, patch);
  },
});

export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    await ctx.db.patch(business._id, { onboardingComplete: true });
  },
});

export const setInbox = internalMutation({
  args: { businessId: v.id("businesses"), inboxId: v.string() },
  handler: async (ctx, { businessId, inboxId }) => {
    await ctx.db.patch(businessId, { agentInboxId: inboxId, inboxError: undefined });
  },
});

export const setInboxError = internalMutation({
  args: { businessId: v.id("businesses"), error: v.string() },
  handler: async (ctx, { businessId, error }) => {
    await ctx.db.patch(businessId, { inboxError: error });
  },
});

/** Owner retry after freeing an inbox slot. */
export const retryInbox = mutation({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    if (business.agentInboxId) return;
    await ctx.db.patch(business._id, { inboxError: undefined });
    await ctx.scheduler.runAfter(0, internal.email.provisionInbox, { businessId: business._id });
  },
});
