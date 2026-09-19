import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { canonicalName, ownedDoc, requireBusiness } from "./lib/access";
import { parseStatus } from "./schema";

// ---------------------------------------------------------------------------
// Attachments (SRC-10)
// ---------------------------------------------------------------------------

export const addAttachment = internalMutation({
  args: {
    quoteId: v.id("quotes"),
    storageId: v.id("_storage"),
    filename: v.string(),
    contentType: v.string(),
    size: v.number(),
    extractedText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) return;
    await ctx.db.insert("quoteAttachments", { businessId: quote.businessId, ...args });
  },
});

export const attachmentsReady = internalMutation({
  args: {
    quoteId: v.id("quotes"),
    notes: v.optional(v.string()),
    extraText: v.optional(v.string()),
  },
  handler: async (ctx, { quoteId, notes }) => {
    const quote = await ctx.db.get(quoteId);
    if (!quote) return;
    if (notes) {
      await ctx.db.patch(quoteId, {
        parseNotes: [quote.parseNotes, notes].filter(Boolean).join(" "),
      });
    }
  },
});

export const attachmentUrl = query({
  args: { attachmentId: v.id("quoteAttachments") },
  handler: async (ctx, { attachmentId }) => {
    const business = await requireBusiness(ctx);
    const att = await ownedDoc(ctx, business, "quoteAttachments", attachmentId);
    return await ctx.storage.getUrl(att.storageId);
  },
});

// ---------------------------------------------------------------------------
// Parse results (SRC-17)
// ---------------------------------------------------------------------------

const parsedLine = v.object({
  rfqLineItemId: v.optional(v.id("rfqLineItems")),
  productName: v.string(),
  unitPrice: v.number(),
  currency: v.string(),
  unit: v.string(),
  quantityAvailable: v.optional(v.number()),
  leadTimeDays: v.optional(v.number()),
  confidence: v.number(),
});

export const bundleForAi = internalQuery({
  args: { quoteId: v.id("quotes") },
  handler: async (
    ctx,
    { quoteId },
  ): Promise<{
    quote: Doc<"quotes">;
    rfq: Doc<"rfqs">;
    business: Doc<"businesses">;
    lineItems: Doc<"rfqLineItems">[];
    attachmentText: string | null;
  } | null> => {
    const quote = await ctx.db.get(quoteId);
    if (!quote) return null;
    const [rfq, business, lineItems, attachments] = await Promise.all([
      ctx.db.get(quote.rfqId),
      ctx.db.get(quote.businessId),
      ctx.db.query("rfqLineItems").withIndex("by_rfq", (q) => q.eq("rfqId", quote.rfqId)).collect(),
      ctx.db.query("quoteAttachments").withIndex("by_quote", (q) => q.eq("quoteId", quoteId)).collect(),
    ]);
    if (!rfq || !business) return null;
    const attachmentText = attachments
      .map((a) => a.extractedText)
      .filter(Boolean)
      .join("\n\n");
    return { quote, rfq, business, lineItems, attachmentText: attachmentText || null };
  },
});

export const setParsed = internalMutation({
  args: {
    quoteId: v.id("quotes"),
    parseStatus,
    confidence: v.number(),
    parseNotes: v.optional(v.string()),
    currency: v.optional(v.string()),
    deliveryFee: v.optional(v.number()),
    leadTimeDays: v.optional(v.number()),
    validUntil: v.optional(v.string()),
    items: v.array(parsedLine),
  },
  handler: async (ctx, args) => {
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) return;
    const old = await ctx.db
      .query("quoteLineItems")
      .withIndex("by_quote", (q) => q.eq("quoteId", args.quoteId))
      .collect();
    for (const row of old) await ctx.db.delete(row._id);
    for (const item of args.items) {
      await ctx.db.insert("quoteLineItems", {
        businessId: quote.businessId,
        quoteId: args.quoteId,
        rfqId: quote.rfqId,
        ...item,
      });
      // Every parsed quote is a price observation (SRC-26 trend view).
      await recordPrice(ctx, {
        businessId: quote.businessId,
        supplierId: quote.supplierId,
        productName: item.productName,
        unitPrice: item.unitPrice,
        currency: item.currency,
        unit: item.unit,
        source: "quote",
      });
    }
    await ctx.db.patch(args.quoteId, {
      parseStatus: args.parseStatus,
      confidence: args.confidence,
      parseNotes: args.parseNotes,
      currency: args.currency,
      deliveryFee: args.deliveryFee,
      leadTimeDays: args.leadTimeDays,
      validUntil: args.validUntil,
    });
    const rs = await ctx.db
      .query("rfqSuppliers")
      .withIndex("by_rfq_supplier", (q) =>
        q.eq("rfqId", quote.rfqId).eq("supplierId", quote.supplierId),
      )
      .unique();
    if (rs && args.parseStatus !== "failed") {
      await ctx.db.patch(rs._id, { status: "parsed" });
    }
  },
});

export async function recordPrice(
  ctx: { db: MutationCtx["db"] },
  p: {
    businessId: Id<"businesses">;
    supplierId: Id<"suppliers">;
    productName: string;
    unitPrice: number;
    currency: string;
    unit: string;
    source: "catalog" | "quote" | "order";
    sourceUrl?: string;
  },
) {
  const canonical = canonicalName(p.productName);
  const previous = await ctx.db
    .query("priceHistory")
    .withIndex("by_business_product_time", (q) =>
      q.eq("businessId", p.businessId).eq("canonicalName", canonical),
    )
    .order("desc")
    .first();
  await ctx.db.insert("priceHistory", {
    businessId: p.businessId,
    supplierId: p.supplierId,
    productName: p.productName,
    canonicalName: canonical,
    unitPrice: p.unitPrice,
    currency: p.currency,
    unit: p.unit,
    source: p.source,
    sourceUrl: p.sourceUrl,
    observedAt: Date.now(),
    deltaFromPrevious: previous ? p.unitPrice - previous.unitPrice : undefined,
  });
}

// ---------------------------------------------------------------------------
// Owner review of a low-confidence parse
// ---------------------------------------------------------------------------

export const review = mutation({
  args: {
    quoteId: v.id("quotes"),
    lines: v.array(
      v.object({
        rfqLineItemId: v.id("rfqLineItems"),
        unitPrice: v.number(),
        unit: v.string(),
        leadTimeDays: v.optional(v.number()),
      }),
    ),
    deliveryFee: v.optional(v.number()),
  },
  handler: async (ctx, { quoteId, lines, deliveryFee }) => {
    const business = await requireBusiness(ctx);
    const quote = await ownedDoc(ctx, business, "quotes", quoteId);
    const old = await ctx.db
      .query("quoteLineItems")
      .withIndex("by_quote", (q) => q.eq("quoteId", quoteId))
      .collect();
    for (const row of old) await ctx.db.delete(row._id);
    for (const line of lines) {
      const li = await ownedDoc(ctx, business, "rfqLineItems", line.rfqLineItemId);
      if (!(line.unitPrice >= 0)) throw new ConvexError(`Set a price for ${li.productName}.`);
      await ctx.db.insert("quoteLineItems", {
        businessId: business._id,
        quoteId,
        rfqId: quote.rfqId,
        rfqLineItemId: li._id,
        productName: li.productName,
        unitPrice: line.unitPrice,
        currency: quote.currency ?? business.currency,
        unit: line.unit,
        leadTimeDays: line.leadTimeDays,
        confidence: 1,
      });
    }
    await ctx.db.patch(quoteId, {
      parseStatus: "parsed",
      confidence: 1,
      deliveryFee,
      reviewedAt: Date.now(),
      parseNotes: "Confirmed by owner.",
    });
    await ctx.scheduler.runAfter(0, internal.ai.rankQuotes, { rfqId: quote.rfqId });
  },
});

export const reparse = mutation({
  args: { quoteId: v.id("quotes") },
  handler: async (ctx, { quoteId }) => {
    const business = await requireBusiness(ctx);
    await ownedDoc(ctx, business, "quotes", quoteId);
    await ctx.db.patch(quoteId, { parseStatus: "pending" });
    await ctx.scheduler.runAfter(0, internal.ai.parseQuote, { quoteId });
  },
});

// ---------------------------------------------------------------------------
// Ranking (SRC-18)
// ---------------------------------------------------------------------------

export type RankingQuote = {
  _id: Id<"quotes">;
  supplierId: Id<"suppliers">;
  supplierName: string;
  parseStatus: Doc<"quotes">["parseStatus"];
  deliveryFee: number | undefined;
  leadTimeDays: number | undefined;
  isLate: boolean;
  lines: Array<{
    rfqLineItemId: Id<"rfqLineItems"> | undefined;
    productName: string;
    unitPrice: number;
    unit: string;
    leadTimeDays: number | undefined;
  }>;
};

export const rankingBundle = internalQuery({
  args: { rfqId: v.id("rfqs") },
  handler: async (
    ctx,
    { rfqId },
  ): Promise<{
    rfq: Doc<"rfqs">;
    business: Doc<"businesses">;
    lineItems: Doc<"rfqLineItems">[];
    quotes: RankingQuote[];
  } | null> => {
    const rfq = await ctx.db.get(rfqId);
    if (!rfq) return null;
    const business = await ctx.db.get(rfq.businessId);
    if (!business) return null;
    const lineItems = await ctx.db
      .query("rfqLineItems")
      .withIndex("by_rfq", (q) => q.eq("rfqId", rfqId))
      .collect();
    const all = await ctx.db
      .query("quotes")
      .withIndex("by_rfq", (q) => q.eq("rfqId", rfqId))
      .collect();
    // Latest usable quote per supplier.
    const latest = new Map<string, (typeof all)[number]>();
    for (const q of all.sort((a, b) => b.receivedAt - a.receivedAt)) {
      if (q.parseStatus === "pending" || q.parseStatus === "failed") continue;
      if (!latest.has(q.supplierId)) latest.set(q.supplierId, q);
    }
    const quotes = await Promise.all(
      Array.from(latest.values()).map(async (q) => {
        const supplier = await ctx.db.get(q.supplierId);
        const lines = await ctx.db
          .query("quoteLineItems")
          .withIndex("by_quote", (qq) => qq.eq("quoteId", q._id))
          .collect();
        return {
          _id: q._id,
          supplierId: q.supplierId,
          supplierName: supplier?.name ?? "Supplier",
          parseStatus: q.parseStatus,
          deliveryFee: q.deliveryFee,
          leadTimeDays: q.leadTimeDays,
          isLate: q.isLate,
          lines: lines.map((l) => ({
            rfqLineItemId: l.rfqLineItemId,
            productName: l.productName,
            unitPrice: l.unitPrice,
            unit: l.unit,
            leadTimeDays: l.leadTimeDays,
          })),
        };
      }),
    );
    return { rfq, business, lineItems, quotes };
  },
});

export const applyRanking = internalMutation({
  args: {
    rfqId: v.id("rfqs"),
    ranking: v.array(
      v.object({
        quoteId: v.id("quotes"),
        rank: v.number(),
        landedTotal: v.number(),
        coverage: v.number(),
        rationale: v.string(),
      }),
    ),
    summary: v.string(),
    bestPerLine: v.array(
      v.object({ rfqLineItemId: v.id("rfqLineItems"), supplierId: v.id("suppliers") }),
    ),
  },
  handler: async (ctx, { rfqId, ranking, summary, bestPerLine }) => {
    for (const r of ranking) {
      await ctx.db.patch(r.quoteId, {
        rank: r.rank,
        landedTotal: r.landedTotal,
        coverage: r.coverage,
        rationale: r.rationale,
      });
    }
    // Suggest a supplier per line unless the owner already chose one.
    for (const b of bestPerLine) {
      const li = await ctx.db.get(b.rfqLineItemId);
      if (li && !li.chosenSupplierId) {
        await ctx.db.patch(b.rfqLineItemId, { chosenSupplierId: b.supplierId });
      }
    }
    await ctx.db.patch(rfqId, { recommendationSummary: summary });
  },
});
