import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { start } from "@convex-dev/workflow";
import { canonicalName, requireBusiness } from "./lib/access";

// Seed and reset for the demo account (SRC-22 skippable onboarding, SRC-28).

export const seedMine = mutation({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    await ctx.db.patch(business._id, { isDemo: true, onboardingComplete: true });
    await ctx.scheduler.runAfter(0, internal.demo.seedBusiness, { businessId: business._id });
  },
});

export const applySeed = internalMutation({
  args: {
    businessId: v.id("businesses"),
    suppliers: v.array(
      v.object({ key: v.string(), email: v.string(), name: v.string(), website: v.string() }),
    ),
  },
  handler: async (ctx, { businessId, suppliers }) => {
    const ids: Record<string, Id<"suppliers">> = {};
    for (const s of suppliers) {
      const existing = await ctx.db
        .query("suppliers")
        .withIndex("by_business_email", (q) => q.eq("businessId", businessId).eq("email", s.email))
        .first();
      if (existing) {
        ids[s.key] = existing._id;
        continue;
      }
      ids[s.key] = await ctx.db.insert("suppliers", {
        businessId,
        name: s.name,
        email: s.email,
        website: s.website,
        domain: new URL(s.website).hostname,
        source: "manual",
        status: "accepted",
        notes: "Demo supplier inbox on AgentMail; replies are real emails.",
      });
    }
    // Historical price observations so the trend view and week-over-week
    // indicators have something to show on day one.
    const history: Array<[string, string, string, number[]]> = [
      ["paneer", "kg", "nandini", [300, 305, 310, 318]],
      ["sunflower oil", "L", "metro", [132, 135, 141, 146]],
      ["tomato", "kg", "greenleaf", [42, 38, 36, 34]],
      ["onion", "kg", "greenleaf", [31, 30, 29, 28]],
      ["basmati rice", "kg", "metro", [92, 92, 95, 96]],
    ];
    const existingHistory = await ctx.db
      .query("priceHistory")
      .withIndex("by_business", (q) => q.eq("businessId", businessId))
      .first();
    if (!existingHistory) {
      const week = 7 * 24 * 3600_000;
      const fallbackKey = Object.keys(ids)[0];
      for (const [product, unit, rawKey, prices] of history) {
        const key = ids[rawKey] ? rawKey : fallbackKey;
        if (!key) break;
        const canonical = canonicalName(product);
        const existingProduct = await ctx.db
          .query("products")
          .withIndex("by_business_canonical", (q) => q.eq("businessId", businessId).eq("canonicalName", canonical))
          .first();
        if (!existingProduct) {
          await ctx.db.insert("products", { businessId, name: product, canonicalName: canonical, unit });
        }
        let prev: number | undefined;
        prices.forEach((price, i) => {
          const observedAt = Date.now() - (prices.length - i) * week;
          void ctx.db.insert("priceHistory", {
            businessId,
            supplierId: ids[key],
            productName: product,
            canonicalName: canonical,
            unitPrice: price,
            currency: "INR",
            unit,
            source: i === prices.length - 1 ? "quote" : "catalog",
            observedAt,
            deltaFromPrevious: prev === undefined ? undefined : price - prev,
          });
          prev = price;
        });
      }
    }
  },
});

/** One-command reset: wipe RFQ activity, keep suppliers and price history. */
export const resetMine = mutation({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    if (!business.isDemo) throw new ConvexError("Reset is only available on the demo account.");
    const tables = [
      "purchaseOrders",
      "quoteLineItems",
      "quoteAttachments",
      "quotes",
      "emailThreads",
      "rfqSuppliers",
      "rfqLineItems",
      "rfqs",
      "quarantine",
      "discoveryRuns",
    ] as const;
    for (const table of tables) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_business", (q) => q.eq("businessId", business._id))
        .collect();
      for (const row of rows) {
        if (table === "quoteAttachments") {
          await ctx.storage.delete((row as { storageId: Id<"_storage"> }).storageId);
        }
        await ctx.db.delete(row._id);
      }
    }
    const candidates = await ctx.db
      .query("suppliers")
      .withIndex("by_business_status", (q) => q.eq("businessId", business._id).eq("status", "candidate"))
      .collect();
    for (const c of candidates) await ctx.db.delete(c._id);
    // Tracked pages and the catalog prices they produced go too, so a demo
    // run can show the first crawl happening live.
    const pages = await ctx.db
      .query("trackedPages")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();
    for (const p of pages) await ctx.db.delete(p._id);
    const catalog = await ctx.db
      .query("priceHistory")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .filter((q) => q.neq(q.field("sourceUrl"), undefined))
      .collect();
    for (const row of catalog) await ctx.db.delete(row._id);
    const quoteHistory = await ctx.db
      .query("priceHistory")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .filter((q) => q.eq(q.field("source"), "order"))
      .collect();
    for (const row of quoteHistory) await ctx.db.delete(row._id);
  },
});

export const supplierKeys = query({
  args: {},
  handler: async (ctx) => {
    const business = await requireBusiness(ctx);
    if (!business.isDemo) return [];
    const suppliers = await ctx.db
      .query("suppliers")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();
    return suppliers
      .filter((s) => s.email?.endsWith("@agentmail.to"))
      .map((s) => ({
        supplierId: s._id,
        name: s.name,
        email: s.email!,
        key: s.email!.includes("greenleaf") ? "greenleaf" : s.email!.includes("nandini") ? "nandini" : "metro",
      }));
  },
});

/**
 * Demo-only: ask a supplier inbox to reply to an RFQ. This still goes through
 * the real AgentMail send API and the real inbound webhook.
 */
export const triggerSupplierReply = mutation({
  args: {
    rfqId: v.id("rfqs"),
    supplierKey: v.string(),
    style: v.optional(v.union(v.literal("clean"), v.literal("messy"), v.literal("pdf"))),
  },
  handler: async (ctx, { rfqId, supplierKey, style }) => {
    const business = await requireBusiness(ctx);
    if (!business.isDemo) throw new ConvexError("Only available on the demo account.");
    const rfq = await ctx.db.get(rfqId);
    if (!rfq || rfq.businessId !== business._id) throw new ConvexError("Not found.");
    await ctx.scheduler.runAfter(0, internal.demo.replyAsSupplier, { rfqId, supplierKey, style });
  },
});

/** Internal test scaffolding used from the CLI before the UI existed. */
export const createTestBusiness = internalMutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, { email, name }) => {
    const userId = await ctx.db.insert("users", { email, name: "CLI Tester" });
    const businessId = await ctx.db.insert("businesses", {
      ownerUserId: userId,
      name,
      category: "restaurant",
      city: "Bengaluru",
      deliveryPreferences: "Deliver before 10am, back entrance.",
      currency: "INR",
      onboardingComplete: true,
      isDemo: true,
    });
    await ctx.scheduler.runAfter(0, internal.email.provisionInbox, { businessId });
    return { userId, businessId };
  },
});

export const createTestRfq = internalMutation({
  args: { businessId: v.id("businesses"), replyByMinutes: v.number(), followUpMinutes: v.number() },
  handler: async (ctx, { businessId, replyByMinutes, followUpMinutes }) => {
    const items = [
      { productName: "paneer", quantity: 20, unit: "kg" },
      { productName: "sunflower oil", quantity: 10, unit: "L" },
      { productName: "tomato", quantity: 5, unit: "kg" },
    ];
    const rfqId = await ctx.db.insert("rfqs", {
      businessId,
      title: "paneer, sunflower oil, tomato",
      status: "draft",
      rawRequest: "20 kg paneer, 10 L sunflower oil, 5 kg tomatoes",
      deliveryWindow: "Thursday morning",
      replyByAt: Date.now() + replyByMinutes * 60_000,
      followUpAfterMs: followUpMinutes * 60_000,
    });
    for (const li of items) {
      await ctx.db.insert("rfqLineItems", {
        businessId,
        rfqId,
        productName: li.productName,
        canonicalName: canonicalName(li.productName),
        quantity: li.quantity,
        unit: li.unit,
      });
    }
    await ctx.scheduler.runAfter(0, internal.ai.draftRfq, { rfqId });
    return rfqId;
  },
});

export const sendTestRfq = internalMutation({
  args: { rfqId: v.id("rfqs") },
  handler: async (ctx, { rfqId }): Promise<{ workflowId: string; suppliers: number }> => {
    const rfq = await ctx.db.get(rfqId);
    if (!rfq || !rfq.draftBody) throw new ConvexError("Draft not ready yet.");
    const suppliers = await ctx.db
      .query("suppliers")
      .withIndex("by_business_status", (q) => q.eq("businessId", rfq.businessId).eq("status", "accepted"))
      .collect();
    for (const s of suppliers) {
      await ctx.db.insert("rfqSuppliers", { businessId: rfq.businessId, rfqId, supplierId: s._id, status: "queued" });
    }
    await ctx.db.patch(rfqId, { status: "sending" });
    const workflowId: string = await start(ctx, internal.workflow.rfqLifecycle, { rfqId }, {
      onComplete: internal.workflow.onLifecycleComplete,
      context: { rfqId },
    });
    await ctx.db.patch(rfqId, { workflowId });
    return { workflowId, suppliers: suppliers.length };
  },
});
